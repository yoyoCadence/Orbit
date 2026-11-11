# HW-112 提案：佐證照片雲端同步（Supabase Storage）

> 狀態：提案（只寫文件），等擁有者決定 §9。2026-11-11 使用者要求寫提案（「好你寫提案我看看」）。核准前不改程式、不動 production。

## 1. 結論

- **要解決的問題**：佐證照片只存在拍照的那台裝置。換手機、重新安裝或刪掉主畫面圖示，照片就沒了；另一台裝置也看不到。
- **建議做法**：
  - 新增一個私有的 Storage bucket `proofs`，路徑是 `{user_id}/{session_id}.jpg`。
  - 照 CLAUDE.md 的 Storage 規則寫四個 policy，都只給 `authenticated`，並用 `storage.foldername(name)[1]` 限定只能動自己的資料夾。
  - 已登入的人拍照後，照片同時存在本機與雲端；離線時排隊，連線後補傳。
  - 其他裝置只在畫面上要顯示某張照片時才下載，存進有上限的快取（不放 localStorage，§5.3）。
  - 訪客不變，照片只存本機。
- **拆成三步**（和 PRO-014L 一樣，資料庫先於 client）：
  1. **HW-112A**（repo）：migration 016（bucket＋policy）與資料庫測試；
  2. **HW-112B**（擁有者）：在 production 套用 016；
  3. **HW-112C**（repo）：client 上傳、補傳、下載、刪除。

## 2. 現況（2026-11-11 的 main）

- **拍照與壓縮**：`pwa/js/ui/proofSheet.js` → `pwa/js/platform/proofCapture.js` 的 `compressImage()`。
  - 縮到最長邊 320px、JPEG 品質 0.5，存成 base64 data URL。一張大約 10–40 KB。
- **儲存**：`pwa/js/platform/proofStore.js`。
  - `localStorage` 的 `orbit_proof_<sessionId>`，一張一個 key。
  - 刻意不跟著登出清除（`storage.clearAll()` 不刪）。
  - key 沒有帳號資訊，同一台裝置換帳號時，看得到誰的照片只靠 sessionId。
- **顯示的地方**：
  - 紀錄列的縮圖與全螢幕檢視（`ui/sessionRow.js`）；
  - 首頁與個人空間的「成就照片」（`resolveAchievementPhoto()`）。這個選擇也只存本機（`orbit_achievement_photo_<ownerId>`）。
- **設定頁**：顯示張數與大小，可以一鍵全部刪除（`clearAllProofs()`）。這個刪除不分帳號：同一台裝置上所有帳號的照片與成就照片的選擇都會刪掉。
- **沒有重拍**：拍照的畫面只在完成紀錄時出現一次（`sessionFlow.js`），之後不能換照片。
- **刪除紀錄時不會刪照片**：`orbit_proof_<sessionId>` 會留在本機，變成沒人用的資料。
- **已有的範例**：頭像在 `avatars` bucket（`pwa/db/003_storage.sql`），路徑 `{user_id}/…`、四個 policy、私有 bucket、用 signed URL 讀取（`storage.js` 的 `uploadAvatar()`／`resolveAvatarUrl()`）。這次照同樣的模式做。
- **CSP 不用改**：`img-src` 已經允許 `data:`、`blob:` 與 Supabase 的網域，`connect-src` 允許 Supabase 的網域。
- **紀錄的 id**：由 client 以 `crypto.randomUUID()` 產生，上傳到 `sessions` 時不變，所以 `{user_id}/{session_id}.jpg` 在每台裝置上都一樣。
- **localStorage 的空間**：同一個網域約 5 MB，與紀錄、待同步資料、刪除紀錄、背景圖共用。現在本機的照片已經佔用其中一部分；下載的照片不能再放進去（§5.3）。

## 3. 目標與不做的事

- **目標**：
  - 已登入的人在任何裝置都看得到自己的佐證照片；
  - 換裝置、重新安裝、刪掉圖示後照片還在；
  - 只有本人能讀、寫、刪自己的照片。
- **不做**：
  - 訪客的雲端備份（沒有帳號，就沒有可以綁定的 user_id）；
  - 分享給別人看（排行榜不顯示佐證照片）；
  - 提高照片解析度（列為 §9 的選項，預設不改）；
  - 同步「成就照片」的選擇（另案，見 §9）。

## 4. 資料庫與 Storage（HW-112A）

migration `pwa/db/016_proof_storage.sql`：

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proofs', 'proofs', false, 204800, ARRAY['image/jpeg']);

-- 物件名稱限定為 {自己的 user_id}/{UUID}.jpg（避免任意路徑與檔名）
CREATE POLICY "proofs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "proofs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$'));

CREATE POLICY "proofs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND name ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.jpg$'));

CREATE POLICY "proofs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]);
```

- **私有 bucket**：`public = false`，沒有公開網址，只能帶登入的 token 下載。
- **大小與格式**：bucket 層級限制每個檔案 200 KB、只收 `image/jpeg`。目前一張不到 40 KB。格式檢查依 client 送出的 Content-Type，不檢查檔案內容；這只防寫錯，不防故意的人（他也只能放進自己的資料夾）。
- **四個 policy 都要**（CLAUDE.md）：SELECT 用 USING、INSERT 用 WITH CHECK、UPDATE 兩個都有、DELETE 用 USING，都只給 `authenticated`。`anon` 沒有任何 policy。
- **沒有每人上限**：policy 不限張數，任何帳號都可以把免費方案的 1 GB 塞滿（只能放自己的資料夾）。目前帳號少，先不做；要做的話是 §9 第 8 點。
- **測試**：
  - 本機的 PG16 只有手寫的 auth schema，沒有 Supabase 的 Storage（之前的本機測試也跳過了 003 與 010），在那裡測只是在測自己寫的假表。
  - 建議改用 Supabase CLI 的本機環境（`supabase start`，需要 Docker），以真的 Storage API 測：本人可以上傳、讀、刪自己的檔案；不能碰別人的資料夾；不能寫到資料夾以外或不合規則的檔名；`anon` 什麼都不能做；超過 200 KB 或不是 JPEG 會被拒。
  - 若這個環境沒有 Docker：套用前在 production 以 `begin … rollback` 乾跑 migration 與權限的 ASSERT（先確認 Storage 的 trigger 允許），套用後再以兩個測試帳號實測上傳、讀、刪。
  - 「policy 的數量」要限定範圍：`storage.objects` 上已經有頭像的 5 個 policy。同一個操作的 permissive policy 是 OR 起來的，所以還要確認其他 policy 都限定在自己的 bucket（例如頭像的 `avatars_select_public_leaderboard_profiles` 只看 `avatars`），不會讓 `proofs` 的檔案被別人讀到。
- **回滾**（寫在 migration 末段）：
  1. HW-112C 上線後，雲端可能有其他裝置已經沒有的照片，**不能直接清空 bucket**。先把 client 退回不上傳的版本；
  2. 資料要保留：只拿掉 INSERT／UPDATE policy（不再接受新檔案），或先匯出再刪；
  3. 刪除檔案用 Dashboard 或 Storage API，不要用 SQL 直接刪 `storage.objects`（新版 Storage 會擋）。

## 5. Client（HW-112C）

### 5.1 上傳

- 拍照存檔時（`proofSheet.js` 的 `saveProof()` 之後），已登入就把這張照片上傳到 `proofs/{user_id}/{session_id}.jpg`。
  - 上傳的是 Blob（`contentType: 'image/jpeg'`），不是 data URL 字串（字串會以 text/plain 送出而被拒）。
  - 舊的 png／webp 照片（`isSupportedProofDataUrl()` 接受）先重新編碼成 JPEG。
  - `upsert: false`：沒有重拍的功能，同一筆紀錄只會有一張；伺服器回 409（已存在）就當作完成。
- 上傳前與上傳後都確認帳號沒換（`_assertOwner`）。
- 失敗或離線時排進待傳清單（`orbit_proof_upload_pending:<ownerId>`，存 sessionId，不存圖片本身），沿用既有的「連線恢復同步」與「開機背景同步」時機補傳，一次最多 10 張。
- **上傳完成後再檢查一次這筆紀錄還在**（紀錄清單與刪除紀錄 `sessionDeletionLog`）：上傳期間被刪掉的話，馬上把雲端的檔案刪掉，避免留下沒人用的檔案。

### 5.2 已經在本機的舊照片

- 第一次登入新版時，把本機屬於這個帳號紀錄的照片排進待傳清單，慢慢補傳（`upsert: false`，已經在雲端的會回 409，當作完成）。
- 判斷「屬於這個帳號」：照片的 sessionId 出現在這個帳號的紀錄裡。別的帳號或訪客留下的照片不會上傳。
- 已知限制：`loadFromRemote()` 讀紀錄沒有分頁，超過 PostgREST 的上限（預設 1000 筆）的舊紀錄不在本機清單裡，它們的照片不會被補傳。目前帳號都遠低於這個數字；碰到時另外處理。

### 5.3 下載

- **不用清單判斷有沒有照片**：`list()` 一次最多回 100 筆（SDK 預設 `limit: 100`），超過就會把存在的照片誤判為沒有。改成需要哪張就直接 `download('{user_id}/{session_id}.jpg')`：
  - 成功：顯示；
  - 404／400：記下「這筆沒有雲端照片」，同一個帳號在這次開啟內不再問（快取以帳號區分，登出時清掉）；
  - 其他錯誤（離線、逾時）：不記，之後再試。
- **只下載畫面上看得到的**：完成紀錄頁對 Pro 使用者會一次畫出所有紀錄，若每一列都下載，第一次進去就等於全部下載。以 IntersectionObserver 只抓進入畫面的列，同時最多 3 個請求。
- **下載的照片不放 localStorage**：
  - 放在有上限的快取（建議 Cache API 的 `orbit-proofs-<ownerId>`，或 IndexedDB），例如最多 300 張或 15 MB，超過時刪掉最久沒看的；
  - 顯示時轉成 `blob:` URL（CSP 已允許）；
  - 登出時清掉這個帳號的快取（§5.5）。
  - 自己在這台裝置拍的照片維持現在的做法（存在 localStorage），不在這次搬家。
- **顯示的程式要改**：`proofControlsHtml()`（紀錄列）與 `resolveAchievementPhoto()`（成就照片）現在是同步的，本機沒有照片時就顯示空白或預留圖。要加「先顯示預留圖、下載完再重畫那一格」的流程。

### 5.4 刪除

- 刪除一筆紀錄時，連同本機與雲端的照片一起刪，並從待傳清單移除。
- 雲端刪除沿用既有的刪除紀錄（`sessionDeletionLog`）重試，不另外做一個清單。
- `remove()` 在檔案不存在（或看不到）時也回成功：當作已刪除。
- 順手修現況的小問題：刪除紀錄時本機的照片也一起刪（目前會留下）。
- 本機刪除照片的函式放在新模組 `proofSync.js`（不是在 `proofStore.js` 加新 export 給 `sessionFlow.js` 用），符合 INFRA-105。

### 5.5 登出與換帳號

- `handleSignOut()` 不會重新載入頁面，所以所有快取（「這筆沒有雲端照片」、下載的照片）都以帳號區分，登出時清掉。
- 每次下載完、寫進快取前、補傳每一張前，都確認帳號沒換。
- 自己拍的、存在 localStorage 的照片怎麼處理，見 §9 第 5 點。
- **待傳中的照片不能被清掉**：「清除這台裝置的照片」或登出時清除本機副本，都要跳過還在待傳清單的照片，否則它們會永遠消失。

### 5.6 INFRA-105

- 上傳、下載、快取、待傳清單、刪除都放在新模組 `pwa/js/platform/proofSync.js`，加進 SHELL。
- 既有模組只 import 它的新 export；它只 import 既有模組已經有的 export。

## 6. 容量與費用

- 存到雲端的是 JPEG 本身，大約是 data URL 長度的 ¾，一張約 8–30 KB。
- 每天 3 張、一年約 1,100 張，大約 10–35 MB／人。
- Supabase 免費方案的 Storage 是 1 GB，下載流量 5 GB／月（以目前方案為準，套用前再確認）。目前帳號很少，用不到上限。
- 之後使用者變多時，可以把雲端備份列為 Pro 功能，或對每個帳號設上限（§9 第 3、8 點）。

## 7. 驗收

- 已登入：在 A 裝置拍照 → 在 B 裝置登入同一帳號，捲到那筆紀錄時看到同一張照片。
- 刪掉主畫面圖示重新加入、登入後，照片還在。
- 離線拍照 → 連線後自動補傳。
- 刪除紀錄 → 兩台裝置都看不到那張照片；上傳到一半刪除也不會在雲端留下檔案。
- 另一個帳號讀不到、刪不掉別人的照片（Storage 測試與真機各確認一次）。
- 完成紀錄頁有上百筆紀錄時，進去不會一次下載全部，localStorage 的用量不變。
- 訪客模式和現在一樣，只存本機。
- 程式碼沒有 `service_role`。

## 8. 風險

- **Storage 的 policy 寫錯就是隱私問題**：四個 policy 用和頭像相同、已在 production 使用的寫法，再加上檔名限制；以真的 Storage API 測跨帳號存取，套用後再以兩個測試帳號實測。
- **刪除帳號時照片不會自動刪**：Storage 的檔案不會跟著 `auth.users` 一起刪。app 目前沒有刪除帳號的功能；之後加的時候要一起處理（記在 tasks.md）。
- **舊版 client**：還沒更新的裝置只存本機，不會上傳，也不會壞；更新後補傳。
- **空間**：下載的照片放在有上限的快取，不會擠爆 localStorage；自己拍的照片仍在 localStorage，和現在一樣。

## 9. 需要擁有者決定

1. **拆成 HW-112A → HW-112B → HW-112C**（建議），或一次做完。
2. **解析度**：維持 320px、品質 0.5（建議：和現在一樣，容量小，自己拍的照片也還放在 localStorage），或雲端版改成 640px、品質 0.6（一張約 40–80 KB，看起來比較清楚；雲端容量與下載量約三倍，快取能放的張數變少）。
3. **誰可以用**：所有已登入的人（建議，目前帳號少、容量小），或只給 Pro。
4. **設定頁「全部刪除」**：
   - A（建議）：分成兩個按鈕，「清除這台裝置的照片」（只清目前帳號、跳過待傳中的，雲端還在）和「刪除所有佐證照片」（含雲端，要再確認一次）；
   - B：維持一個按鈕，只刪本機（但改成只刪目前帳號、跳過待傳中的）。
5. **登出時，自己拍、存在 localStorage 的照片**：
   - A：保留（和現在一樣）。但有雲端同步後，在別人的裝置登入一次，自己拍的照片會一直留在那台裝置上；下載的照片則會在登出時清掉；
   - B（建議）：登出時刪掉已經上傳完成的本機照片（待傳中的保留），再登入時從雲端重新下載。共用或借用的裝置比較安全。
6. **既有的本機照片**：第一次登入新版時自動補傳（建議），或只傳之後新拍的。
7. **成就照片的選擇**（首頁與個人空間的那一張）：這次不同步（建議，另列任務），或一起存到 profile。
8. **每個帳號的雲端上限**：先不設（建議，帳號少），或現在就設（例如 2,000 張；需要額外的 policy 或 RPC）。
9. **資料庫測試的方式**：用 Supabase CLI 的本機環境（建議，需要 Docker；這個雲端環境能不能跑要先試），或在 production 以 `begin … rollback` 乾跑加上測試帳號實測。

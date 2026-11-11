# HW-112 提案：佐證照片雲端同步（Supabase Storage）

> 狀態：提案（只寫文件），等擁有者決定 §9。2026-11-11 使用者要求寫提案（「好你寫提案我看看」）。核准前不改程式、不動 production。

## 1. 結論

- **要解決的問題**：佐證照片只存在拍照的那台裝置。換手機、重新安裝或刪掉主畫面圖示，照片就沒了；另一台裝置也看不到。
- **建議做法**：
  - 新增一個私有的 Storage bucket `proofs`，路徑是 `{user_id}/{session_id}.jpg`。
  - 照 CLAUDE.md 的 Storage 規則寫四個 policy，都只給 `authenticated`，並用 `storage.foldername(name)[1]` 限定只能動自己的資料夾。
  - 已登入的人拍照後，照片同時存在本機與雲端；離線時排隊，連線後補傳。
  - 其他裝置需要顯示時才下載，下載後存一份在本機。
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
- **設定頁**：顯示張數與大小，可以一鍵全部刪除（`clearAllProofs()`）。
- **刪除紀錄時不會刪照片**：`orbit_proof_<sessionId>` 會留在本機，變成沒人用的資料。
- **已有的範例**：頭像在 `avatars` bucket（`pwa/db/003_storage.sql`），路徑 `{user_id}/…`、四個 policy、私有 bucket、用 signed URL 讀取（`storage.js` 的 `uploadAvatar()`／`resolveAvatarUrl()`）。這次照同樣的模式做。
- **CSP 不用改**：`img-src` 與 `connect-src` 已經允許 Supabase 的網域。

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

CREATE POLICY "proofs_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "proofs_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "proofs_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "proofs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'proofs'
    AND auth.uid()::text = (storage.foldername(name))[1]);
```

- **私有 bucket**：`public = false`，沒有公開網址，只能用 signed URL 或帶 token 的下載。
- **大小與格式**：bucket 層級限制每個檔案 200 KB、只收 `image/jpeg`。目前一張不到 40 KB，留了餘裕；client 寫錯也傳不上去。
- **四個 policy 都要**（CLAUDE.md）：SELECT 用 USING、INSERT 用 WITH CHECK、UPDATE 兩個都有、DELETE 用 USING，都只給 `authenticated`。`anon` 沒有任何 policy，什麼都不能做。
- **測試**（`tests/database/hw112.test.sql`，ASSERT 寫法，和 012 一樣在本機 PG 跑）：
  - 本人可以上傳、讀、覆寫、刪除自己資料夾的檔案；
  - 不能讀、寫、刪別人資料夾的檔案；
  - 不能寫到資料夾以外（例如 `proofs/x.jpg`）；
  - `anon` 什麼都不能做；
  - policy 恰好四個，都只給 `authenticated`。
  - 本機的 PG 沒有 Supabase Storage 的服務，只能測 `storage.objects` 上的 policy；bucket 的大小與格式限制要在套用後於 production 以 Dashboard 確認（HW-112B 的步驟）。
- **回滾**：刪掉四個 policy 與 bucket（bucket 必須是空的；有檔案時先在 Dashboard 清空）。寫在 migration 末段的註解。

## 5. Client（HW-112C）

### 5.1 上傳

- 拍照存檔時（`proofSheet.js` 的 `saveProof()` 之後），已登入就把同一張 JPEG 上傳到 `proofs/{user_id}/{session_id}.jpg`（`upsert: true`，同一筆紀錄重拍會覆蓋）。
- 只傳屬於目前帳號的紀錄：以 `db._session()` 確認帳號沒換。
- 失敗或離線時排進待傳清單（`orbit_proof_upload_pending:<ownerId>`，存 sessionId，不存圖片本身），沿用既有的「連線恢復同步」與「開機背景同步」時機補傳。
- 一次補傳最多幾張（例如 10 張），避免剛連線時一次佔滿網路。

### 5.2 已經在本機的舊照片

- 第一次登入新版時，把本機屬於這個帳號紀錄的照片排進待傳清單，慢慢補傳。
- 判斷「屬於這個帳號」：照片的 sessionId 出現在這個帳號的紀錄裡。別的帳號或訪客留下的照片不會上傳。

### 5.3 下載

- 紀錄列、成就照片需要某張照片，而本機沒有時：
  - 先查雲端有哪些照片：一次 `storage.from('proofs').list(user_id)`，結果在記憶體裡快取到這次開啟結束；
  - 有的話用 `download()` 取回，存成本機的 data URL（和現在的格式一樣，其餘程式不用改）；
  - 沒有的話記下「沒有」，這次開啟內不再問。
- 這樣新裝置只有在看到紀錄時才下載，不會一登入就把全部照片抓下來。

### 5.4 刪除

- 刪除一筆紀錄時，連同本機與雲端的照片一起刪。雲端刪除失敗時排進待刪清單，之後重試。
- 設定頁的「全部刪除」：見 §9 第 4 點。
- 順手修現況的小問題：刪除紀錄時本機的照片也一起刪（目前會留下）。

### 5.5 登出與換帳號

- 現在的照片 key 沒有帳號，登出時也不刪。雲端同步之後，這台裝置上的照片可以隨時從雲端取回，見 §9 第 5 點要不要在登出時清掉本機副本。

### 5.6 INFRA-105

- 上傳、下載、待傳清單放在新的模組（例如 `pwa/js/platform/proofSync.js`），加進 SHELL。
- 既有模組只 import 它的新 export；它只 import 既有模組已經有的 export。

## 6. 容量與費用

- 一張 10–40 KB。每天 3 張、一年約 1,100 張，大約 20–40 MB／人。
- Supabase 免費方案的 Storage 是 1 GB，下載流量 5 GB／月（以目前方案為準，套用前再確認）。目前帳號數量很少，用不到上限。
- 之後使用者變多時，可以把佐證雲端備份列為 Pro 功能，或對每個帳號設上限（§9 第 3 點）。

## 7. 驗收

- 已登入：在 A 裝置拍照 → 在 B 裝置登入同一帳號，看到同一張照片。
- 刪掉主畫面圖示重新加入、登入後，照片還在。
- 離線拍照 → 連線後自動補傳。
- 刪除紀錄 → 兩台裝置都看不到那張照片。
- 另一個帳號讀不到、刪不掉別人的照片（資料庫測試與真機各確認一次）。
- 訪客模式和現在一樣，只存本機。
- 程式碼沒有 `service_role`。

## 8. 風險

- **Storage 的 policy 寫錯就是隱私問題**：四個 policy 都用和頭像相同、已在 production 使用的寫法，資料庫測試涵蓋跨帳號存取，套用後再以兩個測試帳號實測。
- **刪除帳號時照片不會自動刪**：Storage 的檔案不會跟著 `auth.users` 一起刪。app 目前沒有刪除帳號的功能；之後加的時候要一起處理（記在 tasks.md）。
- **舊版 client**：還沒更新的裝置只存本機，不會上傳，也不會壞；更新後補傳。
- **流量**：下載只在需要時進行，並快取在本機；成就照片與紀錄列不會重複下載同一張。

## 9. 需要擁有者決定

1. **拆成 HW-112A → HW-112B → HW-112C**（建議），或一次做完。
2. **解析度**：維持 320px、品質 0.5（建議：和現在一樣，容量小），或雲端版改成 640px、品質 0.6（一張約 50–100 KB，看起來比較清楚，容量約多三倍）。
3. **誰可以用**：所有已登入的人（建議，目前帳號少、容量小），或只給 Pro。
4. **設定頁「全部刪除」**：
   - A（建議）：分成兩個按鈕，「清除這台裝置的照片」（雲端還在，之後可再下載）和「刪除所有佐證照片」（含雲端，要再確認一次）；
   - B：維持一個按鈕，只刪本機。
5. **登出時**：
   - A（建議）：保留本機照片（和現在一樣；同一台裝置換帳號時，看不到別人的照片，因為照片只依自己帳號的紀錄顯示）；
   - B：登出時刪掉本機副本（共用裝置比較安全，再登入時從雲端重新下載）。
6. **既有的本機照片**：第一次登入新版時自動補傳（建議），或只傳之後新拍的。
7. **成就照片的選擇**（首頁與個人空間的那一張）：這次不同步（建議，另列任務），或一起存到 profile。

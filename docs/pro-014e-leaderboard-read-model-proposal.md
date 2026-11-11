# PRO-014E 提案：排行榜的公開名稱與安全讀取

> 狀態：提案（只寫文件），等擁有者決定 §9。2026-11-11 使用者要求寫提案（「好你寫提案我看看」）。核准前不改程式、不動 production。

## 1. 結論

- **最主要的問題**：排行榜顯示的是 `profiles.name`，而這個名稱是註冊時自動帶入的（`handle_new_user()`，013）：
  - **email 註冊**：`auth.js` 的 `signUp()` 不帶名稱，所以**每一個** email 帳號的名稱都是 email 的 @ 前面那段；
  - **Google 登入**：名稱是 Google 帳號的全名，通常是真名。
  
  沒改過名稱的人一打開「顯示於排行榜」，其他登入的人就看得到他的 email 前段或真名。
- **其次**：
  - `leaderboard_view` 回傳每個公開使用者的 `user_id`（UUID）與完整的加入時間（頭像路徑本身也以 user_id 開頭，§8）；
  - view 以擁有者的權限執行、不受 RLS 限制，只靠 `WHERE is_public` 與欄位清單把關，client 用 `select('*')` 讀，之後有人在 view 加欄位就會直接公開；
  - PRO-014F 要在排行榜顯示 Pro，需要每個公開使用者的 Pro 狀態，而且必須來自 server（`pro_entitlements`），不能是 profile 裡 client 可寫的 `is_pro`。
- **建議**：
  - `profiles` 加一個 `display_name`（公開名稱），開啟排行榜時要自己設定；排行榜只顯示它，不再顯示 `name`。
  - 排行榜改成一個 RPC `get_leaderboard()`：只回傳排行榜要的欄位，用 `is_me` 取代 `user_id` 欄位，加上 server 判定的 `is_pro`。
  - 公開名稱與「顯示於排行榜」不跟著整份 profile 同步，改由單獨、等待結果的寫入（§5），避免另一台裝置的舊資料把它蓋掉。
  - 拆成 E1（migration＋測試）→ EA（擁有者套用）→ E2（client）→ E3（之後移除舊的 view）。

## 2. 現況（2026-11-11 的 main）

- **profiles**（001、005）：
  - `name text NOT NULL CHECK (char_length(name) <= 30)`；個人頁可以改（輸入框 `maxlength="20"`）。
  - `is_public boolean`（005），設定頁的「顯示於排行榜」開關，預設關閉。
  - `avatar_url`（001）存 Storage 路徑 `{user_id}/avatar-….jpg`；較早的資料可能是完整的 https 網址（`upsertProfile()` 的退路）。
  - `is_public` 跟著整份 profile 由 `saveUser()` 上傳（`PROFILE_FIELDS`），所以另一台資料較舊的裝置同步時，可能把開關蓋回舊值。
- **註冊**：`handle_new_user()` 寫入 `left(COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)), 30)`。
  - `pwa/js/auth.js` 的 email 註冊呼叫 `signUp({ email, password })`，沒有 `options.data`，所以 `raw_user_meta_data->>'name'` 是空的，名稱一律是 email 前段；
  - Google 登入時 Supabase 把 Google 的全名放進 `raw_user_meta_data->>'name'`，名稱就是真名。
- **leaderboard_view**（005 建立、010 改寫、015 收回 anon 權限）：
  - 欄位：`user_id, name, total_xp, streak_days, mode, created_at, week_xp, avatar_url`；
  - `WHERE p.is_public = true`；
  - 以 view 擁有者（postgres）的權限執行，不受 `profiles`／`sessions` 的 RLS 限制；
  - 只有 `authenticated` 可以 SELECT（015）。
- **頭像**：010 的 `avatars_select_public_leaderboard_profiles` 讓登入的人讀公開使用者的頭像（以路徑第一段的 user_id 判斷）。
- **client**（`pwa/js/pages/leaderboard.js`）：
  - `supabase.from('leaderboard_view').select('*')`，結果快取在本機；
  - 用 `user_id === state.user.id` 標出自己；
  - 依自己的 `mode` 篩選，算本週 XP、成長率（用 `created_at`）、總 XP 三種排名；
  - 頭像以 `createSignedUrl()` 換成 7 天的網址。
- **Pro**：PRO-014H（v1.41.15）後，Pro 只看 `pro_entitlements`（`my_pro_status()`），只能查自己。

## 3. 目標與不做的事

- **目標**：
  - 排行榜只顯示使用者自己選的公開名稱；
  - 排行榜的資料只包含排名需要的欄位，新增欄位必須明確寫進 RPC；
  - 提供 PRO-014F 需要的 Pro 標記，來源是 server；
  - 未登入的人什麼都讀不到（維持 015）。
- **不做**：
  - 排行榜的 Pro 光暈與 Personal Space 的 Pro 呈現（PRO-014F）；
  - 把頭像路徑改成不含 user_id（見 §8）；
  - 名稱的內容審查（髒話過濾等）。

## 4. 資料庫（E1）

migration（編號用下一個可用的；HW-112A 若先用 016，這裡就是 017）：

```sql
-- 1. 公開名稱：1–20 字，前後沒有空白，不含控制字元、零寬字元與方向控制字元
ALTER TABLE public.profiles
  ADD COLUMN display_name text
  CONSTRAINT profiles_display_name_check CHECK (display_name IS NULL OR (
    char_length(display_name) BETWEEN 1 AND 20
    AND display_name ~ '^\S(.*\S)?$'
    AND display_name !~ '[[:cntrl:]\u00a0\u200b-\u200f\u2028-\u202f\u205f-\u206f\u3000\ufeff]'
  ));

-- 2. 排行榜 RPC：只回傳需要的欄位
CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  display_name text,
  avatar_path  text,
  total_xp     int,
  week_xp      bigint,
  streak_days  int,
  mode         text,
  joined_on    date,
  is_me        boolean,
  is_pro       boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.display_name,
    p.avatar_url,
    p.total_xp,
    COALESCE(w.week_xp, 0),
    p.streak_days,
    p.mode,
    p.created_at::date,
    p.user_id = auth.uid(),
    COALESCE(public.is_pro_active(e.is_pro, e.pro_expires_at, e.trial_started_at), false)
  FROM public.profiles p
  LEFT JOIN (
    SELECT s.user_id, SUM(s.final_xp) AS week_xp
    FROM public.sessions s
    WHERE s.date >= CURRENT_DATE - 6 AND s.is_productive_xp = true
    GROUP BY s.user_id
  ) w ON w.user_id = p.user_id
  LEFT JOIN public.pro_entitlements e ON e.user_id = p.user_id
  WHERE p.is_public = true
    AND p.display_name IS NOT NULL
    AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_leaderboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;
```

- **RLS 不變**：`display_name` 是 `profiles` 的欄位，沿用 002 的四個 owner-only policy；只有本人能寫自己的公開名稱。
- **名稱的限制**：`btrim()` 只去掉 ASCII 空白，所以改用「第一個與最後一個字不是空白」的寫法，並擋掉全形空白（U+3000）、不換行空白、零寬字元與方向控制字元（例如 U+202E），避免全空白或偽裝的名稱。client 以完全相同的規則先檢查（§5）；不符合的名稱在 client 就擋下，不會送到 server。正規式的細節（PostgreSQL 的 `\S` 依 locale 而定，所以全形空白另外列出）在 E1 以測試確認。
- **`SECURITY DEFINER` 的理由**：排行榜要讀別人的 profile 與 sessions 加總，RLS 不允許；函式只回傳上面列出的欄位，`search_path = ''`，所有名稱都加 schema。`is_pro_active()` 在 011 對 `authenticated` 收回了執行權，函式以擁有者的權限呼叫它，不需要重新開放。
- **`is_pro`** 只是顯示用（PRO-014F）。任何有價值的 Pro 功能仍由 server 自己檢查，不能相信這個欄位（PRO-014F 的完成條件）。要不要顯示「試用中」的人，見 §9 第 5 點。
- **`is_me`** 取代 `user_id`：client 只需要知道哪一列是自己。
- **`joined_on`** 只到日期，成長率的計算夠用。
- **`week_xp` 的週**以資料庫的 `CURRENT_DATE`（UTC）計算，與現在的 view 相同。
- **效能**：每次呼叫都把所有人最近 7 天的 sessions 加總（只有 `(user_id, date)` 索引），與現在的 view 相同，不是退步。帳號變多時可以改成只算公開使用者（LATERAL）、在 server 依呼叫者的 `mode` 篩選、或用 `(select auth.uid())`（011 的寫法）。
- **舊的 `leaderboard_view` 先保留**：還沒更新的 client 仍在用。它仍回傳 `name`，所以在 E3 移除之前，email 前段的問題對舊版 client 仍存在（§9 第 4 點）。
- **測試**（`tests/database/pro014e.test.sql`，ASSERT，在本機 PG 跑；這裡只用 `profiles`／`sessions`／`pro_entitlements`，本機有）：
  - `display_name` 的長度、空白、控制字元限制；
  - `anon` 不能執行 `get_leaderboard()`，`authenticated` 可以；
  - 只回傳公開且有公開名稱的人；不公開或沒有公開名稱的人不出現；
  - `is_me` 只有自己那列是 true；
  - `is_pro` 來自 `pro_entitlements`，profile 的 `is_pro` 改成 true 也不影響；
  - 回傳的欄位剛好是上面九個（避免之後誤加欄位）；
  - 函式是 `SECURITY DEFINER`（`prosecdef`）、`search_path` 為空（`proconfig`），`has_function_privilege('anon', …)` 為 false；
  - 名稱限制：全形空白、零寬字元、U+202E、前後空白都被拒；
  - 若採用 §9 第 4 點 A：`infra110.test.sql` 仍通過（view 的權限不變）。
- **回滾**：先把 client 退回讀 view 的版本，再 `DROP FUNCTION public.get_leaderboard();`。**不刪 `display_name` 欄位**：還有 E2 的 client 時刪掉它，這些 client 的寫入會失敗；欄位也存著使用者自己選的名稱。確定沒有 E2 的 client 之後才考慮刪（或乾脆保留）。

## 5. Client（E2）

- **設定頁的「顯示於排行榜」**：
  - 打開時，若還沒有公開名稱，先請使用者輸入（預設值見 §9 第 3 點），存好才開啟；
  - 開啟後，開關下方顯示「排行榜上的名稱：○○」，可以修改；
  - 關閉時保留公開名稱（下次打開不用再輸入）。
- **個人頁的名稱**不變，仍是自己看的名稱，不會出現在排行榜。
- **公開名稱與開關的寫入**：
  - 不放進整份 profile 的同步（`PROFILE_FIELDS` 只讀它，上傳時不帶）。否則另一台資料較舊的裝置同步時，會把名稱蓋回舊值或 null，那個人就從排行榜消失；名稱若不符合資料庫的限制，還會讓整份 profile 的上傳失敗，連帶卡住 XP 等同步。
  - 改成設定頁裡單獨、等待結果的寫入：`supabase.from('profiles').update({ display_name, is_public }).eq('user_id', uid)`（RLS 限本人），成功後才更新畫面；失敗就顯示錯誤，開關維持原狀。
  - 開關 `is_public` 也一起改成這樣寫（從 `PROFILE_FIELDS` 的上傳拿掉），順便修掉它現在會被舊資料蓋回的問題。舊版 client 仍會在 profile 同步時上傳 `is_public`，E3 之前這個問題對舊版仍存在。
  - 舊版 client 的 upsert 只寫它帶的欄位，不會動到 `display_name`。
  - client 以和 CHECK 完全相同的規則檢查名稱，不符合就不送出。
- **排行榜頁**：
  - 改呼叫 `supabase.rpc('get_leaderboard')`；
  - 自己那列用 `is_me` 標示；成長率用 `joined_on`；
  - 頭像照舊用 `avatar_path` 換 signed URL；已經是 http 網址的（舊資料）直接使用；
  - 不退回讀 `leaderboard_view`（§6 保證 EA 先完成）；
  - 本機快取改用新的 key（例如 `leaderboardCacheV2`），不靠判斷格式；退回舊版 client 時也不會把新格式當成有效的快取；
  - RPC 失敗（離線、函式不存在 `PGRST202`）：有新格式的快取就顯示快取並標示過期，沒有就顯示現有的「無法載入排行榜」。
- **INFRA-105**：新的讀取、名稱檢查與寫入放在新模組，加進 SHELL（`sw.js`）；既有模組只 import 新模組的新 export。若在既有的 `db`／`storage` 物件加新方法，呼叫端要先檢查方法存在（同 `db.grantStreakUnlock`）。

## 6. 順序

1. **E1**（repo）：migration 與資料庫測試，不改 client。
2. **EA**（擁有者）：在 production 套用。套用前以只讀查詢確認公開使用者的數量；套用後以兩個測試帳號確認排行榜的欄位與 `is_me`。
3. **E2**（repo）：client 改用 RPC 與公開名稱。EA 完成後才部署，不需要退回 view 的程式。
4. **E3**（之後，另行核准）：舊版 client 都更新後移除 `leaderboard_view`（`DROP VIEW`；015 的註解提醒：重建 view 會重新拿到預設權限，這裡是直接移除，不重建）。app 沒有回報版本的機制，「都更新」只能以時間判斷（見 §9 第 11 點）。

## 7. 驗收

- 沒設定公開名稱的人，即使 `is_public` 為 true，也不會出現在新的排行榜。
- 排行榜的資料沒有 `user_id` 欄位、email 前段、真名（除非本人把它設成公開名稱）或完整的加入時間。頭像路徑仍以 user_id 開頭（§8）。
- 自己那列正確標示；三種排名的結果與現在相同。成長率與「新使用者」的判斷改用加入日期，可能差一天。
- 另一台資料較舊的裝置同步後，公開名稱與開關不會被蓋掉。
- Pro 標記與 server 一致：profile 的 `is_pro` 被改成 true 不會讓人在排行榜上變成 Pro。
- 未登入的人呼叫 RPC 被拒。
- 舊版 client 在 E3 之前仍能看排行榜。

## 8. 風險與已知限制

- **頭像路徑含 user_id**：`avatar_path` 的第一段就是 user_id，所以有頭像的人，user_id 實際上仍可取得。UUID 本身不能拿來登入或讀資料（所有表都有 RLS），風險低；要完全移除，得把頭像搬到不含 user_id 的路徑並改 010 的 policy，另列任務。另一個小改進（可選）：010 的頭像 policy 加上 `display_name IS NOT NULL`，沒有公開名稱的人的頭像就不給別人讀。
- **SECURITY DEFINER 函式寫錯就是資料外洩**：欄位清單固定、測試檢查回傳的欄位，並在 EA 以測試帳號實測。
- **舊版 client**：E3 之前仍讀 `leaderboard_view`，仍會看到 `name`。若要立刻擋掉 email 前段，見 §9 第 4 點。
- **既有的公開使用者**：若不搬移名稱（§9 第 2 點的建議），他們在設定公開名稱之前會從新的排行榜消失。

## 9. 需要擁有者決定

1. **拆成 E1 → EA → E2 → E3**（建議），或一次做完。
2. **既有的公開使用者**：
   - A（建議）：不搬移，請他們自己設定公開名稱（設定頁與排行榜頁顯示提示）；在設定之前不出現在新的排行榜。
   - B：把現在的 `name` 複製成 `display_name`。排行榜不中斷，但沒改過名稱的人，email 前段或 Google 的真名就繼續公開。
3. **輸入公開名稱時的預設值**：空白（建議，避免直接沿用 email 前段或真名），或帶入目前的 `name`。
4. **舊的 view 在 E3 之前**：
   - A（建議）：E1 同時把 view 的 `name` 改成 `COALESCE(p.display_name, '匿名') AS name`（`CREATE OR REPLACE VIEW`，欄位順序不變，保留 015 的權限），舊版 client 也不再看到 email 前段或真名；
   - B：不動，等 E3 移除。
5. **排行榜的 Pro 標記包含試用中的人嗎**：包含（建議，與 app 內的 Pro 一致），或只標付費的人（RPC 改用付費的判斷）。
6. **公開名稱的長度**：1–20 字（建議，與個人頁的輸入框相同），或其他。
7. **公開名稱要不要不能重複**：不限制（建議，排行榜以 XP 排序，不以名稱辨識），或加唯一限制（需要處理衝突與大小寫）。
8. **不當的名稱怎麼處理**：擁有者在 SQL Editor 把那個人的 `display_name` 設為 NULL（建議，帳號少；寫成文件的步驟），或做管理介面。
9. **保留字**：不限制（建議），或禁止「官方」「Orbit」「管理員」之類的名稱。
10. **改名的頻率**：不限制（建議），或例如每天一次。
11. **E3（移除舊 view）的時機**：E2 上線後一個月（建議；app 沒有版本回報，只能以時間判斷），或擁有者另行決定。
12. **排行榜只列前 N 名**：不限制（建議，目前公開的人很少），或只回傳前 100 名（client 每一列都要換一次頭像網址）。

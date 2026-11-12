-- ============================================================
-- 017_avatar_public_policy_fix.sql
-- BUG-119：排行榜頭像的 Storage policy 讀錯欄位（010）。擁有者 2026-11-11 核准修正。
--
-- 問題（010 的 avatars_select_public_leaderboard_profiles）：
--   子查詢 `from profiles p where p.user_id::text = (storage.foldername(name))[1]`
--   裡沒加表名的 `name` 先找最內層的 profiles.name（顯示名稱），不是
--   storage.objects.name（檔案路徑）；production 的 pg_policies 也顯示為
--   storage.foldername(p.name)。子查詢在呼叫者的權限下執行，受 profiles 的 RLS 限制
--   （002：只看得到自己那一列），所以：
--     - 原本的功能（已登入的人看得到公開排行榜使用者的頭像）從來沒生效；
--     - 名稱若能是「自己的 user_id/任意字」並設為公開，自己那一列就會讓條件對 avatars 的
--       每一個檔案成立。但 user_id 有 36 字，profiles.name 有 30 字的上限（001 的 CHECK；
--       BUG-109 證實 production 有這個限制），所以這條路在 production 走不通。
--   2026-11-12 只讀查詢：0 個 profile 的名稱第一段等於自己的 user_id、0 個名稱含 /。
--   修正讓功能生效，也不再依賴名稱長度的上限擋住外洩。
--
-- 修正：只把 name 改成 objects.name 不夠，子查詢仍受 profiles 的 RLS 限制，旁人看不到
-- 別人那一列，公開使用者的頭像還是讀不到。改用 SECURITY DEFINER 的小函式回答
-- 「這個檔案是不是某個公開使用者現在的頭像」：
--   - 只開放現在的頭像（profiles.avatar_url 等於檔案路徑），不是整個資料夾：
--     uploadAvatar() 每次上傳都用新的檔名、舊檔不刪，開放整個資料夾會讓別人列出並下載
--     已經換掉的舊照片（獨立審查 #246 發現）；
--   - 檔案的第一層資料夾必須就是那個 profile 的 user_id，所以把 avatar_url 設成別人的
--     路徑也打不開別人的檔案；
--   - 只回傳布林值，不回傳任何欄位；能回答的只有排行榜本來就公開的事
--     （leaderboard_view 已列出公開使用者的 avatar_url）；
--   - stable、search_path 設為空字串、表名都完整寫出；資料夾先確認是小寫 UUID 再轉型，
--     以 user_id 的主鍵查詢（不是 UUID、NULL 都回傳 false）；
--   - 只給 authenticated 執行（REVOKE ALL FROM public, anon）。
--   **不要收回 authenticated 的執行權**：storage.objects 的查詢一開始就檢查 policy 裡函式的
--   執行權，收回後 authenticated 在任何 bucket（avatars、proofs）的讀取、移動、刪除都會失敗
--   （會套用 SELECT policy 的操作都是）。Supabase 的 advisor 會把它列為「authenticated 可執行的
--   SECURITY DEFINER 函式」（lint 0029），這是預期的。
-- 已知限制：排行榜以 createSignedUrl() 取得 7 天有效的網址，下載時 Storage 只檢查網址的
--   token、不再看 policy。所以使用者換頭像或改成不公開之後，別人手上已經拿到的網址最多還能
--   用 7 天；policy 管的是「之後還能不能再拿到網址」。
-- policy 改成直接呼叫它；policy 裡沒有子查詢，name 就是 storage.objects.name。
--
-- 測試：tests/database/bug119.test.sql（單一 transaction，結尾 rollback）。
--   - 本機：tests/database/support/storage-standin.sql（含 002 的 profiles RLS）→ 003 → 017 → 測試；
--   - production：begin; set local lock_timeout = '5s'; ＋ 本檔 ＋ 測試 ＋ rollback; 乾跑，
--     擁有者核准後才套用（DROP／CREATE POLICY 會鎖住 storage.objects 直到 commit）。
-- 套用前檢查：production 的 policy 與 010 相同（pg_policies 的 qual 是
--   storage.foldername(p.name)），且 public.is_public_leaderboard_avatar 還不存在。
--
-- 回滾（執行時另行核准）：重新執行 010 的 CREATE POLICY（先 drop 本檔建立的同名 policy），
--   再 drop function public.is_public_leaderboard_avatar(text)（policy 依賴函式，順序不能反）。
--   回滾會帶回 BUG-119，只在本檔造成新問題時才做。
-- ============================================================

create or replace function public.is_public_leaderboard_avatar(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = case
        when (storage.foldername(object_name))[1]
             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then ((storage.foldername(object_name))[1])::uuid
      end
      and p.is_public = true
      and p.avatar_url = object_name
  );
$$;

revoke all on function public.is_public_leaderboard_avatar(text) from public, anon;
grant execute on function public.is_public_leaderboard_avatar(text) to authenticated;

drop policy if exists "avatars_select_public_leaderboard_profiles" on storage.objects;

-- 已登入的人讀得到「公開排行榜使用者現在的頭像」；自己的所有頭像檔仍由 003 的
-- avatars_select 負責。
create policy "avatars_select_public_leaderboard_profiles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_public_leaderboard_avatar(name)
  );

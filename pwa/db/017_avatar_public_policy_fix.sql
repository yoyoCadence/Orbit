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
--     - 自助外洩：任何已登入的人把自己的名稱改成「自己的 user_id/任意字」並設為公開，
--       自己那一列就讓條件對 avatars 的每一個檔案成立，這個人讀得到所有人的頭像。
--   2026-11-12 只讀查詢：0 個 profile 觸發。
--
-- 修正：只把 name 改成 objects.name 不夠，子查詢仍受 profiles 的 RLS 限制，旁人看不到
-- 別人那一列，公開使用者的頭像還是讀不到。改用 SECURITY DEFINER 的小函式回答
-- 「這個資料夾是不是公開使用者的」：
--   - 只回傳布林值，不回傳任何欄位；能回答的只有排行榜本來就公開的事
--     （leaderboard_view 已列出公開使用者的 user_id）；
--   - stable、search_path 設為空字串、表名都完整寫出；
--   - 只給 authenticated 執行（REVOKE ALL FROM public, anon）。
-- policy 改成直接呼叫它；policy 裡沒有子查詢，name 就是 storage.objects.name。
--
-- 測試：tests/database/bug119.test.sql（單一 transaction，結尾 rollback）。
--   - 本機：tests/database/support/storage-standin.sql（含 002 的 profiles RLS）→ 003 → 017 → 測試；
--   - production：begin; set local lock_timeout = '5s'; ＋ 本檔 ＋ 測試 ＋ rollback; 乾跑，
--     擁有者核准後才套用（DROP／CREATE POLICY 會鎖住 storage.objects 直到 commit）。
-- 套用前檢查：production 的 policy 與 010 相同（pg_policies 的 qual 是
--   storage.foldername(p.name)），且 public.is_public_profile_folder 還不存在。
--
-- 回滾（執行時另行核准）：重新執行 010 的 CREATE POLICY（先 drop 本檔建立的同名 policy），
--   再 drop function public.is_public_profile_folder(text)。回滾會帶回 BUG-119，只在
--   本檔造成新問題時才做。
-- ============================================================

create or replace function public.is_public_profile_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id::text = folder
      and p.is_public = true
  );
$$;

revoke all on function public.is_public_profile_folder(text) from public, anon;
grant execute on function public.is_public_profile_folder(text) to authenticated;

drop policy if exists "avatars_select_public_leaderboard_profiles" on storage.objects;

-- 已登入的人讀得到「公開排行榜使用者」資料夾裡的頭像；自己的頭像仍由 003 的
-- avatars_select 負責。
create policy "avatars_select_public_leaderboard_profiles" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and public.is_public_profile_folder((storage.foldername(name))[1])
  );

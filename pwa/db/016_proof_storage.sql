-- ============================================================
-- 016_proof_storage.sql
-- HW-112A：佐證照片的雲端存放（Supabase Storage 的私有 bucket `proofs`）。
-- 提案：docs/hw-112-proof-photo-sync-proposal.md（擁有者 2026-11-11 核准，§9 全部照建議）。
--
-- 路徑：proofs/{user_id}/{session_id}.jpg
--   - user_id：登入者（auth.uid()），第一層資料夾；
--   - session_id：紀錄的 id（client 以 crypto.randomUUID() 產生，小寫）。
-- 只給 authenticated；anon 沒有任何 policy（CLAUDE.md 的 Storage 規則）。
-- storage.objects 上的 permissive policy 是 OR 起來的：既有的頭像 policy
-- （003、010）都限定 bucket_id = 'avatars'，碰不到這個 bucket 的檔案
-- （tests/database/hw112.test.sql 第 2 節逐一檢查）。
--
-- 測試：tests/database/hw112.test.sql（單一 transaction，結尾 rollback）。
--   - 本機：tests/database/support/storage-standin.sql 提供 Storage 的最小替身
--     （這個雲端環境拉不到 Supabase 的 Docker image）；
--   - production：HW-112B 套用前以 begin; ＋ 本檔 ＋ 測試 ＋ rollback; 乾跑。
-- 套用：HW-112B（production 寫入，依寫入流程與擁有者核准）。
--
-- 回滾（寫在這裡，執行時另行核准）：
--   1. HW-112C（client 上傳）上線之前，bucket 是空的：
--        drop policy if exists "proofs_select" on storage.objects;
--        drop policy if exists "proofs_insert" on storage.objects;
--        drop policy if exists "proofs_update" on storage.objects;
--        drop policy if exists "proofs_delete" on storage.objects;
--      再以 Dashboard 或 Storage API 刪除空的 bucket（新版 Storage 擋下以 SQL
--      直接刪 storage.buckets／storage.objects，storage.protect_delete）。
--   2. HW-112C 上線之後：雲端可能有其他裝置已經沒有的照片，不能直接清空。
--      先把 client 退回不上傳的版本；要停止接受新檔案只拿掉 INSERT／UPDATE
--      policy；要刪除先匯出，再用 Storage API 刪。
-- ============================================================

-- 私有 bucket：沒有公開網址，只能帶登入者的 token 下載。
-- 每個檔案最大 200 KB、只收 image/jpeg（Storage API 依 client 送出的
-- Content-Type 檢查；目前一張照片不到 40 KB）。
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('proofs', 'proofs', false, 204800, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 可重複執行：先拿掉同名 policy 再建立。
drop policy if exists "proofs_select" on storage.objects;
drop policy if exists "proofs_insert" on storage.objects;
drop policy if exists "proofs_update" on storage.objects;
drop policy if exists "proofs_delete" on storage.objects;

-- SELECT：只讀自己資料夾裡的檔案。
create policy "proofs_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

-- INSERT：只能放進自己的資料夾，而且名稱必須剛好是 {自己的 user_id}/{小寫 UUID}.jpg
-- （不能有子資料夾、別的副檔名或任意檔名）。
create policy "proofs_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and name ~ ('^' || (select auth.uid())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  );

-- UPDATE：只能改自己資料夾裡的檔案（USING），改完仍要符合上面的名稱規則（WITH CHECK）。
create policy "proofs_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'proofs'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'proofs'
    and (select auth.uid())::text = (storage.foldername(name))[1]
    and name ~ ('^' || (select auth.uid())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')
  );

-- DELETE：只能刪自己資料夾裡的檔案。
create policy "proofs_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proofs'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

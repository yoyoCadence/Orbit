-- ============================================================
-- 015_leaderboard_view_grants.sql  (INFRA-110 — leaderboard_view 只給已登入的使用者讀)
-- 問題（AUDIT-001 發現；專案擁有者 2026-11-03 以 information_schema.role_table_grants 確認）：
--   leaderboard_view（005 建立、010 改寫）除了 migration 寫的 GRANT SELECT TO authenticated，
--   還有 Supabase 預設權限給的 anon 與 authenticated 全部權限（SELECT、INSERT、UPDATE、DELETE、
--   TRUNCATE、REFERENCES、TRIGGER）。view 以擁有者（postgres）的權限執行，不受 profiles／
--   sessions 的 RLS 限制（005 的註解「Views inherit table RLS by default」不正確），只靠
--   WHERE p.is_public = true 限制資料列。所以只要有 anon key（公開在 pwa/js/config.js），
--   未登入就能以 GET /rest/v1/leaderboard_view 讀到所有公開使用者的 user_id、名稱、XP、
--   連勝、加入時間、本週 XP 與頭像路徑。
--   view 有 JOIN 與子查詢，不能被寫入，INSERT／UPDATE／DELETE 實際上無效，但也不該存在。
-- 修正：只收回權限。view 的定義與欄位不變，client 不需修改（排行榜只在登入後讀取，
--   pwa/js/pages/leaderboard.js）。service_role 與 postgres 不變。
-- 不在此變更：是否不再回傳 user_id（頭像路徑本身以 user_id 開頭，需要一起處理）、改為
--   security_invoker 或 RPC，見 PRO-014E。
-- 套用後檢查（預期 authenticated 只剩 SELECT，沒有 anon 與 PUBLIC）：
--     SELECT grantee, privilege_type FROM information_schema.role_table_grants
--      WHERE table_schema = 'public' AND table_name = 'leaderboard_view' ORDER BY 1, 2;
-- 回滾（恢復原本的狀態，不建議）：GRANT ALL ON public.leaderboard_view TO anon, authenticated;
-- 測試：tests/database/infra110.test.sql（ASSERT，失敗即中止；可在同一個 transaction 內
--   與本檔一起乾跑後 ROLLBACK）。
-- 執行日期：PENDING（專案擁有者於 production 套用後填寫，INFRA-110A）
-- ============================================================

REVOKE ALL ON TABLE public.leaderboard_view FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.leaderboard_view TO authenticated;

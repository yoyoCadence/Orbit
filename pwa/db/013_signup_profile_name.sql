-- ============================================================
-- 013_signup_profile_name.sql  (BUG-109 — signup trigger 截斷 profile 名稱)
-- 問題：handle_new_user() 把 raw_user_meta_data->>'name' 或 email 的 local-part
--   原樣寫進 profiles.name，但該欄位有 CHECK (char_length(name) <= 30)。
--   名稱超過 30 字元時 trigger 拋錯，整個 auth.users INSERT 失敗，Supabase Auth
--   回 500「Database error saving new user」，使用者無法註冊。
--   影響：email local-part 超過 30 字元（RFC 上限 64）；Google OAuth 顯示名稱
--   超過 30 字元的使用者也走同一條路徑。
-- 修正：只把同一個名稱來源包進 left(..., 30)。left() 與 char_length() 都以
--   字元計，多位元組名稱不會被截在半個字元。constraint、trigger 綁定、
--   SECURITY DEFINER、search_path 與 energy 列建立都維持 004 的定義。
-- 不在此變更：handle_new_user() 的 EXECUTE grant 收斂（PRO-014I 記錄的 advisor
--   提醒）屬另一項 auth／schema hardening，需另案核准。
-- 套用前檢查：production 的函式必須與 004_triggers.sql 一致，否則 CREATE OR
--   REPLACE 會覆蓋未入庫的差異。先執行
--     SELECT pg_get_functiondef('public.handle_new_user()'::regprocedure);
--   比對後再套用；回滾即重新執行 004 的函式定義。
-- 執行日期：2026-10-31（專案擁有者於 production 套用，BUG-109A；套用前確認與 004 相同並以 transaction 乾跑）
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (
    NEW.id,
    left(COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)), 30)
  );
  INSERT INTO public.energy (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

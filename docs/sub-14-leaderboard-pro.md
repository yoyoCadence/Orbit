# SUB-14 排行榜 Pro 強化 — Migration 提案（送審）

- 狀態：**提案中，等待 reviewer 確認 schema 後才實作 client 並執行 migration**
- 分支：`feat/sub-14-leaderboard-pro`
- Migration 檔：[`pwa/db/011_leaderboard_pro.sql`](../pwa/db/011_leaderboard_pro.sql)（尚未於 Supabase 執行）

## 功能範圍

1. **Pro 頭像光環** — 排行榜上，Pro 生效中的使用者頭像顯示光環（＋一個小 `✦` 標記）。
2. **自訂顯示名稱（全站，Pro 專屬）** — Pro 使用者可設定顯示名稱，套用於 **header、profile、排行榜、Personal Space** 等所有顯示名稱處；非 Pro 或未設定則回退 `profiles.name`；Pro 失效後自動回退。

兩者都需要伺服器資料：排行榜要顯示「其他人」的 Pro 狀態與自訂名稱，client 無法自行得知，必須由 `leaderboard_view` 暴露。

## Schema 變更（高風險，本提案主體）

### 1. `profiles.display_name`
```sql
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS display_name text
  CHECK (display_name IS NULL OR char_length(display_name) <= 20);
```
- 可空；`NULL`／空字串＝未設定，一律回退 `name`。
- 伺服器端 `CHECK` 長度 ≤ 20 作為防濫用底線；client 另會 `trim` 並於渲染 `escape`。

### 2. `leaderboard_view` 追加兩欄
- `is_pro_active`（boolean）— **伺服器端精確複製 client `isProUser()`**：
  - 付費：`is_pro = true AND (pro_expires_at IS NULL /*永久*/ OR pro_expires_at > now())`
  - 或試用：`trial_started_at IS NOT NULL AND trial_started_at > now() - INTERVAL '15 days'`
- `display_name`（text，**僅 Pro 生效時暴露**）— `CASE WHEN is_pro_active THEN NULLIF(btrim(display_name), '') END`。
- 沿用原欄位順序、於尾端追加（`CREATE OR REPLACE VIEW` 不允許中間插欄，與 `010` 相同做法）。

## 安全 / RLS 分析（對照 CLAUDE.md）

- **不新增任何 policy、不放寬既有 policy、不碰 storage。** 只加欄位 + 重建 view。
- `profiles` 既有四個 policy 皆 `auth.uid() = user_id`（見 `002_rls_policies.sql`）。`display_name` 是 profiles 的新欄位，**寫入**由既有 `profiles_update`（USING + WITH CHECK 均 `auth.uid() = user_id`）覆蓋——使用者只能改自己的。
- **對外暴露**只透過 `leaderboard_view`，且維持原本 `WHERE p.is_public = true` 過濾（與 `005/010` 一致，使用者需自行在設定開啟「顯示於排行榜」才會出現）。
- `display_name` 在 view 內再加一層 Pro 閘：非 Pro 生效者一律 `NULL`，自訂名稱不外洩。
- `is_pro_active` 只揭露「這個公開使用者目前是否 Pro」，屬裝飾性徽章、無敏感資料。
- 不涉及 `service_role`；client 僅用 anon key。

## Client 變更計畫（schema 確認後才動工）

| 檔案 | 變更 |
|---|---|
| `pwa/js/storage.js` | `PROFILE_FIELDS` 加入 `['displayName','display_name', …]`，隨 profile 同步（讀寫）。 |
| `pwa/js/pages/settings.js` | 新增 Pro 門控的「顯示名稱」輸入（≤20，trim）；沿用 `storage.isProUser()` + `pro-badge--corner` + 鎖定樣式，非 Pro 點擊導向 `_goToProCard()`。 |
| `pwa/js/ui/header.js`、`pwa/js/pages/profile.js`、`pwa/js/personalSpace/v2/viewModels.js` | 顯示名稱改用 `effectiveDisplayName(user)`：`isProUser() && displayName ? displayName : name`（全站一致的小工具）。 |
| `pwa/js/pages/leaderboard.js` | `is_pro_active` → 頭像光環 class + `✦`；顯示名稱用 `r.display_name || r.name`（仍 `escHtml`）。 |
| `pwa/assets/style.css` | `.lb-avatar--pro` 光環（`@media (prefers-reduced-motion)` 下不動畫）。 |

## 驗證輸入 / 防注入

- 長度：伺服器 `CHECK ≤ 20` ＋ client `maxlength`/trim。
- 空白：view `NULLIF(btrim(...), '')`＋client trim。
- XSS：所有名稱渲染皆走既有 `escHtml`（排行榜已有 `escapes HTML in user names` 測試）。

## 測試計畫

- `tests/unit/leaderboard.test.js`：`is_pro_active` → 光環 class 有/無；`display_name` 有值時顯示、無值回退 `name`；自訂名稱仍被 escape。
- `tests/unit/settings.test.js`：非 Pro 時顯示名稱輸入為鎖定/導向 Pro；Pro 時可儲存並同步。
- SQL 不在此 repo 做單元測試（沿慣例由人工於 Supabase 執行 migration）。

## Rollback

1. 還原 `010` 版 `leaderboard_view`。
2. `ALTER TABLE profiles DROP COLUMN IF EXISTS display_name;`（須先讓 client 停止讀寫該欄位）。

## 給 reviewer 的問題

1. `display_name` 長度上限 20 是否合適？是否需再加字元集限制（例如禁止控制字元／emoji 政策）？
2. `is_pro_active` 直接以 view 表達式複製 `isProUser()` 規則可接受，或偏好改用 DB function／generated column 以單一來源維護？
3. 「全站顯示名稱」是否包含 Personal Space 的 `player.name`（本提案預設包含）？

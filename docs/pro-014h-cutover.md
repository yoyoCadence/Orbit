# PRO-014H：Pro 判定切換到 server

- 核准：2026-11-11（專案擁有者回覆「ok 核准」）
- 版本：v1.41.15
- 任務：`tasks.md` 的 `PRO-014H`；真機驗證是 `PRO-014HA`，相容層移除是 `PRO-014HB`

## 1. 切換了什麼

- `pwa/js/platform/proEntitlement.js` 的 `REPO_PRO_ENTITLEMENT_SOURCE` 由 `legacy` 改為 `server`。
  - app 裡所有 Pro 與試用的判斷，改看 `my_pro_status()` 的 projection。
  - profile 的 `is_pro`、`pro_expires_at`、`trial_started_at` 不再決定 Pro。這幾個欄位 client 可以自己寫，所以不能當成 Pro 的依據。
- 部署 `server` 之後，裝置上的設定無法把來源降回 `legacy`（`resolveProEntitlementSource()`）。
- 開始試用（`db.startTrial()`）後，會立刻重新取得 projection。
  - 開機時會先取得一次 projection，之後才開始試用。
  - 少了這一步，新帳號要等下一次取得才會看到試用。
  - 只替同一個帳號取得，失敗也不影響試用已經開始的結果。
  - 在 `legacy` 下這一步不做任何事。
- 回到前景時，若這個帳號上次的結果已超過一小時（或還沒有），會重新取得（`pwa/js/proResume.js`）。
  - projection 只能用 24 小時，原本只在開機、重新連線、開始試用與 SUB-16 時取得；app 留在背景超過 24 小時，付費使用者在線上也會看到免費版。
- 取得新的結果之後，重新套用依賴 Pro 的畫面：換日延後的 Pro 效果、每日隨機主題、試用到期提示、header 與頁面。
  - 開機時這些在取得結果之前就跑過一次，結果超過 24 小時時那一次會以為不是 Pro。

## 2. 切換前的檢查（2026-11-11，只讀，只看筆數）

| 項目 | 結果 |
|---|---|
| `profiles.streak_unlock_used` | 0 筆 |
| 012 回填重跑會新標記的帳號 | 0 筆（不需要寫入） |
| 提案 `pro-014l-streak-unlock-server.md` §7：profile 的 SUB-16 還有效、server 沒有涵蓋 | 0 筆 |
| profile 數 | 8 |
| legacy 規則有效（`is_pro_active()` 套在 profile 欄位上；client 的試用也是 15 天） | 4 |
| server 規則有效（`pro_entitlements`） | 4 |
| 切換後失去權限 | 0 |
| 切換後多出權限 | 0 |

`profiles.is_pro` 有 6 筆，server 只有 4 筆。多出來的 2 筆都已經過期。

## 3. 刻意保留的相容層（PRO-014HB 才移除）

原本的計畫是在切換的同一個變更裡，移除兩個 legacy 寫回。實作時發現：

- 這兩個寫回寫的都是 server 給的值，在 `server` 下不會被拿來判斷 Pro。
- 試用的開始時間還有別的地方在用：
  - 開機時判斷要不要開始試用（profile 沒有開始時間才呼叫 `start_trial()`）；
  - 設定頁的試用進度條。
  - 移除寫回會讓新帳號每次登入開機都多一次請求，進度條也會消失。
- 留著它們，回退就只要改回旗標，不會遺失切換期間開始的試用或發放的 SUB-16。

所以這次只切換旗標，保留：

- `startTrial()` 把 `trial_started_at` 寫回 profile；
- `grantStreakUnlock()` 把付費的 SUB-16 延長寫回 profile 的 `is_pro`／`pro_expires_at`；
- `showMainApp()` 處理舊版 `dayCycle.js` 設的 `FLAG_STREAK_UNLOCK_NEW`。

切換穩定後，在 `PRO-014HB` 一起移除，並修改開機判斷與進度條的來源。

## 4. 回退

`server` 有問題時（例如付費使用者失去 Pro），照下面的步驟回退：

1. 先對帳（只讀）：重跑第 2 節的比較，看 legacy 規則與 server 規則是否還給同樣的帳號 Pro。
   - 相容層會寫回切換期間開始的試用與發放的 SUB-16，但有兩種情況不會出現在 profile：
     - 擁有者在這段期間直接改 `pro_entitlements`（新增、續約、撤銷）；
     - 某台裝置留著舊的待同步 profile，把 `is_pro`／`pro_expires_at`／`trial_started_at` 蓋回舊值（`server` 下沒人會發現）。
   - 有差異時，先把 server 的值寫回 profile 再切換（production 寫入，需另行核准）。
2. 把 `REPO_PRO_ENTITLEMENT_SOURCE` 改回 `PRO_ENTITLEMENT_SOURCE.LEGACY`，**版本往上 bump**（例如 1.41.16）後部署。
   - 不要整個 revert 這個 PR：那會把版本與 service worker 的快取名稱退回 1.41.14，也會拿掉這份文件。
   - 測試也要一起改：`proEntitlement.test.js` 的「目前部署的來源」會失敗，legacy 的測試則已經以 mock 保留。
3. 裝置上留下的 `orbit_pro_entitlement` 等 key 在 `legacy` 下不會被讀，不需要清除。
4. 確認：用 `docs/pro-test-accounts.md` 的帳號登入，確認付費、試用、免費三種狀態都正確。

`PRO-014HB` 移除相容層之後，回退就不能只改旗標了。這種情況要先把 server 的值寫回 profile：

- 寫回 `trial_started_at`；
- 寫回付費的 `is_pro`／`pro_expires_at`。

這是 production 寫入，要另外核准。查詢寫在 `PRO-014HB` 的文件裡。

## 5. 真機驗證（PRO-014HA，擁有者）

v1.41.15 部署後依序做：

1. 在 Supabase SQL Editor 跑 `docs/pro-test-accounts.md` 的重設 SQL（先換掉第 3 行的 placeholder）。結果表要是 5 列，`server_pro_active` 依序為 false、true、true、true、false。
2. 分別登入 5 個測試帳號：
   - 設定頁的 Pro 狀態（付費／試用倒數／免費）和上表一致；
   - Pro 功能（隨機主題、成長報告 PDF）付費與試用帳號能用，免費帳號不能用。
3. 登入擁有者的主帳號，確認仍是終身 Pro。
   - 若設定頁的開發者工具出現「清除殘留」（舊版開發者面板留下的模擬資料），先按它：留著時這台裝置不會向 server 取得 Pro 狀態，會一直顯示為非 Pro。
4. 離線打開 app：24 小時內維持上次的狀態，超過後顯示為非 Pro（fail closed）。
   - 更新後第一次開啟若剛好離線，還沒有任何 server 的結果，付費帳號會先顯示為非 Pro，連線後恢復。
5. 把 app 留在背景一段時間（超過一小時）再回到前景：Pro 狀態維持，不需要重開。
6. 有問題就照第 4 節回退，並回報是哪一個帳號、看到什麼。

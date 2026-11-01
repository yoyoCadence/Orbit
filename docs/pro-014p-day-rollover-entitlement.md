# PRO-014P 提案：`server` source 下，換日處理不再把「Pro 狀態不明」當成「不是 Pro」

> 狀態：提案（2026-11-01），只寫文件、不改程式碼。屬 entitlement 啟動流程，依 AGENTS.md §3 需使用者核准（§10）後才實作。擋 `PRO-014H` cutover。

## 1. 結論

- **問題**：
  - 換日處理 `processYesterdayStreak()`（`pwa/js/dayCycle.js`）中，有三件事看 `storage.isProUser()`：每月補滿保護卡、連勝歸零時的保護卡 offer、SUB-16 連勝解鎖。
  - 在 `server` source 下，`isProUser()` 只看 entitlement snapshot。snapshot 超過 24 小時（`SNAPSHOT_TTL_MS`）就讀成「不是 Pro」。
  - 回訪的使用者走 cached-user 路徑：**先換日、後在背景 refresh**（`pwa/js/app.js` 的 `init()`）。
  - 「漏了一天」的情況，上一次 refresh 一定在 24 小時以前（§2.2）。所以**在 `server` source 下，回訪的付費使用者幾乎不可能拿到保護卡 offer**。這不是邊界情況，而是主路徑。
  - `lastStreakDate` 已經推進，之後 refresh 成功也不會補做（§3 實測）。
- **另一個既有缺陷（本提案一併處理）**：
  - `refreshProEntitlement()` 的註解說「網路失敗（throw）保留 snapshot」，但 repo 內的 Supabase client 遇到網路失敗**不會 throw**，而是回傳 `{ error, status: 0 }`（§3 實測）。
  - 結果：refresh 時網路斷一下，snapshot 就被刪除，付費使用者立刻變成非 Pro。既有測試以 `throw` 模擬網路失敗，所以沒有抓到。
- **建議（方案 D，§4）**：連勝照常計算（與 Pro 無關）。只有三件依賴 Pro 的事，在狀態不明時記成一筆「待補做」，等下一次取得權威結果時補做一次。
  - `legacy` source（目前的 production）下狀態永遠已知，不會產生待補做，**行為不變**。
  - 不需要 tasks.md 原方向（方案 T）的「延後整個換日、依日期重播」與訪客標記。
- **這會改寫 tasks.md 的完成條件**（§7 列出原文與改寫），需要你同意。

## 2. 問題細節

### 2.1 依賴 Pro 的三件事

| 位置（`processYesterdayStreak()`） | 條件 | snapshot 過期時（被當成非 Pro） |
| --- | --- | --- |
| 每月補滿保護卡 | `isProUser()` 且月份變了 → `streakShieldCount = 2` | 不補。下一次狀態已知的換日才補，**延後但不會遺失** |
| 歸零時的保護卡 offer | 漏了一天、`isProUser()`、保護卡 > 0、`prevStreak >= 2` → 寫入 `orbit_shield_pending` | **永久遺失**：`prevStreak` 只存在這一刻，`lastStreakDate` 推進後不會再判斷 |
| SUB-16 連勝解鎖 | `streakDays >= 45`、`!isProUser()`、`!streakUnlockUsed` → client 寫 `isPro`、`proExpiresAt`（+30 天）、`streakUnlockUsed = true` | 付費使用者被當成非 Pro：一次性的 `streakUnlockUsed` 被用掉，看到「解鎖 30 天 Pro」的 modal。終身付費者 profile 的 `proExpiresAt` 被改成 30 天後（`server` source 不讀這個欄位，但資料被改壞） |

連勝本身的計算（`processStreakForDate()`、漏一天歸零）與 Pro 無關。

### 2.2 為什麼漏了一天時 snapshot 幾乎一定過期

- 漏一天＝`lastStreakDate` 早於昨天（以 `newDayHour` 劃分的有效日期）。也就是昨天整天沒有啟動過 app（換日只在啟動時跑一次，`bootSequenceGuard`）。
- refresh 也只在啟動、連線恢復時跑。上一次啟動最晚在前天的有效日期結束前，這次最早在今天的有效日期開始時，相隔至少 24 小時，所以 `nowMs - fetchedAtMs >= SNAPSHOT_TTL_MS` 成立。
- 例外只有：頁面跨日一直開著、期間觸發過連線恢復同步（`_syncAfterReconnect`）；或遇到 23 小時的夏令時間日。

### 2.3 啟動順序

| 路徑 | 順序 | 換日時的 snapshot |
| --- | --- | --- |
| cached-user（`init()`，回訪使用者的主路徑） | `bootWithLocalState()`（換日）→ 背景 `_loadRemote()` → `refreshProEntitlement()` | 上一次 refresh 留下的，常常已過期 |
| `loadAndStart()`（首次登入、登出後再登入） | `_loadRemote()` → `refreshProEntitlement()` → 換日 | 剛 refresh 的；但 `_loadRemote()` 失敗時跳過 refresh；refresh 遇到網路失敗時 snapshot 被刪（§1 的既有缺陷） |
| `_syncAfterReconnect()` | refresh → 重新載入 state → render | 不跑換日 |

## 3. 實測（2026-11-01，以 repo 的真實模組在 vitest／Node 中執行，測試檔已刪除）

**換日（`processYesterdayStreak()`，`server` source，終身付費、`prevStreak = 10`、保護卡 2 張、漏了一天）**：

| snapshot | 換日後連勝 | `orbit_shield_pending` | `lastStreakDate` |
| --- | --- | --- | --- |
| 剛取得（< 24h） | 0 | `{"prevStreak":10}` | 今天 |
| 過期（> 24h） | 0 | `null` | 今天 |
| 過期，換日後 refresh 成功 | 0 | `null`（`isProUser()` 已是 true，但 offer 不會回來） | 今天 |

**Supabase client 的錯誤形式（`pwa/vendor/supabase.js`，以自訂 `fetch` 呼叫 `rpc('my_pro_status')`）**：

| `fetch` 的行為 | `rpc()` 的結果 |
| --- | --- |
| reject（`TypeError: Failed to fetch`，即離線） | **不 throw**，回傳 `{ status: 0, error: { message: 'TypeError: Failed to fetch' }, data: null }` |
| HTTP 500 | 回傳 `{ status: 500, error: { code: 'XX000', … } }` |

逾時（`AbortError`）走同一個 catch，也是 `status: 0`。

**`db.refreshProEntitlement()`（`server` source，終身付費的 snapshot 剛取得）**：RPC 回傳 `{ status: 0, error }` 一次之後，snapshot 被刪除，`isProUser()` 由 true 變成 false。原因是 `applyProStatusResponse()` 把任何 `error` 都當成權威的「清除」。`tests/unit/proEntitlementGate.test.js` 的「網路失敗（throw）保留既有 snapshot」以 `mockRejectedValue` 模擬，真實 client 不會走到那條路。

## 4. 方案

三個方案都先需要同一個判斷：換日當下 Pro 狀態是 `pro`、`not-pro` 還是 `unknown`（§6.1）。差別在 `unknown` 時做什麼。

### D：連勝照常，依賴 Pro 的三件事延後補做（建議）

- 連勝照常計算、照常歸零，`lastStreakDate` 照常推進。與 Pro 無關的部分完全不變。
- `unknown` 時不補卡、不給 offer、不做 SUB-16，改寫入一筆 owner-scoped 的待補做紀錄：歸零前的連勝（若這次換日有歸零）、是否已達 SUB-16 條件。
- 下一次取得權威結果時補做一次：先補卡，再判斷 offer，最後 SUB-16，與現在的順序相同。
- 好處：
  - 不改連勝引擎，不需要依日期重播。
  - 永遠拿不到權威結果時（例如殘留的 `FLAG_DEV_BACKUP`、儲存寫入失敗），最壞結果等於「不是 Pro」，而且不會用掉 `streakUnlockUsed`。連勝不會被凍結。
  - 訪客沒有 server entitlement，snapshot 不存在 → `unknown` → 待補做永遠不會被補做，結果與「不是 Pro」相同。**不需要新增訪客標記**。
  - `refreshProEntitlement()` 的回傳值不必改：補做時直接從剛寫入的 snapshot 判斷狀態，與換日用同一個函式。
- 代價：
  - 補做時用的是「補做當下」的 Pro 狀態，不是歸零那一刻的。正常情況兩者相隔幾秒（背景 refresh）；只有長時間離線、期間 Pro 狀態剛好改變時才會不同。
  - 歸零後到補做前的幾秒，畫面顯示連勝 0、還沒有保護卡橫幅；補做後重新 render 才出現。

### T：延後整個換日，依日期重播（tasks.md 原方向）

- `unknown` 時整個換日延後，不推進 `lastStreakDate`，記錄待處理日期；取得權威結果時依序重播每一天。
- 問題：
  - **連勝被凍結**：狀態不明期間顯示舊的連勝，每日報告也是舊的。
  - **要改連勝引擎**：現在只會「評估昨天」或「漏了就歸零」。不推進 `lastStreakDate` 的話，隔天的換日會看到漏了一天而歸零，所以必須新增依日期重播的邏輯，而且要完全重現「沒有啟動＝漏一天」的現有語意。這會改到所有 `server` source 使用者與 Pro 無關的行為。
  - **永遠 `unknown` 時連勝永遠不動**（殘留的 `FLAG_DEV_BACKUP`、寫入失敗、沒有標記的訪客）。
  - 需要新增訪客標記（tasks.md 已註明）、`refreshProEntitlement()` 改回傳 `{ status }` 並更新呼叫端。
- 相對 D 的好處：只有「歸零與 offer 同時出現」這一點。重播時用的也是重播當下的狀態，這一點與 D 相同。

### S：cached-user 啟動先等 refresh 再換日（不建議）

- 讓回訪使用者的開機等網路，違反 offline-first 的立即開機。
- 離線或 refresh 失敗時仍需要 `unknown` 的處理，所以最後還是要做 D 或 T。

## 5. 建議

採用 **D**。理由：

1. 問題只在三件依賴 Pro 的事，D 只動這三件；T 為了它們凍結並重寫與 Pro 無關的連勝。
2. 最壞情況：D 是「等同不是 Pro、但不浪費一次性解鎖」；T 是「連勝停住」。
3. D 少了訪客標記、日期重播、回傳值改版三項工作，測試面也小得多。

## 6. 核准後的實作（一個 PR）

### 6.1 狀態判斷：`pro`／`not-pro`／`unknown`

- `pwa/js/platform/proEntitlement.js` 新增 `getProStatusFromSnapshot(ownerId, nowMs)`。依序：
  - 沒有 `ownerId`、寫入失敗的 latch、snapshot 不存在或無法解析、owner 不符、超過 `SNAPSHOT_TTL_MS`、時鐘倒退 → `unknown`
  - 否則 `isActive` 且未過 `entitlementExpiryMs()` → `pro`，其餘 → `not-pro`
- `isProFromSnapshot()` 改為 `getProStatusFromSnapshot(...) === 'pro'`。兩者共用一套規則，不會分歧。
- `storage.getProRolloverStatus()`：`legacy` source 回傳 `isProUser() ? 'pro' : 'not-pro'`（永遠已知）；`server` source 回傳上面的結果。

### 6.2 待補做紀錄

- 新 key `orbit_pro_rollover_pending`（`pwa/js/flags.js`），內容 `{ ownerId, date, prevStreak, unlockEligible }`：
  - `prevStreak`：這次換日歸零前的連勝；沒有歸零或小於 2 時為 `null`。
  - `unlockEligible`：換日後 `streakDays >= 45` 且 `!streakUnlockUsed`。
- 再一次 `unknown` 換日時合併：新的 `prevStreak` 不是 `null` 才取代（與現在 offer 只有一格、後來的覆蓋前面的相同）；`unlockEligible` 取 OR；`date` 取最新。
- 登出時 `storage.clearAll()` 一併刪除；`ownerId` 與目前的 user 不符時刪除、不補做。

### 6.3 換日

```js
export function processYesterdayStreak() {
  if (!state.user) return;
  resolvePendingProRollover();                  // 先補做之前延後的（狀態已知時）
  const todayStr = eToday();
  if (state.user.lastStreakDate === todayStr) return;
  const status = storage.getProRolloverStatus();
  // …連勝計算不變；歸零時記下 prevStreak…
  if (status === 'unknown') recordPendingProRollover({ prevStreak, unlockEligible });
  else applyProRolloverEffects(status, { prevStreak });
  state.user.lastStreakDate = todayStr;
  storage.saveUser(state.user);
}
```

- `applyProRolloverEffects(status, { prevStreak, unlockEligible })` 是三件事的唯一實作：
  - `pro`：月份變了就補滿；`prevStreak >= 2` 且保護卡 > 0 就寫 offer。
  - `not-pro`：`(streakDays >= 45 || unlockEligible)` 且 `!streakUnlockUsed` 時解鎖（現有的 client 寫入；`PRO-014L` 會換成 server RPC，§8）。
- 補卡從「連勝計算之前」移到「之後」。連勝計算不讀保護卡數量，所以結果相同。`legacy` 下 `isProUser()` 讀的是儲存中的 user，原本三次呼叫之間儲存不變，所以改成只算一次結果也相同。

### 6.4 補做

- `resolvePendingProRollover()`：讀紀錄 → owner 不符就刪除 → `getProRolloverStatus()` 仍是 `unknown` 就保留 → 否則**先刪除紀錄、再套用** `applyProRolloverEffects()`（最多一次，寧可漏給也不重複給）→ `saveUser()`。
- 呼叫點：
  - `processYesterdayStreak()` 開頭（上面）。
  - `loadAndStart()`：`loadStateFromStorage()` 之後、`bootWithLocalState()` 之前。BUG-106 的情況下第二次開機會跳過換日，cached-user 的背景同步也會因為 session 已存在而跳過，所以這裡要明確呼叫。
  - cached-user 的背景同步與 `_syncAfterReconnect()`：refresh 與 `loadStateFromStorage({ authoritative: true })` 之後、`renderPage()` 之前。補做的結果會在既有的重新 render 中出現。

### 6.5 網路失敗不刪 snapshot

- `refreshProEntitlement()` 取用 `rpc()` 回傳的 `status`：`error` 且 `status === 0`（網路失敗或逾時）時與 throw 相同處理，保留 snapshot、回傳 `false`。
- HTTP 回應帶 `error`（4xx／5xx、RPC 不存在）維持現在的清除。
- `legacy` 下 refresh 在呼叫 RPC 前就返回，所以沒有影響。

### 6.6 使用保護卡

- `window.useStreakShield()` 在非 Pro 時直接 return、沒有任何回饋。狀態是 `unknown` 時改為顯示「目前無法確認 Pro 狀態，連線後再試一次」；`not-pro` 維持現狀。

### 6.7 測試

- 狀態判斷：`legacy` 的 pro／not-pro；`server` 的剛取得且有效 → pro、剛取得但 `isActive: false` 或已過期 → not-pro；過期、不存在、owner 不符、寫入 latch、時鐘倒退、沒有 owner → unknown。`isProFromSnapshot()` 的既有測試不變。
- 換日：§3 的三列重跑，最後一列改為補做後出現 `{"prevStreak":10}`；`unknown` 時連勝照常歸零、`lastStreakDate` 推進、不補卡、沒有 offer、`streakUnlockUsed` 不變、寫入紀錄。
- 補做：`pro` → 補卡＋offer；`not-pro` → 沒有 offer、符合條件時解鎖；仍是 `unknown` → 保留紀錄；補做兩次只給一次；owner 不符 → 刪除且不套用；合併規則。
- 跨日：第一天 `unknown`、第二天才取得權威結果 → 第一天的 Sessions 在第二天的換日照常評估，第一天的待補做也被補上。
- 網路失敗：`{ status: 0, error }` 保留 snapshot；`{ status: 500, error }` 清除（`proEntitlementGate.test.js` 新增真實形式的案例，保留原本的 throw 案例）。
- 呼叫點：`loadAndStart`、cached-user 背景同步、`_syncAfterReconnect` 在 refresh 之後呼叫補做（`appBootSequence.test.js` 的形式）。
- `legacy`：永遠不寫紀錄；既有 `dayCycle` 相關測試不改即通過。
- `useStreakShield()`：`unknown` 時顯示提示、不改連勝。

## 7. 完成條件（改寫 tasks.md 的原文）

tasks.md 的 PRO-014P 原本的完成條件（全文）：

> - `unknown` 的每種來源（snapshot 過期或不存在時的網路例外與 `FLAG_DEV_BACKUP` 略過、RPC error、格式不符、寫入失敗）都不重設連勝、不補保護卡、不消耗 `streakUnlockUsed`，且不推進 `lastStreakDate`
> - TTL 內的 snapshot 在離線時照常判定
> - 跨日：第一天 `unknown`、隔天才得到權威結果時，第一天的 Sessions 仍被評估（有效則延續連勝）
> - `pro` 時補卡並提供保護 offer；`not-pro` 時照常重設，SUB-16 條件照舊
> - 每個情況各有測試；目前忽略回傳值的呼叫端（`loadAndStart`、cached-user 背景同步、連線恢復同步）行為不變

採用 D 後改為：

1. **（改寫第 1 條）** `unknown` 的每種來源（同上，加上回傳 `status: 0` 的網路失敗）：連勝照常計算與歸零、`lastStreakDate` 照常推進；不補保護卡、不提供 offer、不消耗 `streakUnlockUsed`，改寫入待補做紀錄；之後第一次取得權威結果時補做，最多一次。
2. **（不變）** TTL 內的 snapshot 在離線時照常判定。
3. **（不變，D 自然滿足）** 跨日：第一天 `unknown`、隔天才得到權威結果時，第一天的 Sessions 仍被評估（有效則延續連勝），第一天的待補做也被補上。
4. **（不變）** `pro` 時補卡並提供保護 offer；`not-pro` 時照常重設，SUB-16 條件照舊。
5. **（改寫第 5 條）** 每個情況各有測試；`refreshProEntitlement()` 的回傳值不變，三個呼叫端在 refresh 之後多呼叫一次補做，除此之外行為不變。
6. **（新增）** 網路失敗（`status: 0`）與 throw 相同，保留 snapshot；HTTP 錯誤維持清除。
7. **（新增）** `legacy` source 下永遠不寫待補做紀錄，換日行為與現在相同。
8. **（刪除）** tasks.md「方向」中的訪客標記與 `{ status }` 回傳值：D 不需要。

## 8. 與 PRO-014L（草稿 PR #154）的關係

- PRO-014L 把 SUB-16 改成 server 授權（`grant_streak_unlock()` RPC）。D 讓「何時判斷 SUB-16」只剩 `applyProRolloverEffects()` 的 `not-pro` 分支一處，PRO-014L 只要把那一處的 client 寫入換成 RPC 呼叫。
- 所以 P 先合併、#154 之後 rebase，符合你決定的順序。#154 的衝突會集中在 `dayCycle.js` 的那一段。

## 9. 風險與範圍外

- **production（`legacy`）**：狀態永遠已知，不寫紀錄；refresh 在 `legacy` 下不呼叫 RPC。變動只有 `processYesterdayStreak()` 的結構（§6.3 說明結果相同），由既有測試與新增的 `legacy` 測試把關。PR 仍要 bump 版本（改到 `pwa/`）。
- **範圍外的既有問題（另立 `BUG-115`，見 §10 第 4 點）**：`orbit_shield_pending` 沒有 owner、登出也不刪除。同一台裝置上，A 帳號留下的 offer 會出現在 B 帳號；B 若是 Pro（新帳號都有試用，`legacy` 下試用就是 Pro）按下使用，B 的連勝就變成 A 的。連勝會影響 SUB-16 的 45 天解鎖。production 現在就會發生，需要共用裝置。
- 其他範圍外（不處理、只記錄）：
  - day watcher 不跑換日，頁面跨日一直開著時，換日要等下次啟動（現有行為）。
  - 不是 Pro 時按「使用保護卡」仍沒有回饋（只有 `unknown` 加提示）。
  - offer 放著不用時，使用會把連勝設回歸零前的值，蓋掉之後重新累積的天數（現有行為）。

## 10. 需要使用者決定

1. 採用 **D**（建議）或 T。
2. 同意 §7 改寫 tasks.md 的完成條件（第 1、5 條改寫，第 6、7 條新增，訪客標記與回傳值改版刪除）。
3. §6.5「網路失敗不刪 snapshot」併入這個 PR（建議：狀態判斷依賴它，而且它本身也擋 cutover）。
4. `BUG-115`（`orbit_shield_pending` 沒有 owner）：併入 PRO-014P 的實作 PR（建議：同一段 offer 程式，offer 加上 `ownerId`，首頁、個人頁與 `useStreakShield()` 不符時忽略、不刪除；`legacy` 也會改到，是 production 的修正）或另開 PR。
5. §6.6 的提示文字（建議沿用上面那句）。

# PRO-017 提案：邀請朋友解鎖 Pro

> 狀態：提案（只寫文件），等擁有者決定 §9。2026-11-11 使用者要求寫提案（「好你寫提案我看看」）。核准前不改程式、不動 production。

## 1. 結論

- **原始構想**（`docs/monetization.md` SUB-17）：設定頁產生個人邀請連結；成功邀請 3 位新使用者完成 onboarding → 邀請者得 30 天 Pro；邀請者與被邀請者各得 15 天試用。
- **照原樣做有三個問題**：
  1. **「被邀請者得 15 天試用」沒有意義**：每個新帳號第一次登入就自動開始 15 天試用（`start_trial()`，PRO-014C），有沒有被邀請都一樣。
  2. **「邀請者得 15 天試用」做不到**：試用每個帳號只有一次（`trial_started_at`），邀請者通常早就用過了。
  3. **「完成 onboarding」太容易造假**：註冊幾個 email、填完設定頁就算，自己邀請自己就能拿到 Pro。
- **建議**：
  - 邀請者：3 位被邀請者**各自有 7 個有效日**之後，得 30 天 Pro（和 SUB-16 一樣由 server 依 sessions 計算、記錄、發放）；每個帳號一生一次（或有上限，§9）。
  - 被邀請者：試用從 15 天延長為 30 天（不是第二次試用，是同一次試用變長）。
  - 全部在 server 判定，client 只負責分享連結、帶入邀請碼、顯示進度。
  - 拆成 R1（migration＋測試）→ RA（擁有者套用）→ R2（client）。

## 2. 現況（2026-11-11 的 main）

- **試用**：`start_trial()`（011）每個帳號一次、15 天（`pro_trial_duration()`）；新帳號第一次開機由 `app.js` 呼叫。
- **SUB-16**（012）：`grant_streak_unlock()` 由 server 依 sessions 判斷 45 天連勝，寫入 `pro_entitlements`（`is_pro = true`、`pro_expires_at = now() + 30 天`）並記錄一次性標記；已經是付費 Pro 的人回 `active_entitlement`、不發放。邀請獎勵可以用同一套寫法。
- **Pro 的判定**：PRO-014H（v1.41.15）起只看 `pro_entitlements`／`my_pro_status()`。
- **註冊**：`auth.js` 的 `signUp({ email, password })`；也有 Google 登入。目前沒有任何「從哪裡來」的紀錄。
- **分享**：`pwa/js/platform/share.js` 已經有原生分享（`supportsNativeShare()`）。
- **沒有** `referrals` 表；`docs/monetization.md` 只有一段草稿（欄位指向 `profiles(id)`，實際的主鍵是 `profiles(user_id)`，也沒有 policy）。

## 3. 流程

1. **邀請者**在設定頁看到自己的邀請連結（例如 `https://<app>/?ref=ABCD2345`）與進度「已完成 1／3 位」，可以用原生分享或複製。
2. **被邀請者**打開連結：app 把邀請碼存在本機（`localStorage`），首頁或登入頁顯示「朋友邀請你使用 Orbit」。
3. 被邀請者**註冊並第一次登入**後，app 呼叫 `redeem_referral(code)`：
   - server 確認：碼存在、不是自己的碼、這個帳號建立不到 7 天、還沒有綁定過邀請者；
   - 成功：記錄邀請關係，並把被邀請者的試用延長到 30 天；
   - 不論成功與否，app 清掉本機的邀請碼，不再重試。
4. 被邀請者正常使用。**有效日**沿用現有的定義（一天的有效 XP 達到門檻，與連勝相同）。
5. **邀請者**打開設定頁或同步時，app 呼叫 `claim_referral_reward()`：
   - server 數出「已有 7 個有效日的被邀請者」，達到 3 位且還沒領過 → 發放 30 天 Pro（規則同 SUB-16：已是付費 Pro 不發放；不縮短既有的付費期限）；
   - 回傳進度（幾位已達成、幾位還在進行）與是否發放。

## 4. 資料庫（R1）

- **`referral_codes`**（`user_id` 主鍵、`code` 唯一）：server 產生 8 碼，避開容易看錯的字（0／O、1／I），第一次要求時建立。
- **`referrals`**（`invitee_id` 主鍵、`inviter_id`、`redeemed_at`）：一個人只能被邀請一次。
- **`pro_entitlements`** 加 `referral_reward_granted_at`（一次性的標記，同 012 的 `streak_unlock_granted_at`）。
- **三個 RPC**（`SECURITY DEFINER`、`search_path = ''`、只給 `authenticated`）：
  - `get_my_referral_code()`：沒有就建立，回傳碼；
  - `redeem_referral(p_code text)`：§3 第 3 步的檢查與記錄；
  - `claim_referral_reward()`：§3 第 5 步。有效日在 server 由 `sessions` 計算，不相信 client 傳的任何數字。
- **權限**（CLAUDE.md 的例外條款：server-owned table）：
  - 兩張表都 `ENABLE ROW LEVEL SECURITY`；
  - 對 `anon`／`authenticated` `REVOKE` INSERT／UPDATE／DELETE，只能透過上面的 RPC 寫入；
  - 只建立 SELECT policy：`referral_codes` 只能讀自己的；`referrals` 只能讀「自己是被邀請者」的那一列；邀請者的進度只由 RPC 回傳數字，**看不到被邀請者是誰**（§9 第 5 點）；
  - migration 註解寫明「刻意不建立 INSERT／UPDATE／DELETE policy＝拒絕 client write」。
- **測試**（ASSERT，本機 PG）：不能邀請自己；同一個人不能被邀請兩次；帳號超過 7 天不能再綁定；有效日不足時不發放；3 位都達成時發放一次，第二次呼叫不再發放；已是付費 Pro 不發放；client 不能直接寫兩張表；anon 什麼都不能做。
- **回滾**：DROP 三個 RPC 與兩張表、移除欄位（client 先退回不呼叫的版本；已發放的 Pro 保留）。

## 5. Client（R2）

- **設定頁**：邀請連結、複製與分享按鈕、進度（0／3～3／3）、領到後顯示「已解鎖 30 天 Pro」。訪客看不到這一區（需要帳號）。
- **進入點**：啟動時讀網址的 `?ref=`，格式正確就存進本機，並從網址移除（避免分享截圖時帶出）；首次登入成功後呼叫 `redeem_referral()`。
- **Google 登入**：登入會轉址，邀請碼必須在轉址前就存在本機，回來時才讀得到（同上）。
- **發放後**：照 SUB-16 的做法重新取得 projection、顯示慶祝訊息。
- **INFRA-105**：新功能放在新模組，加進 SHELL；既有模組只 import 新模組的新 export。

## 6. 防止濫用

- **門檻在使用，而不是註冊**：每位被邀請者要有 7 個有效日，假帳號要一個一個實際打卡一週，成本高於 30 天 Pro 的價值。
- **獎勵有上限**：每個帳號一生一次（建議），或每 90 天一次、最多幾次。
- **只能在新帳號時綁定**：建立超過 7 天的帳號不能再輸入邀請碼，避免老使用者互相綁定。
- **不能自己邀請自己**：server 檢查 inviter ≠ invitee。同一個人用兩個 email 仍擋不住，靠有效日的門檻提高成本。
- **email 驗證**：Supabase 若沒開「確認 email」，假 email 也能註冊；建議在 RA 時確認 Auth 的設定（§9 第 6 點）。

## 7. 與其他任務的關係

- **PRO-014S**：邀請送的 Pro 寫成 `is_pro = true`，畫面會顯示成「付費 Pro」（同 SUB-16）。要不要另外標示來源，見 PRO-014S §7 第 2 點。
- **PRO-014E**：排行榜的 Pro 標記會包含邀請送的 Pro（`is_pro_active()`）。
- **HW-112、AI-015**：無關。

## 8. 驗收

- 兩個測試帳號：A 分享連結，B 用連結註冊 → B 的試用是 30 天；A 的進度顯示 0／3（B 尚未達 7 個有效日）。
- 在 SQL Editor 為測試帳號補上 sessions（或實際使用）後，A 的進度更新；3 位都達成時 A 得到 30 天 Pro，只發一次。
- 自己的碼、已綁定過的帳號、建立超過 7 天的帳號都無法綁定。
- client 直接寫 `referrals`／`referral_codes` 被拒；anon 什麼都不能做。

## 9. 需要擁有者決定

1. **拆成 R1 → RA → R2**（建議），或一次做完。
2. **邀請者的獎勵**：3 位達成 → 30 天 Pro（建議，與原構想相同），或每 1 位達成 → 10 天 Pro。
3. **被邀請者的獎勵**：試用延長為 30 天（建議），或不給（只有邀請者有獎勵）。
4. **「達成」的門檻**：7 個有效日（建議），或其他（例如 3 天、14 天、或連續 7 天）。
5. **邀請者能不能看到是誰**：不能，只看數字（建議，保護被邀請者），或顯示被邀請者的公開名稱（需要 PRO-014E 的 `display_name`）。
6. **email 驗證**：在 Supabase Auth 開啟「確認 email」（建議，RA 時一起確認；會影響所有新使用者的註冊流程），或維持現狀。
7. **獎勵次數**：一生一次（建議），或每 90 天一次。
8. **邀請碼的有效期**：被邀請者帳號建立後 7 天內可以綁定（建議），或其他。

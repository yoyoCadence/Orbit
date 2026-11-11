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
  - 有效日只算「被邀請者帳號建立當天（UTC）到今天」之間的日期。sessions 的日期是 client 寫的，不這樣限制的話，腳本可以在註冊後立刻補上 7 天的舊紀錄（§6）。
  - 被邀請者：**第一版不給額外獎勵**（建議）。原構想的「試用延長」在現在的資料模型做不到，見 §4.1 與 §9 第 3 點。
  - 全部在 server 判定，client 只負責分享連結、帶入邀請碼、顯示進度。
  - 拆成 R1（migration＋測試）→ RA（擁有者套用）→ R2（client）。

## 2. 現況（2026-11-11 的 main）

- **試用**：`start_trial()`（011）每個帳號一次、15 天（`pro_trial_duration()`，所有人都一樣）；`app.js` 在 profile 還沒有試用開始時間的任何一次開機呼叫它（通常是新帳號第一次開機）。試用的結束時間在 server 一律算成 `trial_started_at + pro_trial_duration()`（`is_pro_active()`、`my_pro_status()`），沒有「某個帳號的試用比較長」的欄位。
- **SUB-16**（012）：`grant_streak_unlock()` 由 server 依 sessions 判斷 45 天連勝，寫入 `pro_entitlements`（`is_pro = true`、`pro_expires_at = now() + 30 天`）並記錄一次性標記。**只要目前有 Pro（付費或試用中）就回 `active_entitlement`、不發放、也不消耗標記**，之後不是 Pro 時再領。它也說明了 sessions 由 client 寫入、不是防作弊的依據。邀請獎勵可以用同一套寫法。
- **Pro 的判定**：PRO-014H（v1.41.15）起只看 `pro_entitlements`／`my_pro_status()`。
- **註冊**：`auth.js` 的 `signUp({ email, password })`；也有 Google 登入。目前沒有任何「從哪裡來」的紀錄。
- **分享**：`pwa/js/platform/share.js` 已經有原生分享（`supportsNativeShare()`）。
- **沒有** `referrals` 表；`docs/monetization.md` 只有一段草稿（欄位指向 `profiles(id)`，實際的主鍵是 `profiles(user_id)`，也沒有 policy）。

## 3. 流程

1. **邀請者**在設定頁看到自己的邀請連結（例如 `https://<app>/?ref=ABCD2345`）與進度「已完成 1／3 位」，可以用原生分享或複製。
2. **被邀請者**打開連結：app 把邀請碼存在本機（`localStorage`），首頁或登入頁顯示「朋友邀請你使用 Orbit」。
3. 被邀請者**註冊並第一次登入**後，app 呼叫 `redeem_referral(code)`：
   - server 確認：碼存在、不是自己的碼、這個帳號建立不到 7 天、還沒有綁定過邀請者；
   - 成功：記錄邀請關係，並告訴被邀請者「你的使用進度會讓邀請你的人看到完成的人數」；
   - 成功或明確被拒（碼錯、已綁定、超過 7 天）就清掉本機的邀請碼；網路失敗則保留，下次登入再試。
4. 被邀請者正常使用。**有效日**沿用現有的定義（與連勝相同：有效 XP 至少 50、有 A 或 S 級任務、娛樂不超過 120 分鐘；012 在 server 已有同樣的判斷）。
5. **邀請者**打開設定頁或同步時，app 呼叫 `claim_referral_reward()`：
   - server 數出「已有 7 個有效日的被邀請者」，達到 3 位且還沒領過 → 發放 30 天 Pro；
   - 邀請者目前已經是 Pro（付費、試用或 SUB-16）時怎麼辦，見 §9 第 9 點（建議同 SUB-16：先不發、不消耗，之後不是 Pro 時再領）；**終身付費的人永遠不會走到發放**（否則會被寫成 30 天後到期）；
   - 回傳已達成的人數與是否發放。

## 4. 資料庫（R1）

- **`referral_codes`**（`user_id` 主鍵、`code` 唯一）：server 產生 8 碼，避開容易看錯的字（0／O、1／I），第一次要求時建立。
- **`referrals`**（`invitee_id` 主鍵、`inviter_id`、`redeemed_at`）：一個人只能被邀請一次。
- **`pro_entitlements`** 加 `referral_reward_granted_at`（一次性的標記，同 012 的 `streak_unlock_granted_at`）；`set_pro_entitlement_updated_at()` 的 trigger 要把新欄位算進去（012 也是這樣做的），回滾時還原。
- 獎勵若要改成「每位 10 天」或「每 90 天一次」（§9 第 2、7 點），`referrals` 還要一個「已計入獎勵」的欄位；一生一次的版本不需要。
- **三個 RPC**（`SECURITY DEFINER`、`search_path = ''`、只給 `authenticated`）：
  - `get_my_referral_code()`：沒有就建立，回傳碼；
  - `redeem_referral(p_code text)`：§3 第 3 步的檢查與記錄；
  - `claim_referral_reward()`：§3 第 5 步。有效日在 server 由 `sessions` 計算，只算被邀請者 `auth.users.created_at`（UTC 日期）到今天（UTC）之間的日期，不相信 client 傳的任何數字。以 `SELECT … FOR UPDATE` 鎖住邀請者的 entitlement 列，`UPDATE … WHERE referral_reward_granted_at IS NULL`，同時呼叫兩次也只發一次（同 012）。
- **權限**（CLAUDE.md 的例外條款：server-owned table；照 011 的寫法）：
  - 兩張表都 `ENABLE ROW LEVEL SECURITY`；
  - `REVOKE ALL … FROM public, anon, authenticated`（只收回寫入的話，Supabase 的預設權限仍讓 anon 能 SELECT、authenticated 能 TRUNCATE），再 `GRANT SELECT` 給 `authenticated`（只有 `referral_codes`）；
  - `referral_codes`：只建立「讀自己的」SELECT policy；
  - `referrals`：client 完全不能讀（不 GRANT、不建立 policy），需要的資訊都由 RPC 回傳；被邀請者那一列含有 `inviter_id`，不需要給 client；
  - 三個 RPC 都 `REVOKE EXECUTE … FROM public, anon`、`GRANT EXECUTE … TO authenticated`；
  - migration 註解寫明「刻意不建立 INSERT／UPDATE／DELETE policy＝拒絕 client write」。
- **測試**（ASSERT，本機 PG）：不能邀請自己；同一個人不能被邀請兩次；帳號超過 7 天不能再綁定；有效日不足時不發放；帳號建立之前日期的 sessions 不算；3 位都達成時發放一次，第二次呼叫不再發放；兩個連線同時領取只發一次；已是 Pro 不發放也不消耗；終身付費不被改成有期限；client 不能讀寫 `referrals`、不能寫 `referral_codes`；anon 什麼都不能做。
- **回滾**：client 先退回不呼叫的版本；DROP 三個 RPC 與兩張表、還原 `set_pro_entitlement_updated_at()`、移除欄位（已發放的 Pro 保留）。

### 4.1 被邀請者的獎勵為什麼不簡單

- **延長試用**：試用的結束時間在 server 一律是 `trial_started_at + 15 天`。把 `trial_started_at` 往後移會被 `trial_started_at <= now()` 的檢查擋下，被邀請者反而失去 Pro。要做到只能加一個「這個帳號的試用額外天數」欄位，並改寫 `is_pro_active()`（011、012、015 都在用）與 `my_pro_status()`：這正好是 PRO-014S 建議「一起做」的那一次 RPC 變更，回滾也要還原 011／014 的定義。
- **改成送 Pro**（例如試用結束後再送 15 天，寫成 `is_pro = true`）：做得到，但畫面會顯示成「付費 Pro」（PRO-014S §7 第 2 點），而且 redeem 時被邀請者可能還沒開始試用（`pro_entitlements` 還沒有這一列），要處理。
- **不給**：最簡單，邀請者的獎勵本來就是主要誘因。
- 選哪一個見 §9 第 3 點。

## 5. Client（R2）

- **設定頁**：邀請連結、複製與分享按鈕、進度（0／3～3／3）、領到後顯示「已解鎖 30 天 Pro」。訪客看不到這一區（需要帳號）。
- **進入點**：啟動時讀網址的 `?ref=`，格式正確就存進本機，並從網址移除（避免分享截圖時帶出）；只要本機有邀請碼，任何一次登入成功都呼叫 `redeem_referral()`（server 會擋掉超過 7 天的帳號），不只第一次。
- **邀請碼可能遺失**：
  - iOS 的主畫面 app 與 Safari 不共用儲存空間，`start_url` 也不帶網址參數；在 Safari 打開連結、之後才加入主畫面並註冊，邀請碼就不見了；
  - email 驗證連結（§9 第 6 點）可能在另一個瀏覽器打開；
  - 所以設定頁也要能**手動輸入邀請碼**（帳號建立 7 天內）。
- **Google 登入**：登入會轉址，邀請碼在轉址前就存在本機，回來時讀得到。
- **發放後**：照 SUB-16 的做法重新取得 projection、顯示慶祝訊息。
- **INFRA-105**：新功能放在新模組，加進 SHELL；既有模組只 import 新模組的新 export。

## 6. 防止濫用

- **門檻在使用，而不是註冊**：每位被邀請者要有 7 個有效日。sessions 是 client 寫的（日期也是），所以擋不住腳本寫入假紀錄；能做到的是只算帳號建立之後的日期，**每個假帳號至少要存在 7 天**。實際的代價是「先準備 3 個存在一週以上、每天寫入紀錄的帳號」，對 30 天 Pro 來說仍不划算，但不是做不到。
- **獎勵有上限**：每個帳號一生一次（建議），或每 90 天一次、最多幾次。
- **只能在新帳號時綁定**：建立超過 7 天的帳號不能再輸入邀請碼，避免老使用者互相綁定。
- **不能自己邀請自己**：server 檢查 inviter ≠ invitee。同一個人用兩個 email 仍擋不住，靠有效日的門檻提高成本。
- **email 驗證**：Supabase 若沒開「確認 email」，假 email 也能註冊；建議在 RA 時確認 Auth 的設定（§9 第 6 點）。開了也擋不住同一個信箱的 `+alias` 寫法。
- **隱私**：邀請者只看到「已達成的人數」。但只邀請一兩個人時，人數的變化仍會透露那位朋友有沒有註冊、何時達成；所以 redeem 時要告知被邀請者（§3 第 3 步），也不顯示「進行中」的人數。

## 7. 與其他任務的關係

- **PRO-014S**：邀請送的 Pro 寫成 `is_pro = true`，畫面會顯示成「付費 Pro」（同 SUB-16）。要不要另外標示來源，見 PRO-014S §7 第 2 點。被邀請者的試用若要延長（§4.1），需要改 `is_pro_active()`／`my_pro_status()`，應與 PRO-014S 一起做。
- **PRO-014E**：排行榜的 Pro 標記會包含邀請送的 Pro（`is_pro_active()`）。
- **HW-112、AI-015**：無關。

## 8. 驗收

- 兩個測試帳號：A 分享連結，B 用連結註冊 → B 被告知會計入 A 的人數；A 的已達成人數為 0（B 尚未達 7 個有效日）。
- 在 SQL Editor 為測試帳號補上 sessions（或實際使用）後，A 的進度更新；3 位都達成時 A 得到 30 天 Pro，只發一次。
- 自己的碼、已綁定過的帳號、建立超過 7 天的帳號都無法綁定；B 在 SQL Editor 補上帳號建立前日期的 sessions 不會被計入。
- client 直接寫 `referrals`／`referral_codes` 被拒；anon 什麼都不能做。

## 9. 需要擁有者決定

1. **拆成 R1 → RA → R2**（建議），或一次做完。
2. **邀請者的獎勵**：3 位達成 → 30 天 Pro（建議，與原構想相同），或每 1 位達成 → 10 天 Pro。
3. **被邀請者的獎勵**（§4.1）：第一版不給（建議）；或延長試用（要改 `is_pro_active()`／`my_pro_status()`，與 PRO-014S 一起做）；或試用結束後送 15 天 Pro（畫面顯示為付費 Pro）。
4. **「達成」的門檻**：7 個有效日（建議），或其他（例如 3 天、14 天、或連續 7 天）。
5. **邀請者能不能看到是誰**：不能，只看已達成的人數（建議，保護被邀請者；redeem 時告知），或顯示被邀請者的公開名稱（需要 PRO-014E 的 `display_name`）。
6. **email 驗證**：在 Supabase Auth 開啟「確認 email」（建議，RA 時一起確認；會影響所有新使用者的註冊流程），或維持現狀。
7. **獎勵次數**：一生一次（建議），或每 90 天一次。
8. **邀請碼的有效期**：被邀請者帳號建立後 7 天內可以綁定（建議），或其他。
9. **邀請者已經是 Pro 時**：同 SUB-16，先不發、不消耗，之後不是 Pro 時再領（建議）；或加在現有的付費期限之後（終身付費除外）；或直接作廢。

# Orbit Tasks

本文件是 Orbit 的可交接任務清單，供 Codex、Claude Code 與人類開發者共用。

規則：

- 任務狀態固定為 `Backlog / Next / In Progress / Done`
- 任務應可直接執行，不依賴聊天上下文
- 任務粒度保持小而明確
- 任務內容以目前 repo 現況與 `README.md`、`ROADMAP.md` 為準
- 接手進行中的工作（未合併的 PR、與使用者約定的合併規則、待決事項）先看 [`docs/agent-handoff.md`](docs/agent-handoff.md)；每完成一個段落開 PR 時一併更新它

---

## Backlog

- [ ] **PRO-014HB** 移除 PRO-014H 保留的 legacy 相容層
  - 時機：PRO-014HA 通過、`server` 穩定一段時間（例如兩週沒有回退）之後。
  - 範圍：`startTrial()` 寫回 `trial_started_at`、`grantStreakUnlock()` 寫回 `is_pro`／`pro_expires_at`、`showMainApp()` 的 `FLAG_STREAK_UNLOCK_NEW` 處理（`flags.js` 的 export 保留，INFRA-105）；開機的「要不要開始試用」改依 projection（例如已知 Pro 就不呼叫），設定頁試用進度條的開始時間改用別的來源或隱藏。
  - 移除後回退不再只是改旗標：要先把 server 的試用與付費寫回 profile（production 寫入，需核准）；查詢與步驟寫進本任務的文件。

- [ ] **REPO-001** Repo 清理（AUDIT-001 發現，需擁有者決定）
  - `output/`：30 個 tracked 檔、約 58 MB 的舊 proof 圖，app 與測試都沒有使用（只在 `skills/orbit-idle-window-assets` 的說明中當輸出目錄、eslint 忽略）。可刪除（歷史仍保留在 git）。
  - 遠端約 160 個已合併或過時的分支、過時的 draft PR #154：可清理。
  - 2026-11-02 使用者決定：先記錄，之後自行處理（agent 不刪除）。

- [ ] **HW-112** 佐證圖片雲端同步（Supabase Storage）
  - Goal: upload proof photos to Supabase Storage so they persist across devices and app reinstalls.
  - （原始範圍，已由下方的提案取代）Scope: `platform/badge.js` → new `pwa/js/platform/proofStorage.js` adapter; bucket `orbit-proof`, path `{user_id}/{sessionId}.jpg`; RLS: SELECT/INSERT/DELETE scoped to `auth.uid()`; use existing `compressImage()` output; graceful fallback to localStorage-only for guests.
  - Acceptance: logged-in user completes a task, attaches proof, photo survives sign-out and re-login on a different device; guest mode still works with localStorage only; no service_role key in client code.
  - Note: requires Supabase Storage RLS policy and a bucket — propose SQL migration before implementation.
  - 提案（2026-11-11，使用者要求寫提案）：[`docs/hw-112-proof-photo-sync-proposal.md`](docs/hw-112-proof-photo-sync-proposal.md)。建議私有 bucket `proofs`、路徑 `{user_id}/{session_id}.jpg`、四個 policy；拆成 HW-112A（migration 016＋測試）→ HW-112B（擁有者套用）→ HW-112C（client）。等擁有者決定 §9（9 點；Codex 與獨立審查後修訂：下載不用 list、不放 localStorage）。
  - **核准（2026-11-11）**：§9 全部照建議。HW-112A 完成（見 Done）；HW-112B 已於 2026-11-13 套用（見 Done）；HW-112C1（上傳）完成（#254，見 Done）；HW-112C2a（其他裝置顯示）與 HW-112C2b（設定頁、登出）完成（見 Done）；剩下擁有者驗收（HW-112D，Next）。
  - HW-112C 上線後，`pwa/js/statusBarNotice.js`（BUG-118）的「佐證照片只存在這台裝置」要改成只提醒還沒上傳的照片。
  - HW-112C 的驗收（從 HW-112B 移過來）：以兩個測試帳號經 Storage API 實測——本人可以上傳、讀、刪自己的檔案；不能碰別人的資料夾；上傳超過 200 KB 或不是 JPEG 被拒（大小與類型由 API 在上傳時檢查，資料庫測不到）。下載時不能相信大小與類型（只當 JPEG 顯示在 `<img>`，過大的不處理；移動與複製不會再檢查，016 開頭有說明）。

- [ ] **INFRA-101** 設定 Custom SMTP（Resend）並自訂 email 寄件人名稱與模板
  - 目標：讓 auth email（重設密碼等）以「Orbit」名義寄出，而非「Supabase Auth」；並把 email 內容換成品牌模板
  - 目前限制：Supabase 內建 email 每天只能寄 2 封，Sender name 無法自訂，不適合正式上線
  - 步驟：
    1. 在 resend.com 免費註冊，取得 API key
    2. Supabase → Authentication → Notifications → Email → SMTP Settings → Enable Custom SMTP
       - Host: `smtp.resend.com`、Port: `465`、Username: `resend`、Password: Resend API key
       - Sender email: `onboarding@resend.dev`（有自訂域名後再換）、Sender name: `Orbit`
    3. Authentication → Notifications → Email → Templates，更新 Reset Password / Confirm Signup 模板（英文品牌版內容已備好，ask Claude）
  - 備註：Resend 免費方案 3,000 封/月；之後有域名可換成 `noreply@yourdomain.com`

- [ ] **PS-211D** 跨版本保存 V2 素材快取（以 `manifest.json` 的 `sha256` 為 key）
  - 背景：PS-211 提案 §5 D。activate 時保留素材快取、依目前 manifest 清理，讓沒改的素材在改版後不必重新下載。
  - 暫緩（使用者 2026-10-20 同意）：素材仍在調整；且要先驗證 GitHub Pages 的 ETag 是否隨部署改變（`curl -I` 比較兩次部署中同一個沒改過的素材）。ETag 不變時，PS-211A 之後的效益很小。
  - 改 service worker 與部署語意，實作前需提案與核准。

- [ ] **PS-227** Generate controlled idle furniture variants from approved references
  - Goal: replace one-view-only expanded props with true `front / left-wall-flush / right-wall-flush` variants that preserve material identity.
  - Scope: legacy Idle Growth Window only; pause further volume work while the fixed-camera Personal Space V2 vertical slice is validated.
  - Acceptance: resume only if a validated runtime interaction still needs multiple authored perspectives; preserve all completed variant assets and provenance in the meantime.

- [ ] **PRO-014** SUB-14／Pro entitlement 工作串
  - 目標：先建立可信任的 server-owned Pro entitlement，再交付排行榜與 Personal Space 的 Pro 呈現
  - 拆分：PR #132 只完成 `PRO-014A`；`PRO-014B`～`PRO-014F` 各自以後續 PR 處理，避免 schema foundation、client cutover、環境套用與呈現功能混在同一審查範圍
  - **執行順序（PR #146／#148／#149 覆驗定案，勿自行推導）** —— schema-first，資料庫先於 client：
    1. `PRO-014A` 提交 migration 011（**完成**）
    2. `PRO-014B` server-derived UI projection（**完成**）
    3. `PRO-014C` 在分支實作 trial RPC 與 gate 路徑 —— **實作完成即為 Done，但該 PR 不得合併**
    4. `PRO-014D` 以 `PRO-014C` 的分支 ＋ 011 在 preview 專案驗證
    5. `PRO-014I` 在 production 套用並驗證 011
    6. `PRO-014J` 才合併並部署 `PRO-014C` 的 client
    7. `PRO-014L` 讓 SUB-16 連勝解鎖改由 server 授權（否則 cutover 會讓它靜默失效）
    8. `PRO-014P` 換日處理只依權威的 entitlement 結果執行（否則 projection 過期的付費使用者會失去保護卡與 offer）— **完成**（#221，v1.41.5）
    9. `PRO-014RA` 在 production 套用 014，讓終身付費不被試用日期限制（**完成**，2026-11-01）
    10. `PRO-014H` 另案核准後執行 cutover（旗標切到 `server`）（**完成**，2026-11-11，v1.41.15；真機驗證 `PRO-014HA`、相容層移除 `PRO-014HB`）
  - **為什麼 C 的實作與部署要拆開**：`.github/workflows/deploy.yml` 在每次 push `main` 後自動部署 `pwa/`，所以**合併 = 部署**。`PRO-014C` 的 client 會呼叫 `start_trial()`，若在 `PRO-014I` 之前合併，該 function 在 production 還不存在，trial 會整段失效。舊版寫「I 必須在 C 部署之前或同時完成」既與順序衝突，「同時」也無法保證原子性 —— 因此把合併本身變成一個有前置的具名任務（`PRO-014J`），而不是塞在 C 裡的但書。
  - `PRO-014E` → `PRO-014F` 為呈現層，接在 `PRO-014D` 之後。`PRO-014G` 為可選 hardening，不在主線上。`PRO-014H` 的實機驗證使用 `PRO-014Q` Q6 建立的測試帳號（[`docs/pro-test-accounts.md`](docs/pro-test-accounts.md)）；`PRO-014M` 的開發者面板模擬已由 Q6 移除。
  - 狀態：此項只作為追蹤母項，不直接進入實作；各子任務需各自遵守 `Next → In Progress → Done`
  - 既有 PR：[#132](https://github.com/yoyoCadence/Orbit/pull/132)（Ready for review；開始後續任務前應確認最新 head）

- [ ] **PRO-014S**（可選）`my_pro_status()` 明確回傳是否付費（提案改名為 `paid_active`，與 012 一致），移除付費／試用的推斷
  - 來源：PRO-014N 以 PRO-014R 的方案 A 結案時，把原本「不需推斷」的條件改列在這裡（2026-11-01）。
  - 範圍：RPC 新增回傳欄位（改回傳型別需 `DROP FUNCTION` 再建立並重新 `REVOKE`／`GRANT`，可包在同一個 transaction）；client 改讀新欄位，server 尚未提供時退回推斷；部署順序先 migration 後 client。
  - 屬 RPC 契約變更，依 AGENTS.md §3 需先核准。014 之後推斷已精確，沒有正確性上的急迫性。
  - 提案（2026-11-11，使用者要求寫提案）：[`docs/pro-014s-explicit-paid-active-proposal.md`](docs/pro-014s-explicit-paid-active-proposal.md)。欄位名稱 `paid_active`（與 012 一致）；授權的到期時間也不再依賴 014 的規則（終身付費不受試用日期限制）；建議等下一次改 `my_pro_status()` 時（PRO-014G、接上付款或 PRO-017）一起做；新版 client 沒有 `paid_active` 時照舊推斷。等擁有者決定 §7。
  - **決定（2026-11-11）**：照建議，等下一次改 `my_pro_status()` 時一起做；送的 Pro（SUB-16、PRO-017）也算付費。

- [ ] **PRO-014G**（可選）為 entitlement projection 加上 server 簽章的 anti-tamper hardening
  - **狀態：可選，非任何任務的前置。** PR #146 覆驗定案採「UI entitlement projection ＋ server-side enforcement」，signed receipt 不再是 `PRO-014B` 的必要條件。
  - 何時才做：只有在產品明確需要提高「離線 UI 防竄改」的門檻時才啟動。判斷依據是產品需求，不是安全需求 —— 真正的安全控制在 server 端（見 `PRO-014F`）。
  - 為什麼不預設做：簽章擋得掉「手寫一段合法的 localStorage JSON」，但擋不掉裝置擁有者直接改 `isProUser()`。它會引入 RPC contract 變更、簽章私鑰保管、公鑰佈署與輪替等高風險複雜度，若所有呼叫點都只是 UI 顯示／隱藏，投入與所得不成比例。
  - 範圍（若啟動）：`my_pro_status()` 增加 detached JWS receipt 欄位、資料庫端簽章金鑰、公鑰 vendored 進 repo、client 以 Web Crypto 驗章、已驗證結果只存記憶體
  - 完成條件（若啟動）：格式合法但未簽章的偽造 projection 被拒（回歸測試）；receipt `exp` 過期 fail closed；公鑰載入失敗 fail closed；離線首次啟動仍需驗章
  - **前置：屬 RPC／schema 變更，依 AGENTS.md §3 需先取得核准**；若啟動，建議與 `PRO-014D` 合併規劃
  - 提案文件：[`docs/pro-014-entitlement-integrity.md`](docs/pro-014-entitlement-integrity.md)
  - 2026-11-11 重新評估（使用者要求寫提案）：同文件 §7。cutover 後所有 Pro 功能仍只在 client、不花 server 資源，建議維持「可選、現在不做」；會花 server 資源的 Pro 功能由 server 檢查。等擁有者決定。
  - 依賴：`PRO-014B`
  - **決定（2026-11-11）**：維持「可選、現在不做」。

- [ ] **PRO-014E** 另案建立 `display_name` 與排行榜安全 read model
  - INFRA-110（2026-11-03）：`leaderboard_view` 已收回 anon 與 PUBLIC 的權限（015）。若以 `DROP VIEW` 重建 view，Supabase 的預設權限會再給 anon 全部權限，重建後要再執行 015 的 REVOKE／GRANT（`CREATE OR REPLACE VIEW` 則保留權限）。
  - 目標：在 entitlement foundation 穩定後，以新 PR 提出 `display_name` 寫入規則及排行榜可公開欄位，不沿用 PR #132 的混合範圍
  - 範圍：欄位／constraint、owner-scoped update、leaderboard view 或 RPC、明確 `REVOKE`／`GRANT`、資料逃逸測試與 migration 文件
  - 安全閘門：此項是另一個 schema proposal；實作與套用前需個別核准
  - 依賴：`PRO-014D`
  - 提案（2026-11-11，使用者要求寫提案）：[`docs/pro-014e-leaderboard-read-model-proposal.md`](docs/pro-014e-leaderboard-read-model-proposal.md)。主要問題：排行榜顯示的 `name` 預設是 email 的 @ 前段。建議 `profiles.display_name`（開啟排行榜時自己設定）＋ RPC `get_leaderboard()`（固定欄位、`is_me` 取代 `user_id`、server 判定的 `is_pro`）；公開名稱與排行榜開關改為單獨的寫入（不隨整份 profile 同步）；拆成 E1（migration＋測試）→ EA（擁有者套用）→ E2（client）→ E3（移除舊 view）。等擁有者決定 §9（12 點）。
  - **核准（2026-11-11）**：§9 照建議，但第 2 點改為 B（既有公開使用者的 `name` 複製成 `display_name`，繼續公開）。
  - E1 完成（2026-11-12，#247，見 Done 的 PRO-014E1）；EA 已於 2026-11-13 套用（見 Done）；E2 完成（2026-11-13，#250，v1.41.18，見 Done 的 PRO-014E2）。
  - **下一步 E3**（另行核准）：E2 上線一個月後（約 2026-12-13，§9 第 11 點）提出移除 `leaderboard_view` 的 migration（`DROP VIEW`，不重建）。在那之前，還沒更新的舊版 client 仍讀這個 view（`name` 已是公開名稱或「匿名」），profile 同步仍會上傳 `is_public`。
  - E2 要注意（E1 決定的規則；E2 已照做）：
    - client 以和 `profiles_display_name_check` 完全相同的規則先檢查：1–20 字（以 code point 計，JS 用 `[...name].length`）；任何位置都不能有 018 列出的字元（控制字元、半形空白以外的空白類、零寬與方向控制、ZWJ 與 ZWNJ、Hangul／Braille 的空白字元、U+1D159、U+1D173–U+1D17A、U+1BCA0–U+1BCA3、U+13430–U+1343F、U+16FE4、U+E0080–U+E00FF、U+E01F0–U+E0FFF、BOM、軟連字號）；開頭不能是空白、variation selector 或 tag；結尾不能是空白（後面只接 variation selector／tag 也不行）。以 ZWJ 組成的 emoji（例如家庭、職業的 emoji）會被擋下，單一 emoji、加 variation selector 的 emoji 與英格蘭旗可以；ZWNJ（U+200C）被擋，波斯文與部分印度文字的名稱會受影響（目前使用者用不到）。名稱可能很寬或堆疊組合符號，排行榜的 CSS 要截斷。
    - 排行榜改用 `supabase.rpc('get_leaderboard')`，欄位：`display_name, avatar_path, total_xp, week_xp, streak_days, mode, joined_on, is_me, is_pro`；`joined_on` 與本週 XP 都以 UTC 計算。
    - 公開名稱與 `is_public` 從 `PROFILE_FIELDS` 的上傳拿掉，改成設定頁單獨、等待結果的寫入（提案 §5）。
    - 頭像：BUG-119（017）之後，別人只讀得到公開使用者 `avatar_url` 指向的那一個檔案；`get_leaderboard()` 的 `avatar_path` 只在它是本人資料夾裡的路徑時才有值，其他（舊資料的網址、任意網址、data: URL、別人的路徑）是 NULL，client 顯示預設頭像，不去載入別人指定的網址。

- [x] **PRO-014F** 交付 SUB-14 排行榜 glow 與 Personal Space Pro 呈現
  - 進度：排行榜的光環與標記為 PRO-014F1（完成，見 Done）；Personal Space 的部分為 PRO-014F2 F2A（完成，#260，見 Done）。擁有者 2026-11-19 決定不做 F2B（Pro 專屬的世界變化），PRO-014F 沒有剩下的工作。
  - 目標：只使用安全 read model 與 entitlement snapshot 呈現 Pro 身分，不讓視覺功能回寫 entitlement
  - 範圍：排行榜、Personal Space projection、HTML escaping、reduced motion、responsive 與視覺／E2E regression tests
  - 完成條件：Pro／非 Pro／匿名狀態顯示正確，動態文字安全，reduced motion 下無必要動畫，且不改動 auth／entitlement schema
  - **完成條件（server-side enforcement，PR #146 覆驗新增）**：任何有實際價值的 Pro 資料、API 或操作，都必須由 server 自行驗證 `is_pro_active`（RLS policy 或 RPC 內部判斷），**不得**相信 `storage.isProUser()` 或任何由 client 傳入的 Pro 狀態。交付時需逐項列出本次新增的 Pro 入口分別由哪一層強制授權；純顯示／隱藏可只靠 client projection，取得資料或觸發運算則不可。
  - 依賴：`PRO-014E`

- [ ] **PRO-017** 邀請制解鎖 Pro
  - 目標：完成 roadmap 既有 SUB-17
  - 對應 roadmap：中期
  - 提案（2026-11-11，使用者要求寫提案）：[`docs/pro-017-invite-unlock-proposal.md`](docs/pro-017-invite-unlock-proposal.md)。原構想的「雙方各得 15 天試用」與現況不合（新帳號本來就有 15 天試用、試用每帳號一次），「完成 onboarding」容易造假。建議：3 位被邀請者各有 7 個有效日（只算帳號建立之後的日期）後邀請者得 30 天 Pro（server 依 sessions 判定、一生一次）；被邀請者第一版不給額外獎勵（延長試用要改 `is_pro_active()`／`my_pro_status()`，與 PRO-014S 一起做）；拆成 R1→RA→R2。等擁有者決定 §9（9 點）。
  - **核准（2026-11-11）**：§9 全部照建議。RA 時擁有者在 Supabase Auth 開啟「確認 email」。
  - R1 完成（2026-11-12，#248，見 Done 的 PRO-017R1）；RA 的 019 已於 2026-11-13 套用（見 Done），「確認 email」等擁有者（Next 的 PRO-017RA-Auth）；之後 R2（client）。
  - R2 要注意（R1 決定的介面）：
    - `get_my_referral_code()` 回傳 8 碼（`A-H J-N P-Z 2-9`，沒有 0／O、1／I）；`redeem_referral(p_code)` 先做 NFKC 正規化（全形字母、數字與空白變半形），再去掉前後的空白、tab、換行，不分大小寫；回傳 `redeemed`／`invalid_code`／`own_code`／`already_redeemed`／`too_late`（已經綁定或帳號太舊的人先回答，不查碼）：`redeemed` 與明確被拒的四種都清掉本機的邀請碼，網路錯誤才保留。
    - `claim_referral_reward()` 回傳 `status`（`granted`／`already_granted`／`active_entitlement`／`not_eligible`）、`achieved_count`、`required_count`（3）與 entitlement 的欄位（同 `grant_streak_unlock()`，含 `paid_active`）；發放後照 SUB-16 重新取得 projection。
    - 帳號建立超過 7 天就不能綁定（以 `auth.users.created_at` 判斷）；設定頁的手動輸入只在這 7 天內顯示。被邀請者的帳號要存在滿 7 天（168 小時）、而且有 7 個有效日才算達成，所以邀請者最快在被邀請者註冊 7 天後才看到人數增加。

- [ ] **AI-015** AI 晨間報告
  - 目標：完成 roadmap 既有 SUB-15
  - 對應 roadmap：長期（v2.x）
  - 提案（2026-11-11，使用者要求寫提案）：[`docs/ai-015-morning-report-proposal.md`](docs/ai-015-morning-report-proposal.md)。建議改由 Supabase Edge Function 呼叫 Claude API（key 只在 server、server 檢查 Pro 與一天一次、資料由 server 讀取），以使用者身分呼叫 `my_pro_status()` 檢查 Pro、先佔一天的名額再呼叫 Claude，預設只送統計不送任務名稱；模型與費用由擁有者決定。等擁有者決定 §9（8 點）。
  - **決定（2026-11-11）**：排在其他項目之後。**擋住：沒有 API key。** 使用者目前沒有 Anthropic API 方案。
    - 訂閱額度不能用：Claude Pro／Max 與 ChatGPT Plus 是給本人在官方 app 使用的，不提供給其他 app 的 server 呼叫。Anthropic 明文禁止第三方產品使用 Claude.ai 登入或訂閱額度（Agent SDK 文件），違反可能被停權；ChatGPT 的訂閱也不含 API，OpenAI API 另外按用量計費。
    - OAuth：Anthropic 與 OpenAI 都沒有讓其他 app 以使用者的訂閱呼叫模型的 OAuth。
    - 可行的路：擁有者開 API 帳號、預付小額（例如 $5）並設定每月上限；`claude-haiku-5-5` 每人每月約 $0.03。或維持現在的規則版建議，不做 AI。等擁有者決定。


---

## Next

> 2026-11-26 擁有者：「好啊 繼續做」「不用停 能做就一直做吧」→ 先做 PS-260F（#275 留下的兩個 P3，#276），之後 Next 只剩需要擁有者的項目，agent 依 2026-11-18 的做法列出新的完善項目：TEST-004～TEST-012（補單元測試，完成，見 Done）；BUG-121～127（review 找到的問題，完成）；BUG-129～132（#287 review 找到的設定頁問題，完成）；BUG-133（同時跑兩次同步，完成）；BUG-134（首頁重畫時累積監聽，完成）；BUG-135（拖曳後吃掉下一次點擊，完成）；BUG-136～137（拖曳的邊界情況，完成）；BUG-138～139（個人頁，完成）；TEST-013＋BUG-140（`app.js`；登出時收起同步橫幅，完成）；BUG-142～143（#296 記下的兩個同步狀態問題，完成）；TEST-014＋BUG-144～145（導覽、DOM 動作、auth 包裝與 utils 的測試；導覽跳過、完成紀錄的有效日，完成）；BUG-146（週回顧、個人頁與首頁的日期改用有效日，完成）；TEST-015（到期就會失敗的測試，完成）；TEST-016（依執行順序才會通過的測試，完成）；TEST-017（#301 的後續，完成）；BUG-120（註冊後自動登入失敗時沒有說明，需核准）；BUG-141（帳號載入失敗後改用訪客，仍以帳號同步，需核准）。

> 2026-11-18 擁有者要求：「列出幾個你覺得需要完善的事 持續完善」，每完成一段就開 PR 並合併，不必特別詢問（必要時才問）。agent 列出的完善清單如下，依序做；需要核准的另外標明。

- [ ] **BUG-128** 把任務改成 S 級的日期跨裝置保留（BUG-127 留下的部分，需核准：schema）
  - BUG-127 以這台裝置的 `sSince` 記錄任務改成 S 級的那一天；`tasks` 表沒有這個欄位。同一台裝置從雲端同步時會保留（`loadFromRemote` 依 id 帶回），但另一台裝置看不到，所以同一天在另一台裝置仍可再改。要完整保留需要新增 `tasks.s_since`（date，可為 NULL）並加入 `TASK_FIELDS`；這是 schema 變更，依規則需擁有者核准後才做。

- [ ] **HW-112D** 佐證照片：擁有者驗收與後續評估（HW-112C1／C2a／C2b 已完成，見 Done）
  - 留下的 P3（#257 審查，不急）：(1) ~~永遠上傳不了的照片會讓「檢查同步」一直說還有照片沒上傳~~ 已於 #261 完成（v1.41.26，擁有者 2026-11-19 同意，見 Done 的 HW-112D (a)）；(2) ~~`storage.saveSessions()` 不檢查擁有者~~ 已於 #262 完成（v1.41.27，見 Done 的 HW-112D (b)）。
  - **需要擁有者決定**（#257 Codex P2）：「刪除所有佐證照片」只刪這台裝置與雲端；其他裝置已下載的副本（IndexedDB）留到那台裝置登出或「清除這台裝置的佐證照片」，確認文字已照實說明。要讓其他裝置也自動清掉，需要 (a) profile 加一個「照片全部刪除時間」欄位（schema 變更，需核准），其他裝置同步時比對並清掉較早的下載副本；或 (b) 每台裝置每次同步列出這個帳號的雲端資料夾（每 100 張一個請求）並清掉雲端已沒有的副本。agent 建議 (a)，但目前不做，等擁有者決定。
  - ~~評估（#254 第四輪留下的）：清掉沒有對應紀錄的雲端檔案~~ 已於 #263 完成（v1.41.28，擁有者 2026-11-19 同意，見 Done 的 HW-112D (c)）。
  - ~~待辦（#262 第二輪審查 P3 #2）：訪客設定畫面與另一個分頁~~ 已於 #264 完成（v1.41.29，見 Done 的 HW-112D 後續）。
  - 驗收需要擁有者：以兩個測試帳號經 Storage API 實測本人可上傳、讀、刪自己的檔案、不能碰別人的資料夾、超過 200 KB 或不是 JPEG 被拒（agent 沒有測試帳號的密碼）。
- [ ] **BUG-120** 註冊後自動登入失敗時，畫面沒有任何說明（TEST-004 寫測試時發現，2026-11-26；#277 獨立 review 更正；屬 auth UI，**需擁有者核准**）
  - 現況：`authFlow.js` 註冊成功後立刻自動登入。自動登入失敗時，先把「註冊成功！請用剛設定的密碼登入。」寫進 `#auth-error`，接著 `switchAuthTab('signin')` 又把 `#auth-error` 隱藏——**這段訊息從來不會出現**，使用者只看到畫面跳回登入分頁。現在「確認 email」關閉，很少走到這裡。
  - PRO-017RA-Auth 開啟「確認 email」之後：**每一個新註冊**都會走到這裡（Supabase 對還沒確認的帳號回 `Email not confirmed`），使用者沒有任何提示，再登入只會看到英文錯誤，不知道要先到信箱點確認連結。另外，依 Supabase 文件，開啟後用已註冊的 email 再註冊不會回 `User already registered`（回傳看起來成功的結果，以免洩漏帳號是否存在），「此 Email 已註冊，請直接登入」不會再出現，也會落到同一段。
  - 建議：`signUp` 成功但 `data.session` 為 null（需要確認 email）時不自動登入，切到登入分頁**之後**再顯示「確認信已寄到 …，點信中的連結後再登入；若這個 Email 已註冊過，請直接登入或重設密碼」；登入遇到 `Email not confirmed` 時顯示同樣的說明。`tests/unit/authFlowForms.test.js` 目前固定了現況（訊息被隱藏），改的時候一起改。
  - 順序：在 PRO-017RA-Auth 開啟「確認 email」之前完成。
- [ ] **BUG-141** 帳號載入失敗後改用訪客，app 仍以那個帳號同步（TEST-013 檢查 `app.js` 時發現，2026-11-27，main 上原本就有；屬 auth 流程，**需擁有者核准**）
  - 根本原因：登入後雲端資料載入失敗（例如離線或 500），而這台裝置沒有這個帳號的快取時，`loadAndStart()` 回到登入畫面並提示「無法載入雲端資料，請檢查連線後重新整理。」（`app.js` 的 fail-closed return），但 `_currentSession` 仍是那個帳號，Supabase 的 session 也還在，`_showSyncFailure()` 也已設定 `_needsResync`。之後：
    - (a) 按「以遊客身份繼續」：訪客的畫面上方一打開就是**那個帳號**的同步失敗橫幅（線上時也是，來自 `_showSyncFailure()`）；離線時完成紀錄，橫幅是那個帳號的「N 筆待同步」（`_refreshOfflineHint()` 只看 `_currentSession`）。
    - (b) 連線恢復時 `_syncAfterReconnect()` 以那個帳號 `loadFromRemote()`（`_assertOwner` 看的是 Supabase 的 session，所以會通過）；`storage.js` 以帳號的雲端資料取代這台裝置的 `user`、`tasks`、`sessions`、`energy`（本機的 user 不是這個帳號，所以訪客的紀錄與任務不會被合併），訪客在這段期間記下的資料就不見了，畫面也悄悄變成那個帳號。訪客的寫入不會到帳號的雲端（`db.*` 的擁有者檢查會拒絕），只留在以訪客 id 區分的待同步資料裡。
    - (c) 沒有選訪客、停在登入畫面：連線恢復時一樣在背景以那個帳號同步（隱藏的 `#main-app` 後面重畫，橫幅顯示「✓ 已更新」）。
    - (d) 在那個登入畫面再登入同一個帳號：`SIGNED_IN` 因為 `_currentSession` 已是它而被略過，按鈕停在「登入中…」，要重新整理（提示也是這樣說）。
    - (e) 下次打開 app：快取分支的 `getSession()` 拿到那個帳號，以它載入（同 (b)）。
    - 登入另一個帳號時上一個帳號的橫幅已由 BUG-140 收起（#296 review）。
    - 確認方式：寫 TEST-013 時以 `appShell.test.js` 的 mock 暫時測過 (a)(b)，#296 的獨立 review 另外測過 (b)(c)(d)；這些暫時的測試**沒有提交**（會固定錯誤的行為）。資料被取代是依 `storage.js` 的程式碼。
  - 建議（都屬 auth 流程，需核准）：(A) fail-closed return 時忘掉 `_currentSession`（`authOperationGuard.invalidate()`、清掉 `_needsResync` 與橫幅），解決 (c)(d)，並讓這次開啟期間不再以帳號同步；再加上：有帳號 session 時選「以遊客身份繼續」，先結束這台裝置上的 Supabase session（`signOut({ scope: 'local' })`），解決 (a)(b)(e)。這和設定頁的登出不同：不跑 `storage.clearAll()` 與 `signOutProofCleanup()`（快取不是這個帳號的，訪客要用的是這台裝置的本機資料）。(B) 有帳號 session 時不提供訪客，改為「重試」。agent 建議 (A)（訪客本來就只存在本機；要回到帳號就重新登入）。只做 (A) 的第一半（不登出）只能擋住這次開啟期間，下次開啟仍會以帳號載入，所以沒有先做。
  - 改的時候一併確認：`tests/unit/appBootSequence.test.js` 的「帳號載入失敗後改用遊客，設定頁不會沿用該帳號的 id」等測試仍成立。
- [ ] **PRO-017RA-Auth**（擁有者）先完成 INFRA-101（Custom SMTP），再在 Supabase 開啟「確認 email」，並確認匿名登入維持關閉
  - 019 已於 2026-11-13 套用（見 Done 的 PRO-017RA）；這一步只能由擁有者在 Supabase Dashboard 做（agent 的工具改不到 Auth 設定）。
  - Authentication 設定裡（Email provider）開啟 Confirm email（畫面名稱以當時的 Dashboard 為準）。會影響**所有新使用者**的 email 註冊（要先收信確認才能登入）；開啟前確認註冊頁的提示與 email 範本（INFRA-101 的寄件人設定也相關）。Google 登入不受影響。
  - 同時確認「Allow anonymous sign-ins」維持關閉：匿名使用者也是 authenticated、有 `auth.users` 列、不需要確認 email，三個邀請 RPC 不會把他們分開（app 的訪客模式只在本機，不用匿名登入）。
  - **順序：INFRA-101 → 確認 email → R2。** Supabase 內建的 email 每天只能寄 2 封（INFRA-101），在設定 Custom SMTP 之前開啟「確認 email」，大部分新的 email 註冊會收不到確認信而無法登入。
  - 時機：提案核准的是「RA 時」開啟；019 已上線而「確認 email」還沒開，這段期間三個 RPC 已經可以從 API 呼叫（app 還沒有介面，R2 才會用），開啟之前建立的帳號也不需要確認。實際影響小（要湊到獎勵仍要 3 個存在滿 7 天、各有 7 個有效日的帳號），但應在 R2 上線之前完成；R2 上線前 agent 會再提醒。

- [ ] **PRO-014HA**（擁有者，只剩真機畫面）真機驗證 PRO-014H 的 cutover
  - 2026-11-11 擁有者要求 agent 以 Supabase MCP 直接測試。agent 以只讀查詢（DO 區塊最後 `RAISE EXCEPTION`，整段回滾、沒有寫入）逐一以 5 個測試帳號與擁有者主帳號的身分（`request.jwt.claims` 加 `SET LOCAL ROLE authenticated`）呼叫 `my_pro_status()`：
    - `+orbit-free` 非 Pro（試用 55 天前結束）、`+orbit-trial` Pro（試用剩 3.8 天）、`+orbit-paid` Pro（付費剩 19.8 天）、`+orbit-lifetime` 與主帳號為終身 Pro、`+orbit-expired` 非 Pro（11 天前到期）：與 `docs/pro-test-accounts.md` 的表一致，不需要先跑重設 SQL。
    - 權限：`anon` 不能執行 `my_pro_status()`、`authenticated` 可以；`authenticated` 不能執行 `is_pro_active()`。
    - v1.41.15 已部署（GitHub Actions 的 Deploy 成功；這個雲端環境連不到 github.io，沒有直接讀網站）。
  - client 端（依 server 結果顯示 Pro、離線 24 小時、回到前景重新確認）由單元與 e2e 測試涵蓋；agent 沒有測試帳號的密碼，不能在 app 裡登入。
  - 剩下（擁有者，順手即可）：用主帳號打開 app，設定頁顯示終身 Pro、隨機主題與成長報告 PDF 可用。要測其他帳號時先跑重設 SQL（試用帳號約 4 天後到期）。
  - 有問題：依 `docs/pro-014h-cutover.md` §4 回退，並回報帳號與現象。

> 2026-10-17 排程：Next 為空且 PS-243 只剩 human-device gate，依 Backlog 中不涉及 auth／schema／部署的低風險項目排入 Next；高風險項目仍待個別核准。

> 2026-10-17 核准：使用者明確核准 `BUG-110`（auth flow 表單 UI）、`PRO-014O`（entitlement 啟動流程）、`BUG-109`（只撰寫 migration 與測試，production 套用由使用者執行），並排定 `HW-110`、`HW-106`、`HW-107`。

> 2026-10-18 排程：Next 只剩需專案擁有者執行的 BUG-109A。PS-246 的第一步是提案（只寫文件、不改程式碼），從 Backlog 移入 Next；核准前不實作。

> 2026-10-22 排程：PS-250 完成後，Backlog 中不需核准就能開始的只剩 PS-249 的提案（只寫文件、不改程式碼）。PS-249 從 Backlog 移入 Next，再移入 In Progress；核准前不實作。

> 2026-10-18 排程：Next 只剩需專案擁有者執行的 BUG-109A。AI-203 是 Mode A（只產出規格），從 Backlog 移入 Next；核准前不建立 AI-203B、不改程式碼。

> 2026-10-18 排程：Next 只剩需專案擁有者執行的 BUG-109A。PRO-014Q 屬 entitlement 路徑，第一步是變更說明（只寫文件、不改程式碼），從 Backlog 移入 Next；核准前不實作。

> 2026-10-18 核准（使用者以 AskUserQuestion 回覆）：
> - PS-246：採用全部建議（方案 A、Edit Mode 保留入口並顯示說明 A1、不建立 PS-246B、規格文字改為 S1）。
> - AI-203：採用全部建議（目標來源 A、G1、M1、F4、D2，台詞「你選擇的目標還在這裡，準備好時再開始。」），建立 AI-203B 與兩個後續任務（AI-204、HW-113）。
> - PRO-014Q：S0＋Q6。
> - 下一步：依序實作核准的項目，每項一個 PR，從風險最小的 PS-246 開始。

> 2026-10-19 排程：Next 只剩需專案擁有者執行的 BUG-109A，PRO-014Q Q6 等測試帳號。HW-113 不涉及 auth／schema／部署，從 Backlog 移入 Next，並開始實作。

> 2026-10-19 排程：Next 只剩需專案擁有者執行的 BUG-109A，PRO-014Q Q6 等測試帳號。AI-204 的文字需使用者選定，第一步是提案（只寫文件、不改程式碼），從 Backlog 移入 Next。

> 2026-10-19 排程：Next 只剩需專案擁有者執行的 BUG-109A、等測試帳號的 PRO-014Q Q6、等使用者選定文字的 AI-204。建立 PS-247（PS-244 起既有、記錄在 PS-245 的椅子深度誤差；交接紀錄列為可直接做），不涉及 auth／schema／部署，直接排入並開始實作。

> 2026-10-19 核准（使用者以 AskUserQuestion 回覆）：AI-204 採 W-A（首頁小卡版文字）＋L2（COMPANION 小卡最多兩行），夥伴名稱一併統一為「Orbit 夥伴」；核准 CI 在 e2e 失敗時上傳 Playwright 的 `test-results/`（建立 INFRA-102）。

> 2026-10-19 排程：AI-204B 完成後，Next 只剩需專案擁有者執行的 BUG-109A、等測試帳號的 PRO-014Q Q6。PS-211（PS-244～PS-247 後場景素材已穩定）從 Backlog 移入 Next，第一步是提案（只寫文件、不改程式碼）；核准前不實作。

> 2026-10-20 核准（使用者以 AskUserQuestion 回覆）：
> - PS-211A 採 A3 ＋P：SHELL 移除 legacy 圖片，改放 poster 會用到的 22 個 V2 檔案，另加 `vendor/pixi.js`；一併澄清技術設計 §12.1／§12.2。選 A3 即同意改寫 PS-211 範圍、跨版本長期快取暫緩（記為 PS-211D，Backlog）；PS-211C 不需要。
> - PS-211B 排入，包含「首頁 → 空間沿用 Pixi app」的最佳化。
> - 核准 INFRA-103（`lint` script 的 glob 加引號）。
> - 順序：INFRA-103（讓 `pwa/js` 與 `tests` 下的 `.js` 都被 lint；`pwa/sw.js` 仍不在範圍，見 INFRA-104）→ PS-211B（不動 service worker）→ PS-211A（部署行為）。
> - INFRA-103 只改一行設定且已核准，比照 INFRA-102 直接移入 In Progress。

> 2026-10-20 使用者回覆（AskUserQuestion）：
> - PS-211A 以「任務確實完成」為準：已依獨立 review 補齊驗收，並把範圍外的既有問題記為 INFRA-105。
> - 核准 INFRA-104（lint `pwa/sw.js` 與 Node 端腳本），移入 In Progress。
> - 下一個提案是 AI-202；之後擴充 Blender 製作的主題與素材（建立 PS-248）。兩者都從 Backlog／新建移入 Next，第一步是提案。
> - 獨立 Claude review 恢復使用：除非只有 Codex 能做的事，否則不限制由誰 review。

> 2026-10-23 核准（使用者以 AskUserQuestion 回覆）：
> - PS-249 §6：
>   - Reveal 採 R-A＋重播：被蓋住、不在可視區、分頁隱藏時，reveal 的計時與 CSS 動畫都暫停、`major` 橫幅隱藏；被 overlay 蓋住時，overlay 關閉後從頭重播。
>   - 場景採 P1：所有全螢幕 overlay 底下都暫停。
>   - 新使用者的導覽算「被蓋住」；`proofSheet.js` 的佐證大圖加一個 class；個人空間頁的 Orbit Window 也套用。
>   - 不延後第一次掛載 Pixi。
>   - PS-249 的提案完成，移到 Done；實作建立 PS-249A，移入 Next。
> - PS-251 §9.8 的三項順帶整理都做（刪除 `room-v1.webp`、更新 PS-243 驗收紀錄的預算數字、修正根目錄 README 的專案階段）：從 Backlog 的 PS-251 拆出 PS-251A，移入 Next，再移入 In Progress。§9.3（A2）仍待決定，PS-251 留在 Backlog。
> - 順序：PS-251A（不改程式行為）→ PS-249A。

> 2026-10-23 核准（使用者以 AskUserQuestion 回覆）：
> - AI-202 §9 全部採用建議。AI-202 移到 Done，實作拆成 AI-202B1（推導與顯示，移入 In Progress）與 AI-202B2（里程碑的 reveal，Next）。
> - PS-251 §9.3（窗外依時段變化）：做，先寫實作提案。PS-251 從 Backlog 移入 Next。
> - INFRA-105 核准：先寫變更說明，PR 合併前讓使用者看過。從 Backlog 移入 Next。
> - 順序：AI-202B1 → AI-202B2 → PS-251 的提案 → INFRA-105（要等使用者看過才合併，放在最後，避免擋住同一個 branch 的其他 PR）。

> 2026-10-31 排程：使用者要求寫 PRO-014R（擋 PRO-014H）與 PRO-014N 的合併提案。兩者都改 `my_pro_status()`，合併成一份只寫文件的提案，從 Backlog 移入 Next，再移入 In Progress；核准前不改程式碼、不動 production。

> 2026-11-01 核准（使用者回覆「可以照你說的建議做」）：PRO-014R 採用方案 A（`my_pro_status()` 在付費已涵蓋整段試用時不回報 `trial_ends_at`）；PRO-014N 以 A 結案並重新定義（推斷保留且在 014 後精確，「不需推斷的明確欄位」改列可選的方案 B）。依提案 §6 實作一個 PR；014 的 production 套用另立擁有者執行的任務。

> 2026-11-01 決定（使用者回覆）：
> - PRO-014P 先於 PRO-014L（草稿 PR #154；兩者改同一段 SUB-16 路徑）。PRO-014P 先寫提案。
> - PRO-014H 的核准名單：只有專案擁有者的主帳號，授權為終身（`is_pro = true`、`pro_expires_at = NULL`、不搬移 profile 的試用起點）。依 `docs/sub-14-leaderboard-pro.md` 的 cutover 程序由擁有者在 SQL Editor 寫入、agent 覆核並對帳；email 與 UUID 不寫進 repo。已於 2026-11-02 寫入並對帳（見 PRO-014H）。

> 2026-11-01：PRO-014P 提案完成（#220，只寫文件）。寫提案時發現 `BUG-115`（保護卡 offer 沒有 owner），放入 Backlog。

> 2026-11-01 核准（使用者回覆「可以全部照建議」）：PRO-014P 提案 §10 全部照建議（方案 D、改寫方向與完成條件、暫時性失敗不刪 snapshot、`BUG-115` 併入、`unknown` 時的提示文字）。PRO-014P 與 BUG-115 一個 PR 實作；BUG-115 移入 In Progress。實作完成（#221，v1.41.5），兩者移入 Done。

> 2026-11-02 排程：PRO-014H 的核准名單已寫入並對帳（#222）。使用者同意寫 PRO-014L 的提案（只寫文件），從 Backlog 移入 Next，再移入 In Progress。

> 2026-11-04 核准（使用者回覆「PRO-014L 可以照建議」）：PRO-014L 提案 §10 全部照建議：拆成 L1（migration 012＋ASSERT 測試）→ LA（擁有者套用）→ L2（client 改走 RPC）；server 的資格為「歷史上任何一段 45 天」、client 只在本機連勝 ≥ 45 時詢問；回填 `streak_unlock_used = true` 的帳號為已領過並在 PRO-014H 前再跑一次；訪客不再有 SUB-16，進度條改為「需要登入帳號」；L1 合併後關閉 #154（使用者同意）。順序：INFRA-114 之後做 L1。

> 2026-11-04 核准（使用者回覆「後三個可以做」）：`BUG-116`（auth 流程）、`INFRA-115`（jsPDF 升到 4.x）、`INFRA-114`（放寬 JS 預算，去掉 `'unsafe-eval'`）。順序：BUG-116 → INFRA-115 → INFRA-114，每項一個 PR。BUG-116 移入 In Progress，另兩項移入 Next。PRO-014L 的提案 §10 等使用者回覆。

> 2026-11-02 核准（#226 的工作階段記錄；使用者回覆「可以照你建議」）：PRO-014L 提案（#224）§10 全部照建議。拆成 PRO-014L1（repo，In Progress）→ PRO-014LA（擁有者套用，Backlog）→ PRO-014L2（client，Backlog，依賴 LA）。L1 合併後關閉草稿 #154。

> 2026-11-10 排程：PRO-014L 完成（#235）。Next 與 In Progress 只剩 PS-243 的 human-device gate；Backlog 其餘項目都要先有擁有者的回答或核准，agent 不自行排入：
> - `BUG-117`：等擁有者回答四個問題（standalone 或 Safari、iOS 版本、何時開始、其他頁與捲動）。
> - `PRO-014H`：cutover 需另行核准；之前要在 L2 普及後再跑一次 012 的回填，並依提案 §7 查 profile 與 server 授權不一致的帳號（只讀查詢可先做，寫入要核准）。
> - `HW-112`、`PRO-014E`、`PRO-014S`、`PRO-014G`：schema／RPC 變更，需先提案並核准。
> - `INFRA-101`：需要擁有者的 Resend 帳號與 Supabase 設定。
> - `PS-211D`、`PS-227`：使用者決定暫緩。`REPO-001`：使用者自行處理。
> - `PRO-017`、`AI-015`：還沒有提案；要不要先寫提案（只寫文件）由擁有者決定。

> 2026-11-11 核准與回答（使用者回覆）：
> - `BUG-117`：回答了四個問題（見該項），Backlog → In Progress。
> - `PRO-014H`：「ok 核准」。依該項的順序：先做只讀檢查（012 回填的差異、提案 §7 的不一致帳號），再依 Supabase 寫入流程（本機演練 → dry run → 鎖定套用 → 事後檢查）重跑回填，然後 cutover PR；真機驗證由擁有者用測試帳號做。BUG-117 之後開始。
> - `HW-112`、`PRO-014E`、`PRO-014S`、`PRO-014G`、`PRO-017`、`AI-015`：「好你寫提案我看看」——各寫一份提案（只寫文件），擁有者看過再決定是否核准實作。PRO-014H 之後依序寫。

> 2026-11-11 核准與回報（使用者回覆，六份提案合併後）：
> - `BUG-117A`：更新到最新版後頂部仍模糊，刪掉主畫面圖示重新加入後才正常。使用者認為要重新加入是 bug，要修正 → 建立 `BUG-118`（In Progress → Done，v1.41.16）。iOS 把狀態列設定存在圖示裡、更新改不到；app 改為偵測舊圖示並引導（先完全關閉重開，仍模糊再說明重新加入與資料安全）。
> - `PRO-014HA`：「你已經有 supabase 的 MCP 了，請你直接測試」→ agent 以只讀查詢驗證 server 端，結果見該項。
> - 主畫面的圖示太醜，要重新設計 → 建立 `UI-203`（Done，v1.41.17；預覽圖已給擁有者看，不喜歡再改。原本寫成 UI-001，與既有的個人空間任務撞號，#244 審查後改名）。
> - 六份提案「可以照你的建議」，除了 `PRO-014E` 的排行榜公開名稱「就直接公開」：
>   - `HW-112`：§9 全部照建議（拆成 HW-112A → HW-112B → HW-112C；320px／品質 0.5；所有已登入的人；設定頁分成兩個刪除按鈕；登出時刪掉已上傳的本機照片；既有照片自動補傳；成就照片這次不同步；雲端先不設上限；資料庫測試先試 Supabase CLI 的本機環境）。
>   - `PRO-014E`：§9 照建議，但第 2 點改為 **B**：把現在的 `name` 複製成 `display_name`，既有的公開使用者繼續出現在排行榜（沒改過名稱的人，email 前段或 Google 的真名繼續公開，使用者接受）。其餘照建議（輸入框預設空白、舊 view 改為 `COALESCE(display_name, '匿名')`、Pro 標記包含試用、1–20 字、不限重複與保留字與改名頻率、不當名稱由擁有者在 SQL Editor 清除、E3 在 E2 上線一個月後、不限前 N 名）。
>   - `PRO-014S`：§7 照建議（A：等下一次改 `my_pro_status()` 時一起做；送的 Pro 也算付費）。
>   - `PRO-014G`：維持「可選、現在不做」。
>   - `PRO-017`：§9 全部照建議（R1 → RA → R2；3 位各 7 個有效日 → 30 天 Pro；被邀請者第一版不給額外獎勵；邀請者只看已達成的人數；開啟 Supabase Auth 的「確認 email」〔RA 時一起做，會影響所有新使用者〕；一生一次；帳號建立後 7 天內可綁定；邀請者已是 Pro 時先不發、不消耗）。
>   - `AI-015`：照建議排在其他項目之後（§9 第 1 點 A）。架構建議的 Edge Function 需要 Anthropic API key，使用者目前沒有 API 方案，問能不能用 GPT 或 Claude 的訂閱額度、或 OAuth（Claude 可能被鎖就不要）。回覆：訂閱額度與 OAuth 不能用（見該項）；API key 由擁有者決定，在那之前 AI-015 擋住。
> - 順序：`BUG-118` → `UI-203` → `HW-112A` → `PRO-014E` E1 → `PRO-017` R1，每項一個 PR。migration 的套用（HW-112B、EA、RA）是 production 寫入：agent 可以用 Supabase MCP 依寫入流程（本機演練 → dry run → 鎖定套用 → 事後檢查）執行，每一次寫入前取得擁有者明確核准。

> 2026-11-21 要求（使用者回覆，看過 iPhone 圖示 skill 在 Orbit 的實測前後對照後）：「都有開PR 並merge吧」→ 建立 `UI-204`（Done，v1.41.32），以實測的新設計取代 UI-203 的圖示。

---

## In Progress

- [ ] **PS-243** Complete device performance, accessibility, and telemetry acceptance
  - In progress: establish a reproducible browser acceptance baseline and evidence matrix for responsive viewports, 200% zoom, keyboard flow, reduced motion, route/runtime lifecycle, privacy-safe local telemetry, and simulated performance. Real iOS／Android／standalone PWA measurements and two-account verification remain explicit human-device gates.

---

## Done

- [x] **TEST-017** #301 的後續：兩個沒有測試的地方與 P3（2026-11-27）
  - 只改測試。#301 獨立 review 指出兩處拿掉也不會被發現（main 上原本就沒有測試）：換頁時先清掉前一次的滑動（`router.js`，前一次還沒結束就換頁時只留新的方向）、慶祝視窗出現前帳號已換就不顯示（`streakUnlock.js` 的計時器觸發時再檢查 `isCurrent()`）。各加一個測試，拿掉後以 5 個打亂順序的 seed 都會失敗。
  - #301 的 P3：`proofSheetFlow.test.js` 還原 `window._showProofLightbox` 時改回測試前的值（之前寫回 `showProofLightbox`，打亂順序時燈箱測試在 `proofSheet.js` 沒有設定它時也會通過；改後 `proofSheet.js` 設錯會在 5 個 seed 都失敗）；`review.test.js` 開頭的說明、`routerNavigation.test.js` 多餘的一行；TEST-016 的紀錄更正為 5 個檔案（`profile.test.js` 在 seed 11、16、27 才失敗）。

- [x] **TEST-016** 依執行順序才會通過的測試（#300 獨立 review 發現，2026-11-27，main 上原本就有）
  - 以 `npx vitest run --sequence.shuffle --sequence.seed=N` 打亂測試順序（檔案內與檔案間），seed 1～8 有 1～14 個失敗，來自 5 個檔案；`profile.test.js` 在 seed 11、16、27 才失敗（#301 review 更正）。都是測試之間互相影響，app 程式沒有問題：
    - `streakUnlock.test.js`：兩個授權成功的測試沒有等 `delayMs: 0` 的慶祝視窗，計時器在下一個測試裡觸發，使它的視窗次數多一次。改為 `afterEach` 先等一輪再還原時鐘。
    - `proofSheetFlow.test.js`（TEST-008 寫的）：「沒有照片處理模組」的測試 `vi.doUnmock()` 拿掉了照片處理模組的 mock（第一份 `proofSheet.js` 延後載入它，之後的測試拿到真的），新載入的模組也取代了 `window._showProofLightbox`；改為還原 mock 與 window 函式。另一個測試把 `orbit:proof-added` 的 listener 留在 `<body>` 上，之後的測試都像頁面已接手縮圖；改為測試結束時移除。
    - `review.test.js`：模組記住目前看的月份，測試以 `afterAll` 補回自己往前翻的月數，換了順序就錯；改為每個測試開始時回到本月（`resetToCurrentMonth()`）。
    - `routerNavigation.test.js`：「第一次畫面不滑動」只在它剛好第一個跑時成立（router 記住上一頁）；移到新的 `routerFirstRender.test.js`（每個檔案各有一份模組），原本的測試從已知的頁面開始。
    - `appShell.test.js`：「導覽載入失敗」靠 mock factory 讀旗標，但 mock 的模組在任何測試載入過一次後就留在快取（`vi.resetModules()` 也不會重跑 factory）；改為在測試裡 `vi.doMock()` 換成會失敗的模組，結束時換回。
    - `profile.test.js`：`vi.clearAllMocks()` 不清掉 `mockReturnValue()`，前一個測試的 Pro 狀態留到後面；改為每個測試開始時是免費，「新增自訂主題」的測試自己設成 Pro。
  - 修正後以 seed 1～24 打亂整套全部通過（2371 個），照原本順序也通過。之後新增測試時可以用同一個指令跑幾個 seed 檢查；要不要在 CI 加一個打亂順序的工作屬 CI 設定，沒有改（需要時再提出）。
  - 一併處理 #300 的 P3：`futureClock.config.js` 的範例加上 `TZ=UTC`（`03:00Z` 在台灣是 11 點，碰不到換日前的時段）；`futureClock.setup.js` 註明不會被移動的地方（不加 `new` 的 `Date()`、不帶日期的 `Intl.DateTimeFormat().format()`、`performance.timeOrigin`、`vi.getRealSystemTime()`、`structuredClone(date)`）；`exportPdf.test.js` 的選單測試還原整個 user，而不只是 `newDayHour`。

- [x] **TEST-015** 測試裡寫死的日期：到期後 CI 會變紅（#299 獨立 review 發現，2026-11-27，main 上原本就有）
  - `streakUnlock.test.js` 的「server source（PRO-014H）：付費授權後重新整理的 projection 讓帳號成為 Pro」以 `SERVER_END = '2026-12-10T08:00:00.000Z'` 當作伺服器的到期時間，卻用真的時鐘判斷是否還在 Pro：**2026-12-10 08:00 UTC 之後每個 PR 的 CI 都會失敗**。改為整個檔案把時鐘固定在 `2026-11-10T09:00Z`（與檔案中 mock 的日期 `2026-11-10` 一致；只假 `Date`，計時器照常）。
  - 為了找出其他同樣的測試，新增 `tests/support/futureClock.config.js`（＋`futureClock.setup.js`）：以 `FUTURE_NOW=… npx vitest run --config tests/support/futureClock.config.js` 把整套單元測試的時鐘移到之後的日期（假計時器仍可在其上使用；沒有設定 `FUTURE_NOW` 時直接報錯）。不在 CI 中跑；之後加了寫死日期的測試時手動跑一次。修正前在 2026-12-11、2027-03-02、2027-11-30、2028-07-15 跑整套，都只有上面那一個失敗；修正後在 2026-12-11、2027-06-01、2029-02-28 跑整套全部通過（2370 個）。沒有改 `package.json` 或既有的設定檔。
  - 一併處理 #299 的 P3：`exportPdf.test.js` 的成長報告選單測試同時確認「上個月」與使用者的換日時間（0 點換日時凌晨 2 點已是新月份；之前改成固定 5 點或從日曆日期算上個月都不會被抓到）。

- [x] **BUG-146** 週回顧、個人頁的近 30 天與首頁的日期仍以日曆日期計算（#298 獨立 review 列出，2026-11-27，main 上原本就有；與 BUG-145 同一類）
  - 紀錄的日期是有效日（`effectiveToday(newDayHour)`，預設早上 5 點換日）。午夜到換日時間之間日曆日期已經是下一天：週視圖的 7 天以日曆今天結尾（最後一天一定是空的，最早那個有效日的紀錄被漏掉，連帶週 XP、有效日數與任務分佈）；月曆的「今天」標在日曆今天；月初凌晨打開時是新的月份，免費版的月份限制也從那裡算；個人頁 Pro「任務效率」的近 30 天少一天；首頁的日期是日曆日期，下方的統計卻是有效日。
  - 完成（v1.42.17）：`review.js` 以有效日計算週的 7 天、月曆的今天與月份限制；打開時的月份在第一次使用時才決定（需要使用者的換日時間；之前在 import 時以日曆日期決定）。`profile.js` 的近 30 天與 `home.js` 的日期也從有效日算起。都用既有的 `effectiveToday`（INFRA-105）。
  - #299 review：P2——`profile.test.js` 的「完成率」測試以日曆日期建立紀錄，近 30 天改從有效日算起後，每天 0～5 點（CI 是 UTC，台灣 8～13 點）會失敗；改為把時間固定在中午，並以 `TZ=Pacific/Kiritimati`（當時當地 01:57）跑完整套確認沒有別的。P3 也一併處理：`export.js` 成長報告的「本月」／「上個月」也改以有效日（`exportPdf.test.js` 的紀錄日期一併改為有效日，以免月初凌晨失敗）；月視圖在本月時不能往後的按鈕、打開的月份在第一次畫出時才決定，這兩處補上測試（之前改回去不會被抓到）；`review.test.js` 拿掉沒用到的 `today` mock、更新說明；CHANGELOG 的導覽項目只寫「重新開始」（收起導覽時畫面上已沒有提示框，碰不到）。留下的：打開的月份在 app 開著時不會隨日期改變（之前在 import 時決定，現在在第一次打開時，原本就有）。
  - 沒有改（刻意以日曆日期，或與紀錄無關）：`profile.js` 的加入天數（註解寫明）、`theme.js` 的每日隨機主題、`app.js` 試用橫幅的「今天已關閉」、`defaultTasks.js` 的預設任務建立日（S 級每日限制不看預設任務）。
  - 測試：新的 `reviewEffectiveDay.test.js`（用真的 `utils.js`；`review.test.js` 把 `effectiveToday` mock 成日曆日期）：凌晨 2 點週視圖的 7 天與週 XP、換日時間 0 點照日曆、月曆的今天、月初凌晨打開上個月、免費版的月份限制；`profile.test.js` 近 30 天的邊界；`home.test.js` 的日期。改動驗證：每一處改回日曆日期、忽略換日時間，都會讓測試失敗。
  - 一併處理 #298 的 P3：(3) 離線時登入補傳失敗的待同步數算全部（離線時 profile 是排隊中、不是送出中，之後 `_refreshOfflineHint()` 也算全部，之前數字會跳）；(4) 導覽在換頁等兩個畫面更新時重新開始或收起，之前會晚一步再畫一層（兩個遮罩、收起一個後留下一層擋住畫面；UI 上幾乎碰不到），改以 `_generation` 檢查；(6) 測試：`goals.test.js` 拿掉沒用到的 `today` mock、`isProUser` 在 `finally` 還原，`utils.test.js` 確認沒傳入時以日曆日期為今天，`authApi.test.js` 確認先刪 session 再以 local 登出。(2) CHANGELOG 1.42.16「與首頁一致」：首頁的日期這次改為有效日後成立。沒有改的：(5) 在導覽的互動步驟按「跳過」後，首頁上的教學任務卡要等下一次重畫才消失（點了沒有反應；原本就有，`window.navigate` 到同一頁不會重畫）。

- [x] **TEST-014** 導覽、DOM 動作、auth 包裝與 utils 的測試（2026-11-27）
  - 先跑 coverage 選目標：最大的缺口 `personalSpace/idleWindow/editorRuntime.js`（33%）只在 Personal Space 切回 legacy 時使用（預設 V2，app 裡沒有切換的地方），暫不補；改補小模組。
  - 新的 `tour.test.js`：逐步走完導覽（聚光燈夾在畫面內、提示框在下方或上方、放不下時換邊、上下都放不下時夾在邊界、靠邊時不超出）、兩個要使用者操作的步驟（加入計畫、完成；MutationObserver 偵測，600 ms 後換步，完成後移除教學任務與計畫）、找不到目標時略過、計畫卡已在畫面上時照樣換步、跳過、重新開始時移除上次留下的教學任務、最後一步置中並記下已完成、跳過後不再監看。每個測試各自 import 一份 `tour.js`，`afterEach` 先按「跳過」，以免上一個測試的 observer 在下一個測試裡換步（寫測試時發生過）。
  - `csp.test.js`：每個 `data-action` 都呼叫自己的 window 函式（含參數），另一個測試確認表格涵蓋全部 action；沒有 `closest` 的 target 不出錯。
  - 新的 `authApi.test.js`：註冊、登入、Google 登入與重設密碼的導回網址（不帶 #）、更新密碼、`getSession()`、`onAuthStateChange()`，以及登出時 SDK 丟出錯誤（離線與線上）、刪除 session 失敗仍以 local 登出、線上成功時不再刪。
  - `utils.test.js`：`formatDate()`（今天、昨天、跨月跨年與閏年、BUG-145 傳入有效日）、`uid()` 沒有 `randomUUID` 或沒有 `crypto` 時的 v4 格式、同一時間的紀錄依 id 排序、合併時略過沒有 id 的雲端紀錄。
  - 改動驗證：14 個改動中 13 個讓測試失敗，留下的一個與原本等價（計時器觸發後不清掉 id：之後的 `clearTimeout` 不做事）。
  - 找到的問題：BUG-144、BUG-145（已修，見下）。
  - 一併處理 #297 的 P3：(1) BUG-142 的測試以帳號區分待同步摘要（傳錯帳號會被抓到）；(2) 登入時補傳失敗的橫幅數量只算補傳與刪除（之前算進還在送出的 profile，線上時送出後也不會更新）；(4) BUG-143 的說明改為「只有連線恢復同步彼此等待；`loadAndStart()` 不等，同一個帳號重新登入時仍可能同時載入兩次（原本就有）」；(6) 1.42.15 的 CHANGELOG 補上「或下一次斷線再連上」、BUG-142 的範圍補上快取開機時 `SIGNED_IN` 先到；(7) 測試的待同步資料改名為 profile。沒有改的：(3) 連線恢復與登入時的補傳重疊時橫幅會先後顯示「同步中…」、「同步暫停」、「✓ 已更新」（最後正確）；(5) 補傳期間使用者自己新增或刪除的紀錄會被算進去（與快取開機的 `_reportSyncResult()` 相同）。
  - 已知、沒有修（原本就有，很少見）：同一個帳號在連線恢復同步進行中重新登入，兩次載入同時進行，同一筆補傳會插入兩次；第二次因主鍵重複失敗、標記待同步，BUG-142 的橫幅會顯示「同步暫停 · 1 筆」，下一次載入時發現雲端已有而清掉。

- [x] **BUG-144** 導覽：自動換步的 600 ms 內按「跳過」，導覽又跳出來（TEST-014 寫測試時發現，2026-11-27，main 上原本就有）
  - 加入計畫、完成教學任務這兩步偵測到操作後，提示框留在畫面上 600 ms 才換下一步；這段時間按「跳過」會收起並記下已完成，但計時器照樣觸發，導覽從下一步（週回顧）繼續。
  - 完成（v1.42.16）：計時器記在 `_advanceTimer`，`_clear()`（跳過、重新開始與換步都會呼叫）一併取消。測試：兩個步驟各在 600 ms 內跳過，之後不再出現；拿掉取消會失敗。

- [x] **BUG-145** 完成紀錄：午夜到換日時間之間，「今天」的紀錄標成「昨天」（TEST-014 檢查 `utils.js` 時發現，2026-11-27，main 上原本就有）
  - 紀錄的日期是有效日（`effectiveToday(newDayHour)`，預設早上 5 點換日），完成紀錄頁卻以日曆日期判斷「今天」、「昨天」：凌晨 2 點剛完成的紀錄標成「昨天」，真正的前一天顯示日期。免費版的 30 天也從日曆日期算，這段時間少顯示一天。
  - 完成（v1.42.16）：`formatDate(dateStr, todayStr = today())` 可傳入「今天」，昨天從它往前一天；`goals.js` 傳入有效日，免費版的起算日也用它（沒有新增 export，INFRA-105）。測試：凌晨 2 點的標籤、換日時間 0 點、沒有使用者設定時以 5 點換日、免費版的邊界那天；改回日曆日期或忽略換日時間都會失敗。

- [x] **BUG-142** 登入時補傳失敗沒有提示（#296 記下的既有問題，2026-11-27）
  - `loadAndStart()`（這台裝置沒有這個帳號的快取時登入、換成另一個帳號，或快取開機時 `SIGNED_IN` 比 `getSession()` 先到）載入成功時不顯示任何同步狀態，也不等 Session 的補傳結束：補傳失敗（或 Session 的刪除沒有確認）時沒有橫幅、也沒有 `_needsResync`，紀錄要等下次打開 app、到設定頁「檢查同步」或下一次斷線再連上才會再送出。快取開機的背景同步已經用 `_reportSyncResult()` 回報。不涉及 auth 流程（只多顯示橫幅、設定連線恢復後同步的標記）。
  - 完成（v1.42.15）：補傳結束後、還是同一次登入時，若這個帳號還有待補傳的 Session 或沒有確認的刪除，就 `_showSyncFailure()`（線上「同步暫停 · N 筆待同步」、離線「離線中」，並在連線恢復時同步）；成功時仍不顯示（與之前相同）。只看這兩種：profile、任務與 Energy 的待同步資料在載入前送出，失敗時載入本身就失敗（已有的 catch）；載入之後才出現的是這次開機自己寫的（換日），還在送出，算進去會每次換日都誤報。不用 `_reportSyncResult()` 是因為它看全部的待同步資料、成功時還會顯示「✓ 已更新」。
  - 測試（`appShell.test.js`）：補傳失敗時的橫幅與連線恢復後同步、刪除沒有確認、離線時、等補傳結束才讀（補傳成功不顯示）、只剩這次開機寫的 profile 時不顯示、補傳結束前已登出不顯示也不詢問 SUB-16。改動驗證：拿掉回報、改看全部、不等補傳、不檢查是否同一次登入、只看 Session、只看刪除，都會讓測試失敗。

- [x] **BUG-143** 前一個帳號的連線恢復同步擋住新帳號的（#296 記下的既有問題，2026-11-27）
  - `_syncAfterReconnect()` 在已有同步進行時直接略過。前一個帳號的同步還在等網路時登出（或換帳號），新帳號之後斷線再連上的同步就被略過：前一個帳號的同步醒來後發現帳號換了就結束，不替新帳號同步，新帳號的待同步資料要等下一次斷線再連上。登出後再登入同一個帳號也一樣（是新的 session）。
  - 完成（v1.42.15）：`_reconnectSync` 記下它屬於哪個 session；只有同一個 session 的同步進行中才略過。另一個 session 的還在進行時，新的一個先等它結束（不讓兩次載入同時進行，見 `_loadRemote()` 的說明），再照常同步；結束時只清掉自己的那一筆。
  - 測試（`appShell.test.js`）：換成另一個帳號、登出後再登入同一個帳號（先等前一個停下，再以新的 session 同步）；同一個 session 進行中不再開一個；等待時又登出不同步；前一個結束時不清掉新帳號進行中的同步；之後的連線恢復照常同步。改動驗證：改回只要有同步就略過、不等前一個、結束時一律清掉、永遠不清，都會讓測試失敗。
  - 一併處理 #295 的 P3（測試整理）：`profileActions.test.js` 稱號主題編輯的測試以 `vi.spyOn(window, 'confirm')` 取代直接指定 `window.confirm`，並在 `afterEach` 還原 mock 與 `isProUser`；「仍在個人頁時照常重畫」同時檢查儲存與刪除。

- [x] **TEST-013** 補上 `app.js` 的測試（2026-11-27）
  - 新的 `appShell.test.js`（與 `appBootSequence.test.js` 相同的 mock，另外 mock 暖身載入的導覽、徽章與排行榜；同步橫幅用真的 `feedback.js` 畫在畫面上；每次 import 加上的 window／document listener 在測試結束時移除）：試用橫幅（剩 5 天以內才顯示、不是試用、今天已關閉、✕ 記下今天、refresh 之後才變成試用）；登出（清掉資料與登入欄位、auth 登出失敗仍在這台裝置登出、已經登出時不再清、登出中途載入才完成不開機）；連線恢復同步與換帳號（同步途中或載入完成前登出、OwnerSessionChangedError、refresh 之後才換帳號；loadAndStart 的同樣情況與 refresh 期間換成另一個帳號）；SUB-16 狀態改變時更新 header、正在輸入時不重畫；清理雲端照片出錯不影響同步；今日計畫（重複不加入、加入時存檔並重畫）；導覽載入失敗的提示；App 圖示的徽章（今天的有效紀錄、完成後重算、登出時清掉、沒有 `requestIdleCallback` 時 500 ms 後）；離線時待同步數量跟著更新；點 header 回到頂端；文字欄位的鍵盤編輯狀態與高度；另一個分頁換了帳號（提示 3 秒內只一次、bfcache 回來與回到前景重新載入、自己正在換成它時不會、無法解析的資料、重新載入後只提示一次）；啟動（沒有快取也沒有 session、沒有快取但有 session、`getSession()` 失敗或沒有 session 時以本機完成移轉、失敗前已換帳號不覆蓋）；`PASSWORD_RECOVERY`；沒有 session 的 `SIGNED_IN`；遊客直接開機；沒有快取時 `SIGNED_IN` 比 `getSession()` 先到只載入一次、refresh 之後才套用隨機主題；啟動同步還沒結束時恢復連線又登出、不再以前一個帳號載入；遊客離線時不顯示待同步。共 52 個測試。`app.js` 69% → 80%（行）；剩下的主要是狀態列提示的畫面（BUG-118，`tests/e2e/bug118-status-bar-notice.test.js` 涵蓋）與設定頁的頭像。
  - 開 PR 前以改動原始碼驗證：53 個改動都會讓測試失敗（一開始沒被抓到的兩個——連線恢復同步在載入完成後才發現登出、loadAndStart 在 refresh 之後換帳號時不再套用主題——已補上測試）。
  - 找到的問題：BUG-140（已修，見下）；BUG-141（帳號載入失敗後改用訪客，仍以帳號同步，屬 auth 流程，需核准，見 Next）。
  - 審查（#296）：Codex 沒有問題。獨立 review 沒有 P1；P2：BUG-140 漏了「帳號沒有快取、載入失敗回到登入畫面，再登入另一個帳號」（畫面上沒有使用者，只有 `_currentSession` 還是前一個帳號），已修並加測試。P3 也一併處理：`_needsResync` 的說明（瀏覽器只在 offline 之後送 online，清掉這個標記使用者看不出差別，CHANGELOG 與這裡已更正，測試也改為直接檢查標記）；BUG-141 的紀錄補上 (a)～(e) 與根本原因；3 個沒被抓到的改動（上一段新增的三個測試）；測試名稱「遊客與線上時不顯示」只測了線上（遊客另成一個測試）；`clearAllMocks()` 不清掉排隊的 `*Once`，改為先 `mockReset()` db 與 auth 的 mock。review 的 40 個改動與這次新增的 7 個中，存活的都與原本等價（例如換帳號時只看「畫面上的使用者」那一半：沒有 `_currentSession` 時不會有同步橫幅）。沒有在這裡改的既有問題：`loadAndStart()` 不回報 Session 補傳的失敗（沒有 `_reportSyncResult`，補傳失敗時沒有橫幅也沒有標記）；前一個帳號還在進行的連線恢復同步，會擋住新帳號的連線恢復同步直到它結束。
  - 下一步：`dayCycle.js`、`focusTimer.js` 等其他覆蓋率低的模組（先跑 `npm run test:coverage` 看最新的數字）。

- [x] **BUG-140** 登出或換帳號後，同步橫幅仍顯示上一個帳號的狀態（TEST-013 檢查 `app.js` 時發現，2026-11-27，main 上原本就有）
  - `#sync-banner` 的「離線中 · N 筆待同步」、「同步暫停」、「同步中…」會一直留到下一次狀態更新，而 `loadAndStart()` 載入成功時不顯示任何狀態：離線或同步失敗時登出、再登入另一個帳號（或同一個帳號），新帳號的畫面上方仍是上一個帳號的同步狀態與待同步數量。`_needsResync` 也留著（瀏覽器只在 offline 之後送 online，offline 會再設定一次，所以使用者看不出差別）。不涉及 auth 流程（只收起畫面上的橫幅、不改登入或登出的行為），接著修正。
  - 完成（v1.42.14）：`handleSignOut()` 與 `loadAndStart()` 換成另一個帳號時（畫面上的使用者或 `_currentSession` 是另一個帳號：後者是帳號載入失敗回到登入畫面的情況，#296 review）收起同步橫幅並清掉 `_needsResync`。沒有新增 export（INFRA-105；直接改 `#sync-banner`，與 `feedback.js` 的寫法相同）。測試在 `appShell.test.js`：離線時登出再登入另一個帳號、同步失敗後登出再登入同一個帳號、沒有登出直接換帳號、帳號載入失敗回到登入畫面後登入另一個帳號、登出時清掉標記、同一個帳號照常保留橫幅並在連線恢復後同步、同步途中登出時橫幅收起。修正前其中 6 個測試失敗。

- [x] **TEST-012** 稱號主題編輯視窗在換頁後的儲存與刪除（2026-11-27）
  - 只加測試、不改 app 程式：`profileActions.test.js` 加上稱號主題編輯視窗在換頁後才按「儲存」與「刪除」：個人頁不會畫到那一頁上、主題照常存下或刪除（刪除選中的主題時改回 RPG）；仍在個人頁時照常重畫。#294 獨立 review 指出 BUG-139 的這兩個檢查沒有測試（把檢查拿掉也會通過），補上後兩個改動都會讓測試失敗。
  - 下一步：`app.js`（69%，啟動流程、狀態列提示、試用橫幅、同步失敗提示）。

- [x] **BUG-139** 個人頁的後續問題（#293 獨立 review 發現，2026-11-27）
  - (a) 頭像的帳號在讀完照片（`reader.onload`）時才記下，第一次重畫也沒有檢查：選照片後、讀取完成前換了帳號，照片會上傳並同步到新帳號；這段期間換頁，個人頁會蓋掉那一頁。(b) 改名與編輯稱號主題的視窗在換頁後仍留著，按下儲存時直接 `renderProfile`，個人頁會畫到別的頁面上。(c) `storage.saveUserAndSync` 同步失敗時把 `_syncPending` 的使用者寫回這台裝置，沒有檢查這台裝置上現在是不是同一個帳號。(d) review 找到 9 個沒被抓到的改動（「尚未登入」與失敗的分支、header 的更新、登出中途、容器不在畫面上）。不涉及 auth／schema，接著修正。
  - 完成（v1.42.13）：選照片時就記下帳號，讀完時已換帳號就不做任何事；之後的重畫都只在個人頁還在時進行（改名、稱號主題的儲存與刪除也一樣）；`saveUserAndSync` 只在這台裝置上仍是同一個帳號時標記待上傳。測試：讀取期間換帳號不上傳、換頁不重畫；「尚未登入」後換帳號不在新帳號的頁面顯示狀態也不存檔；失敗與「尚未登入」時換頁不重畫（頭像與改名）；視窗留著時換頁再儲存不重畫；失敗後 header 也更新；登出中途安靜結束；容器不在畫面上時不畫；`storage-mapping.test.js` 換帳號後不寫回、同一個帳號仍標記。開 PR 前以改動原始碼驗證：10 個改動都會讓測試失敗。「尚未登入」分支裡的 `saveUserLocal` 與前面的寫入重複，拿掉也沒有差別，保留。

- [x] **TEST-011** 補上個人頁的測試（2026-11-27）
  - 新的 `profileActions.test.js`（與 `profile.test.js` 相同的 mock，另外 mock 分享、提示與 Pro 卡片連結）：點頭像開啟選擇照片；上傳時立刻顯示、完成後保留上傳的網址並顯示「頭像已同步」、失敗時放回原本的頭像並顯示錯誤；改名（同步完成後 800 ms 關閉、沒有帳號時顯示存在此裝置、失敗時放回原名、空白不存、✕／點外面關閉）；分享成長卡（複製、失敗、成功與取消不提示）；升等 XP 表（每次多 10 級、到 Lv.100 為止，起始等級不是整十也一樣）；熱力圖與儀表板的 Pro 按鈕。`pages/profile.js` 71% → 97%（行）。
  - 一併補上 #292 review 的兩個檢查：同一個清單裡第二根手指的移動不會帶動第一個拖曳（計畫與任務各一）。

- [x] **BUG-138** 個人頁的頭像上傳與改名同步，結果可能寫進另一個帳號或畫到別的頁面（TEST-011 檢查個人頁時發現，2026-11-27，main 上原本就有）
  - 頭像上傳（`db.uploadAvatar` 之後再 `saveUserAndSync`）與改名同步都在網路請求完成後直接改 `state.user` 並 `renderProfile(container)`：這段期間切到其他頁，個人頁會蓋掉那一頁（router 重用 `#content`）；這段期間登出並換成另一個帳號，上傳的網址、或失敗時的「放回原本的頭像／名稱」會寫進新帳號的 `state.user` 並存到這台裝置。不涉及 auth／schema（只是不寫），接著修正。
  - 完成（v1.42.12）：開始時記下帳號 id，請求完成後若已不是同一個帳號就不改任何資料（改名視窗直接關閉）；同一個帳號（例如同步後 `state.user` 換成新物件）照常保留結果。只在個人頁還在畫面上時重畫。沒有新增 export（INFRA-105）。測試：上傳／同步完成或失敗時已換帳號，新帳號的頭像、名稱與存檔都不變；已換頁時那一頁不變、同一個帳號的頭像仍保留；同一個帳號換了物件仍拿到結果。修正前 8 個測試失敗（「同一個帳號換了物件」本來就會通過）。開 PR 前以改動原始碼驗證：18 個改動都會讓測試失敗。

- [x] **BUG-137** 首頁拖曳的後續問題（#291 獨立 review 發現，2026-11-27）
  - (a) 拖曳中離開首頁（例如滑鼠拖曳時按返回）：`renderHome` 回傳的 cleanup 沒有結束拖曳，浮動的複本留在新頁面上、`window._isDragging` 一直是 true（每一頁的左右滑動都失效，直到首頁再畫一次）。(b) 兩根手指同時按在計畫與任務的把手上會同時開始兩個拖曳，先結束的那個 50 ms 後把 `_isDragging` 改回 false，另一個還在拖；同時按兩個計畫把手會遺失第一個浮動的複本（之後 `renderHome` 也清不掉）。(c) BUG-136 的「舊把手的 pointerup 不會移動任何東西」測試沒有先移動，放下的位置是原本那張卡片，拖曳沒結束也會通過。不涉及 auth／schema，接著修正。
  - 完成（v1.42.11）：cleanup 也呼叫 `_abandonDrags()`；兩個把手的 `pointerdown` 在已經有拖曳時不開始；拖曳記下開始它的 `pointerId`，其他手指的 move／up／cancel 不影響它；兩個 50 ms 的重設只在沒有拖曳進行時把 `_isDragging` 改回 false。測試：離開首頁時結束拖曳；任務先、計畫先各自擋掉第二個拖曳；同一個清單裡第二根手指不開始、不移動、不結束第一個拖曳（計畫與任務各一）；同類或另一類的拖曳在 50 ms 內開始仍擋頁面滑動；舊把手先移動再放開。開 PR 前以改動原始碼驗證：7 個改動都會讓測試失敗（包括 review 指出 `_abandonDrags` 沒把拖曳設為結束的兩個）。
  - 審查（#292）：Codex 沒有問題。獨立 review 沒有 P1／P2；P3：「一次只能拖曳一項」只擋了兩個清單之間，同一個清單裡第二根手指的 move／up 仍會移動並結束第一個拖曳——已改為依 `pointerId` 判斷；另外 4 個沒被抓到的改動（同一個清單的兩個把手、同類拖曳 50 ms 內再開始）已補上測試，這 8 個改動都會讓測試失敗。

- [x] **BUG-136** 首頁拖曳排序的幾個邊界情況（#290 獨立 review 發現，2026-11-27，main 上原本就有）
  - (a) 拖曳中首頁被重畫（例如同步完成），把手已不在畫面上，收不到 `pointerup`：浮動的複本留在畫面上，`window._isDragging` 一直是 true（頁面左右滑動失效），要重新整理。(b) `pointercancel` 會照一般放下處理，移到最後經過的卡片；取消應該放回原位。(c) 今日計畫的拖曳沒有設定 `_isDragging`（水平拖超過 60 px 會同時換頁）、沒有擋右鍵與右鍵選單。(d) 把卡片拖到另一個分類的卡片上，會改變它在自己分類裡的順序。不涉及 auth／schema，接著修正：`renderHome` 開始時取消進行中的拖曳（或處理 `lostpointercapture`）、取消時不重排、計畫拖曳比照任務拖曳、只在同一分類內重排。
  - 完成（v1.42.10）：(a) `renderHome` 開始時結束還在進行的拖曳（移除浮動的複本、`window._isDragging` 回到 false），舊把手之後的 `pointerup` 不會再移動任何東西；放下時自己造成的重畫不受影響（拖曳在重畫前就標為結束，頁面左右滑動仍會擋 50 ms）。(b) `pointercancel` 不重排，放回原位（今日計畫與任務清單）。(c) 今日計畫的把手比照任務清單：拖曳時設定 `_isDragging`（50 ms 後清除）、右鍵不開始、沒有右鍵選單。(d) 任務清單只在被拖的卡片所在的分類裡找目標（標示與放下都是），拖到其他分類不會動。測試在 `homeInteractions.test.js`：重畫中斷任務／計畫拖曳、放下重畫後仍擋 50 ms、取消放回原位、計畫把手的右鍵、跨分類不放下。開 PR 前以改動原始碼驗證：12 個改動都會讓測試失敗。

- [x] **TEST-010** 補上首頁的測試（2026-11-27）
  - 新的 `homeInteractions.test.js`（與 `home.test.js` 相同的 mock，再加上拖曳會用到的 storage 呼叫）：今日計畫以把手拖曳排序（放在另一項的下半／上半、放回原處或清單外不變、拖曳後的點擊不算完成、沒有點擊時 50 ms 後恢復、取消拖曳不吃掉下一次點擊）；任務清單以把手拖曳排序（震動、浮動的複本、重排後存檔並保持編輯模式、放在自己或空隙不變、右鍵不開始、把手沒有右鍵選單）；卡片滑動（短的或偏垂直的不打開、水平滑動不會同時切換頁面、點外面關閉並離開編輯模式）；任務細節與今日計畫說明視窗（點裡面不關、✕ 或點外面關閉）；沒有 A／S 專注任務時 Main Quest 前往設定頁。`pages/home.js` 60% → 95%（行）。
  - 開 PR 前以改動原始碼驗證：25 個改動中 24 個會讓測試失敗；剩下的（拖曳時略過被拖的那一張）在卡片不重疊時與原本等價，放下時本來就不會把自己當目標。Main Quest 已完成的提示沒有在這裡測：獎勵只從 2026-07-17 起算，這個測試環境的「今天」是 2026-04-11。
  - 審查（#290）：Codex 沒有問題。獨立 review 試了 51 個改動，找到 8 個沒被抓到的（3 個等價）：今日計畫拖曳不經過 `currentDailyPlan`（HW-113：前一天的計畫拖曳後從空的開始，已加測試）、拖曳時沒清除上一個標示、一次手勢只判斷一次、把手的 `preventDefault`／`setPointerCapture`／`stopPropagation`；兩個測試沒有先確認卡片真的打開；一個測試的說明沒有對應的檢查；`afterEach` 會丟掉還沒跑的計時器、`navigator.vibrate` 只有通過時才刪除。已全部補上（10 個改動都會讓測試失敗），「點另一張卡片時已打開的卡片不關」是既有的行為，沒有另外鎖定。P2 記為 BUG-135（已修，見上）；離開首頁時移除監聽也一併做了；其他拖曳的問題記為 BUG-136（見 Next）。

- [x] **BUG-134** 首頁每次重畫都在頁面容器上多加一個點擊監聽（TEST-010 檢查首頁時發現，2026-11-27，main 上原本就有）
  - `_setupCardSwipe` 對 `container`（router 一直重用的 `#content`）加上「點外面關閉滑開的卡片、離開編輯模式」的 click 監聽，每次 `renderHome` 都再加一個、從不移除；完成任務、換頁回來都會重畫，點一下就跑很多次。不涉及 auth／schema，接著修正。
  - 完成（v1.42.9）：以 `WeakMap` 依容器記住上一次的監聽，重畫時先移除再加上（與 BUG-124 的做法相同），離開首頁（`renderHome` 回傳的 cleanup）時也移除；沒有新增 export（INFRA-105）。測試：畫 5 次後點一下只處理一次；重畫後仍能關閉滑開的卡片（先確認有打開）、離開編輯模式；離開首頁後在同一個容器點擊不再處理。修正前第一個測試會失敗。

- [x] **BUG-135** 任務清單拖曳排序後，下一次點任務卡片沒有反應（#290 獨立 review 發現，2026-11-27，main 上原本就有）
  - `_drag.wasDragging` 用來擋掉放下後緊接著的那次點擊，但只有「點到卡片且不是把手」才會清除，沒有像今日計畫那樣 50 ms 後清除。放下後的點擊落在把手上、重排會重畫清單、觸控拖曳通常沒有點擊，所以旗標留著，下一次點任務卡片（幾秒後也一樣）被吃掉。TEST-010 第一版的測試把這當成正確行為。不涉及 auth／schema，接著修正。
  - 完成（v1.42.9）：拖曳結束 50 ms 後一併清除 `_drag.wasDragging`（與 `window._isDragging`、今日計畫的做法相同）。測試：放下後緊接著的點擊不加入、50 ms 後的點擊會加入；放下後沒有點擊、5 秒後點任務卡片會加入（修正前失敗）。

- [x] **BUG-133** 設定頁的手動同步可以同時跑兩次（#288 獨立 review 發現，2026-11-27，main 上原本就有）
  - 「同步中」只記在按鈕上：同步時離開設定頁再回來，或設定頁重畫（例如存了一個任務），新的按鈕可以再按，`syncFromRemote()` 會再跑一次（冷卻時間在 `loadFromRemote` 完成後才記下）。手動同步也沒有經過 `app.js` 的排隊（那裡的註解說兩次同時載入可能重複補上傳打卡紀錄）。改為模組層級記住進行中的同步，重畫時按鈕維持停用、完成後恢復。不涉及 auth／schema，接著修正。
  - 完成（v1.42.8）：`storage.syncFromRemote()` 記住進行中的同步，期間再要求同步會拿到同一個結果（不會再載入一次；失敗也一樣，且不記冷卻時間，可以馬上再試），結果出來前就清除。設定頁重畫時若有進行中的同步，按鈕顯示「同步中…」並停用，同步結束後（成功或失敗）若設定頁還在就重畫。舊的按鈕在失敗時只會恢復自己（已不在畫面上），所以這一步也處理失敗的情況。`storage.js` 沒有新增具名 export（新方法在既有的 `storage` 物件上，設定頁以 `?.()` 呼叫），符合 INFRA-105。與 `app.js` 啟動／重新連線的載入仍可能同時進行：`sessions.id` 是主鍵，重複補上傳只會失敗並留到下次，影響很小，沒有在這裡改。
  - 一併做 #288 review 的 P3：首頁今日計畫的 D 級恢復型任務也顯示「回能」（任務清單本來就是）；卡在 0 的 B 級上限測試改為檢查剛好是 B 級的 100（今天已有 95 時只再給 5）；`antigrind.test.js` 裡的上限邏輯副本改成與 `applyDailyCap` 相同。
  - 測試：`storage-mapping.test.js`（同時兩次只載入一次、同一個 promise、之後在冷卻時間內；失敗也共用、沒有冷卻、可再試；立即丟出的錯誤也清除；換帳號後不共用、A 結束不清 B；結果出來時已清除）；`settingsControls.test.js`（重畫時停用與「同步中…」、成功或失敗後恢復、重畫多次也只再畫一次、離開頁面後不重畫）；`home.test.js`（計畫卡的回能）；`sessionFlowSettlement.test.js`（95 + 5）。開 PR 前以改動原始碼驗證：BUG-133 的 7 個改動與上限、計畫卡的改動都會讓測試失敗（一開始沒被抓到的「重畫後同步失敗」已補上測試）。
  - 審查（#289）：Codex 沒有問題。獨立 review 沒有 P1／P2；P3 也一併處理：同步若同步地丟出錯誤，記號會永遠留著（改為 `Promise.resolve().then(...)` 開始，任何錯誤都是失敗並清除）；帳號 A 的同步還沒結束就換成帳號 B，B 的按鈕也會被停用（記號改為記下開始時這台裝置的帳號，只對同一個帳號有效，A 的同步結束也不會清掉 B 的）；重畫時同步結束只重畫一次（`?.disabled` 原本沒有測試）；tasks.md 兩處說明更正。請求一直沒有回應時按鈕會維持「同步中…」到重新整理（supabase 沒有 fetch timeout）；之前離開再回來可以再按，現在不行，這是預期的取捨。這 5 個改動都會讓測試失敗。

- [x] **BUG-129** 手動同步完成時，可能把設定頁畫到別的頁面上（#287 獨立 review 發現，2026-11-27，main 上原本就有）
  - `pages/settings.js` 的同步按鈕在 `syncFromRemote()` 成功後直接 `_renderView(container)`；router 會重用 `#content`，按下同步後換到其他頁，同步完成時設定頁會蓋掉那一頁。「刪除所有佐證照片」（`container.isConnected && …`）與位置情境已有同樣的檢查。改為只在設定頁還在時重畫。不涉及 auth／schema，接著修正。
  - 完成（v1.42.7）：同步成功後只在設定頁還在（`container.isConnected` 且有 `#sync-btn`）時重畫。測試：同步期間換頁，完成後那一頁不變；仍在設定頁時重畫。

- [x] **BUG-130** 編輯任務視窗沒有跳脫儲存的 Emoji 與圖示（#287 獨立 review 發現，2026-11-27，main 上原本就有）
  - 任務清單會跳脫（AUDIT-001），但 `_showTaskModal` 的圖示預覽與 Emoji 預覽直接把 `task.emoji`／`task.iconImg` 放進 HTML，儲存的值若含 HTML 會變成元素（只影響使用者自己的資料）。改為跳脫，並加上與 AUDIT-001 相同的測試。不涉及 auth／schema，接著修正。
  - 完成（v1.42.7）：圖示預覽、Emoji 預覽以 `escHtml` 輸出。測試：含 HTML 的 Emoji 以文字顯示、含引號的圖示留在 `src` 裡，沒有產生 `[onerror]` 元素。

- [x] **BUG-131** 編輯任務改了價值等級，每日 XP 上限仍是原本的（#287 獨立 review 發現，2026-11-27，main 上原本就有）
  - `saved.dailyXpCap` 為 `task?.dailyXpCap ?? capMap[value]`：改成 D（上限 0）後再改回 B 就永遠沒有 XP；S 改成 B 仍保留 300。改為價值等級改變時用新的上限，沒變時保留原本的（自訂值不動）。不涉及 auth／schema，接著修正。
  - 完成（v1.42.7）：等級改變時用新等級的上限（S 300、A 200、B 100、D 0），沒變時保留原本的（沒有上限時用等級的）。已經卡在 0 的 B 級任務：結算時（`sessionFlow.js` 的 `applyDailyCap`，上限只對 B 級有作用）把 0 當成沒有上限（B 級的 100），編輯時也改存 100；沒有任何介面或內建任務會給 B 級 0。注意：內建的 B 級（上限 50）若改成其他等級再改回 B，會變成 100（「保留原本的」只在等級不變時）。測試：B → D → B → S → A、保留自訂的 1、沒有上限時補上、卡在 0 的 B 級編輯後恢復；`sessionFlowSettlement.test.js` 卡在 0 的 B 級仍有 XP、自訂的 1 仍是上限。

- [x] **BUG-132** 任務視窗的 XP 預覽對「恢復」性質的任務顯示會得到 XP（#287 獨立 review 發現，2026-11-27，main 上原本就有）
  - `previewBaseXP` 只看價值、難度與抗拒感，`calcBaseXP` 對 impactType 不是 `task` 的任務給 0（首頁 `home.js` 也刻意不顯示）；恢復／B 在視窗裡顯示「+17」。改為恢復與娛樂都顯示「此任務不提供 XP」。不涉及 auth／schema，接著修正。
  - 完成（v1.42.7）：恢復、娛樂性質不預覽 XP；恢復型顯示「此任務不提供 XP，完成後回能」（`calcEnergyGain` 與等級無關，D 級也會回能；內建的散步、午休都是 D）。測試：恢復的 B／A／D、娛樂、儲存為娛樂但等級不是 D 的任務、改回必要性質後恢復預覽。
  - 開 PR 前以改動原始碼驗證：BUG-129～132 的 10 個改動都會讓測試失敗。
  - 審查（#288）：Codex 沒有問題。獨立 review 沒有 P1；P2：之前已經卡在 0 的 B 級任務仍然卡住（只修了之後的編輯）——已改為結算與編輯都會恢復。P3：恢復型 D 級也會回能（已改為也顯示）、儲存為娛樂但等級不是 D 的預覽（已補測試）、CHANGELOG 用詞；同時在跑兩次同步記為 BUG-133（已完成，見上方）。新的 5 個改動都會讓測試失敗；沒被抓到的 `container.isConnected` 與原本等價（router 一直重用已掛上的 `#content`）。

- [x] **TEST-009** 補上設定頁的測試（2026-11-27）
  - 只加測試、不改 app 程式：新的 `settingsControls.test.js`（與 `settings.test.js` 相同的 mock，另外 mock 佐證照片與匯出模組，只檢查頁面呼叫了什麼）——Pro 功能說明（位置不超出畫面、換一個說明會取代、點別處 180 ms 後關閉）與方案面板（三個方案、不重複開、點方案提示金流即將上線、點外面關閉、280 ms 後移除）；從鎖住的功能前往 Pro 卡片（捲動、scroll 結束或 600 ms 後高亮 2 秒，之後再捲動不會再高亮）；Pro 的 CSV／PDF；偏好設定（完成音效、預設分鐘、新的一天開始時間、進階模式，沒有使用者時不存）；任務清單展開；背景圖片上傳與移除、重啟教學；手動同步的四種失敗提示與按鈕恢復、未登入、同步中再按；佐證照片按鈕（登入與訪客的說明、保留還沒上傳的、沒有照片時不能按、取消、刪除全部要問兩次、雲端沒刪完的提示、離開頁面後不重畫）；登出與清除本機快取；任務視窗（名稱必填、XP 預覽、性質與價值的限制、A 級確認、S 級的原因／成功標準／性質、有效分鐘數、影響類型與每日上限、編輯保留自己的設定、Emoji 與說明、改回 Emoji、關閉）。`pages/settings.js` 80% → 99%（行）。
  - `storage-mapping.test.js`：同步期間（查詢之後、寫入之前）在這台裝置改的任務（拿掉圖示、改成 S 級），寫入時以當下的為準（#286 review 建議；把讀取移回查詢之後就會失敗）。
  - 修正 #285 的 BUG-126 測試在機器忙時會失敗：jsdom 的 `FileReader` 真的讀檔，可能超過測試等待的 20 ms。改為 `FileReader` 與 `Image` 都以 microtask 回應，整個選圖流程在任何計時器之前完成（#287 review 指出第一版改用 `setTimeout(0)` 仍然會在忙的時候失敗；改用 microtask 後，8 份同時跑、有／沒有 coverage 各兩次都通過）。
  - 開 PR 前以改動原始碼驗證：31 個改動中 29 個會讓測試失敗；沒被抓到的兩個與原本等價（說明按鈕本身會 `stopPropagation`，所以延後加上關閉的 listener 不影響；停用的按鈕不會觸發 click）。jsdom 的 selector 不會比對屬性值裡 BMP 以外的 emoji（例如 🚀），測試改用 `dataset` 找按鈕。
  - 審查（#287）：Codex 沒有問題。獨立 review 試了 111 個改動，23 個沒被抓到（10 個等價）。P1：BUG-126 測試的第一版修正仍會在忙的時候失敗（見上）。P2：「只高亮一次」與高亮 2 秒沒有檢查；整個測試沒有檢查照片圖示有被存下。P3：沒有使用者時的進階模式測試沒有真的走到檢查（`confirm` 沒有回答）；任務視窗存檔沒有檢查 `saveTasks`；預覽 4 項、預設開啟音效、清除照片後重畫、難度的 listener、維持性質的編輯、編輯 A 級不再詢問、捲動後的位置。已全部補上，這 12 個改動都會讓測試失敗。review 另外找到 4 個 main 上原本就有的問題，記為 BUG-129～132（見 Next）。

- [x] **BUG-127** S 級任務每日上限的另外兩個繞過方式（#285 獨立 review 發現，2026-11-26，main 上原本就有）
  - (a) 把既有的 A 級任務編輯成 S 級不受上限限制（`settings.js` 只在新增時檢查）。(b) 上限以日曆日（`today()`）計算，但打卡紀錄與每日計畫以 `effectiveToday(newDayHour)` 為一天：23:00 新增 2 個、00:30 再新增 2 個仍在同一個「一天」裡。不涉及 auth／schema，接著修正。
  - 完成（v1.42.6）：(a) 新增 S 級任務或把任務改成 S 級（原本不是 S）都要檢查上限；改成 S 級的任務記下 `sSince`（那一天），之後當天就算在上限裡，改回其他等級時移除，只改名稱等不變。(b) 上限、新任務的建立日期與雲端時間戳記都以 `effectiveToday(newDayHour)` 的一天計算（`_dayOf()`：時間在新的一天開始時間之前算前一天），使用者自己的設定為準。`sSince` 不是雲端欄位：`storage.js` 的 `loadFromRemote` 依 id 把同一個擁有者在這台裝置上的 `sSince`（任務仍是 S 級時）與 `iconImg` 帶回拉下來的任務，所以同步後仍保留（`iconImg` 原本每次同步都會被清掉，一併修正）；跨裝置保留另記為 BUG-128（需核准）。編輯內建任務時保留 `isDefault`（原本會被拿掉並同步成 `is_default = false`，之後就算在上限裡）。
  - 測試：`settings.test.js` 改用固定的時間與時區：23:00 兩個、00:30 被擋、05:30 是新的一天；新的一天開始時間之前的雲端任務算前一天；`newDayHour: 0` 時以午夜為界（午夜前不算、午夜後算）、剛好 05:00 算新的一天、只算 S 級；新任務在 01:30 仍以前一天建立；兩次改成 S 級後第三次（改或新增）被擋、隔天可以；有空間時可以改、隔天改名保留原本的 `sSince`、改回 A 級移除；新任務沒有 `sSince`；編輯內建任務仍是內建，把內建任務改成 S 級也算在上限裡。`storage-mapping.test.js`：同一個擁有者同步後保留 `sSince`（任務已改回 A 級時不保留）與 `iconImg`，其他擁有者（例如訪客）的不帶入，本機的任務清單損壞時仍能同步。開 PR 前以改動原始碼驗證：試了 16 個改動，15 個會讓測試失敗（一開始沒被抓到的兩個——新任務的建立日期在 01:30 的情況、新任務也加上 `sSince`——已補上測試）；剩下的是無法讀取的時間戳記回傳 null 的判斷，拿掉後結果是 "Invalid Date"，同樣不會被算到，為了清楚保留。
  - 審查（#286）：Codex 沒有問題。獨立 review 沒有 P1；P2：每次從雲端同步（開 app、重新連線、設定頁的同步按鈕）都會拿掉 `sSince`，同一台裝置同步一次就能再改 2 個——已改為同步時帶回。P3：三個沒被抓到的改動（`_dayOf` 寫死 5、`<` 改 `<=`、拿掉只算 S 級）已補上測試；編輯內建任務會拿掉 `isDefault`（main 上原本就有，現在會影響上限）已修正；兩處文件說明已更正。新的 9 個改動都會讓測試失敗。第二輪（3aee35a）：保留 `isDefault` 之後，進階模式把內建任務改成 S 級就不會被算到（P2）——改為內建任務只在「建立日期」那一項不算，改成 S 級的 `sSince` 一律算；同步時改在寫入前才讀本機的任務（中間沒有 await，同步期間的編輯不會被蓋掉）、本機清單損壞時不讓同步失敗、`syncableTask` 的註解移回原位。

- [x] **BUG-125** S 級任務的每日上限算錯日期（TEST-009 檢查設定頁時發現，2026-11-26）
  - `pages/settings.js` 以 `t.createdAt === today()`（當地日期）計算今天新增的 S 級任務，但新任務的 `createdAt` 是 `toISOString().slice(0, 10)`（UTC 日期，台灣 00:00–08:00 是前一天），從雲端拉下來的任務則是 `tasks.created_at`（timestamptz，完整時間戳記）。兩者都不會被算到，登入帳號同步後每天都能再新增 S 級任務。`defaultTasks.js` 的建立日期與 `export.js` 的 CSV 檔名也用 UTC 日期。不涉及 auth／schema（只讀 `created_at`，不寫入），接著修正。
  - 完成（v1.42.5）：`settings.js` 的 `_localDateOf()`：`YYYY-MM-DD` 照用，時間戳記取當地日期，無法讀取時不算；內建的預設任務（`isDefault`）不算（它們現在以當天日期建立，否則新帳號第一天只能再新增 1 個；main 上訪客在台灣 08:00 後本來就會這樣）；新任務與預設任務的建立日期用 `today()`，CSV 檔名用 `toLocaleDateString('sv')`。`settings.test.js` 在台北與洛杉磯檢查：雲端時間戳記依當地日期計算（UTC 已是隔天但當地還是前一天的不算）、本機日期在 UTC 以西也照算、新任務以當地日期建立並計入上限、編輯任務保留原本的日期（今天已有 2 個 S 級時仍可編輯）、內建任務不算；`defaultTasks.test.js`、`exportWeeks.test.js` 檢查台北、UTC、洛杉磯的日期。helper 留在 `settings.js` 內，沒有新增 export（INFRA-105）。

- [x] **BUG-126** 設定頁的背景圖片與任務圖示選到無法讀取的照片時沒有任何反應（TEST-009 檢查設定頁時發現，2026-11-26）
  - `settings.js` 的 `_compressImage()` 沒有 `onerror`：照片無法解碼（例如電腦版 Chrome 的 HEIC）或讀取失敗時 Promise 永遠不會結束，畫面沒有任何提示。背景圖片寫入 localStorage 失敗（空間不足）時也會丟出未處理的例外。
  - 完成（v1.42.5）：讀取、解碼或繪製失敗時 reject，兩個選擇器都提示「圖片處理失敗，請換一張照片」，任務圖示維持 Emoji；背景圖片存不下來時提示「這台裝置的空間不足，背景圖片沒有存下來」；失敗後清空 input，可以再選同一個檔案。任務視窗的 z-index 是 50，toast 是 200，所以 toast 看得到（與 BUG-124 的面板不同）。`settings.test.js` 檢查成功（正方形、最多 900／200 px、品質 0.72／0.82）、無法解碼、無法讀取、無法繪製、空間不足；e2e `bug126-settings-image.test.js` 在真的瀏覽器用無法解碼的檔案與真的 JPEG 檢查背景與任務圖示，並確認 input 已清空（修正前找不到提示而失敗）。
  - 開 PR 前以改動原始碼驗證：12 個改動都會讓測試失敗。其中兩個一開始沒被抓到：日期字串的捷徑在台北拿掉也會通過（UTC 午夜在台北同一天），已加上洛杉磯；編輯任務的測試因為 S 級缺少原因而沒有真的存檔，已補上原因並檢查有存。另一個沒被抓到的是多餘的型別檢查，已移除。
  - 審查（#285）：Codex 沒有問題。獨立 review 沒有 P1；兩個 P2：e2e 的任務圖示那一半檢查到的是背景圖片留下的 toast（2.5 秒），圖示選擇器卡住也會通過；「可以再選同一個檔案」完全沒有測試（jsdom 看不到）。已改為先移除舊的 toast、檢查 `input.files.length` 為 0，並補上真的 JPEG 成為圖示；兩者拿掉後 e2e 都會失敗。P3 也補上：編輯測試加上今天已有 2 個 S 級（抓得到拿掉 `!isEdit`）、`img.onload` 裡出錯（例如沒有 2D context）也 reject、測試用 PostgREST 的 6 位小數時間戳記、內建任務不算。另外兩個既有的繞過方式記為 BUG-127（已於 #286 完成，見上方）。

- [x] **BUG-124** 佐證面板確認後的兩個問題（#283 獨立 review 發現，2026-11-26，已在 main 上）
  - (a) `ui/proofSheet.js` 把新縮圖綁定時以該列為範圍（`bindProofThumbs(logItem, …)`），之後把這張照片設為個人空間展示，其他列原本的 ✓ 不會清掉，首頁 Orbit Window 的成就照片也不會更新（首頁自己的 `onPhotoWallChange` 沒有被呼叫），要等頁面重畫。要改需要讓 `sessionRow.js` 提供「只綁這一個縮圖、範圍是整個列表」的方式，並讓首頁的更新也被呼叫；兩者都是 SHELL 模組，要注意 INFRA-105（不能讓既有 SHELL 模組 import 另一個的新 export），接著設計並修正。
  - (b) `saveProof()` 寫入 localStorage 失敗（空間不足）時會丟出例外，面板停在那裡、沒有任何提示。應該提示「這台裝置的空間不足，照片沒有存下來」並保留面板讓使用者跳過。
  - 完成（v1.42.4）：(a) 面板放入縮圖後，從縮圖發出可取消的 `orbit:proof-added` 事件；`sessionRow.js` 的 `bindProofThumbs` 在它綁定的列表上接住（每個列表一個 listener，最新一次 render 的設定為準），以整個列表為範圍、用頁面自己的 `onPhotoWallChange` 綁定這個縮圖（首頁因此也會更新 Orbit Window 的成就照片）。沒有頁面接住時（舊的快取 `sessionRow.js`），面板照原本的方式只綁這一列。沒有新增 export，符合 INFRA-105。(b) `saveProof()` 失敗時在面板裡的 `#proof-msg`（`role="status"`）顯示「這台裝置的空間不足，照片沒有存下來」，不排入雲端、不放縮圖，面板留著；照片處理失敗的提示也改在這裡（「圖片處理失敗，請換一張照片」），選下一張照片時清除。
  - 測試：`sessionRowProofAdded.test.js`（新照片的開關會清掉其他列的 ✓、呼叫頁面的 handler、預覽可開；重複 render 只用最新的 handler 一次；沒有列表時不接）、`proofSheetFlow.test.js`（頁面接住時面板不自己綁定；空間不足時的提示與面板留著）、e2e `bug124-proof-wall.test.js`（首頁實際流程；修正前其他列的 ✓ 不會清掉）。
  - 審查（#284）：Codex 沒有問題。獨立 review 的 P1：空間不足的 toast（z-index 200、離底部約 84 px）被面板（z-index 500）蓋住，使用者仍然看不到說明，因此改為在面板裡顯示（處理失敗的提示同樣如此）。P3 也補上：已被內層列表接住的事件不再處理（`defaultPrevented`）；測試加上點舊列的開關只切換一次（抓得到重新綁定整個列表）、非縮圖發出的事件不接；空間不足的測試改為 `mockImplementationOnce`，並確認下一張照片會清除訊息後存下；e2e 改為檢查 Orbit Window 的成就照片換成新照片（原本的 toast 檢查在修正前也會通過），並加上空間不足的情況（訊息在 `elementFromPoint` 是最上層、面板留著、略過可關閉）。開 PR 前以改動原始碼驗證，10 個改動都會讓測試失敗。

- [x] **TEST-008** 補上照片佐證的測試（2026-11-26）
  - 只加測試、不改 app 程式：`proofSheetFlow.test.js`——全螢幕照片（點一下淡出後移除）；佐證面板（任務名稱以文字顯示、選照片前不能確認、固定在畫面底部）；選照片（壓縮後預覽、處理失敗的提示、取消選擇）；確認（存在這台裝置；只有登入且有已存 session 的帳號才排入雲端備份；縮圖放進該筆紀錄、在 XP 之前、取代雲端的佔位、不重複，以及個人空間照片牆的提示）；略過或點面板外關閉；拍照模組載入失敗時不開面板。`ui/proofSheet.js` 57% → 100%。
  - 開 PR 前以改動原始碼驗證：17 個改動都會讓測試失敗。jsdom 的 `element.querySelector('#id')` 在文件有重複 id 時會回傳 null（瀏覽器不會），測試因此等前一個面板關閉後再開下一個，與 app 的實際情況相同。
  - 審查（#283）：Codex 沒有問題。獨立 review 再試了 27 個改動，17 個沒被抓到，三個 P2：照片與面板移除的時間只在點擊後立刻檢查（改成 0 ms 也會通過）；只有一筆紀錄，縮圖放錯列也不會失敗；「蓋在最上層」「固定在底部」只檢查了 position。已補上：199／200 ms、299／300 ms 的前後檢查、三筆紀錄（上方有另一個雲端佔位、下方已有縮圖）只改目標列、z-index 600 高於面板的 500、inset 與 bottom；P3 也補上（等待照片處理的結果而不是呼叫、拍照模組載入失敗時不顯示提示、錯誤時的完整參數）。這些改動都會讓測試失敗。另外發現 BUG-124（見 Next）。

- [x] **BUG-123** 成長報告 PDF 的每週圖表標籤在 UTC 以東（包括台灣）早一天（#281 獨立 review 發現，2026-11-26）
  - `export.js` 的 `_weekStart()` 以當地午夜算出週一，再用 `toISOString()` 轉回日期——那是 UTC 日期，在台灣（UTC+8）變成前一天週日（11-25 那週標成 11/22）。每週的總數正確，只有標籤錯。改為以當地日期格式化（`toLocaleDateString('sv')`）。不涉及 auth／schema，接著修正。
  - 完成（v1.42.3）：`_weekStart()` 與「全部時間」報告的檔名改用當地日期（`toLocaleDateString('sv')`）。`exportWeeks.test.js` 以台北、Kiritimati、UTC、洛杉磯各自產生報告（每次清空上一次的結果），檢查每週標籤都是週一（11/2、11/23、11/30）與檔名的當地日期；修正前台北標成 11/1、11/22、11/29。

- [x] **BUG-122** 登入帳號的個人頁「使用天數」顯示 NaN、「加入於」顯示原始時間戳記（#281 獨立 review 發現，2026-11-26）
  - `pages/profile.js:50` 以 `user.createdAt + 'T00:00:00'` 計算加入至今的天數；登入帳號的 `createdAt` 來自 `profiles.created_at`（timestamptz，例如 `2026-10-01T12:34:56+00:00`），接上後是無效日期，天數變成 NaN。第 118 行也直接顯示這個時間戳記。訪客的 `createdAt` 是 `YYYY-MM-DD`，沒有問題。改為：先取當地的加入日期（時間戳記用 `new Date(...)` 再轉當地日期，日期字串用當地午夜），天數與顯示都用它。不涉及 auth／schema，接著修正。
  - 完成（v1.42.3）：`profile.js` 的 `_localDateOf()`：日期字串照用，時間戳記取當地日期，缺少或無法讀取時用今天；天數與「加入於」都用它。天數改為日曆天數（含加入當天，DST 前後不會差一天），不存在的日期（例如 2026-13-45）也改用今天。`profile.test.js` 在台北與洛杉磯檢查訪客日期與帳號時間戳記（微秒、跨日的 20:30 UTC），以及缺少、無法讀取、不存在的日期與 DST 後一小時；修正前顯示 NaN。#282 獨立 review 指出訪客日期原本只在台北檢查（UTC 午夜在台北剛好同一天，拿掉判斷也不會失敗），已補上洛杉磯。

- [x] **BUG-121** 晨間報告的日期在 UTC 以西的時區少一天（#280 獨立 review 發現，2026-11-26）
  - `dayCycle.js` 的 `showDailyReport()` 以 `new Date(yStr)` 顯示昨天的日期；`'YYYY-MM-DD'` 會被當成 UTC 午夜，在 UTC 以西（例如美洲）顯示成前一天（昨天是 11-25 卻顯示 11月24日）。台灣（UTC+8）不受影響。改為 `new Date(yStr + 'T00:00:00')`（當地午夜），並在測試中以 UTC 以西的時區檢查標題。不涉及 auth／schema，不需核准，下一個 PR 修正。
  - 完成（v1.42.2）：改為 `new Date(`${yStr}T00:00:00`)`。`dayCycleRhythm.test.js` 在洛杉磯、帕果帕果、UTC、台北、基里巴斯 Kiritimati（UTC+14）五個時區檢查標題都是昨天（並確認時區真的切換了）；修正前在洛杉磯會顯示「11月24日」。#281 獨立 review 以 418 個時區、1990–2035 每一天驗證，包含午夜被跳過或重複的日子。同一次 review 找到另外兩個日期問題（已在 main 上）：BUG-122、BUG-123（見 Next）。

- [x] **TEST-007** 補上跨日流程的測試（TEST-006 之後的下一項，2026-11-26）
  - 只加測試、不改 app 程式：`dayCycleRhythm.test.js`，以真的 engine 計算每一天——每週一致性獎勵（週一、前 7 天有 5 個有效日給 60 XP 且只給一次；4 天、當天與第 8 天不算；其他日子不檢查；以使用者自己的換日時間判斷週一）、跨日監看（只啟動一次；換日時重新載入計畫、套用當天主題、顯示報告；能量已重設或已登出時不顯示）、晨間報告（休息日／成長中／有效日、每一條建議與最多三條、XP、有效任務數、價值分布、XP 前三的任務、依換日時間判斷昨天）、保護卡的確認（取消與放棄）、從連勝區重新顯示、說明氣泡（同時一個、位置、下一次點擊關閉）、45 天解鎖慶祝。`dayCycle.js` 72% → 100%。
  - 開 PR 前以改動原始碼驗證：22 個改動都會讓測試失敗（第一輪有三個沒被抓到：登出後的換日要在預設的 05:00 之後、只有娛樂的一天、任務原本就依 XP 排好，已補強）。
  - 審查（#280）：Codex 沒有問題。獨立 review 再找到四個 P2（16 個沒被抓到的改動）：上週領過獎勵後這週不能再領也不會失敗；換日監看的週期、登出時日期仍往前、報告之後的晨間視窗；連勝 1 天與「連勝中但非有效日」的建議、需要四捨五入的娛樂時數；同一任務的 XP 相加、無效的紀錄不列入前三。都已補上，12 個改動都會讓測試失敗；P3 補上說明氣泡的 z-index 與未被夾住的位置、沒有 totalXP 時從 0 起算。另外發現 BUG-121（見 Next）。

- [x] **TEST-006** 補上 Pro 專注計時的測試（TEST-005 之後的下一項，2026-11-26）
  - 只加測試、不改 app 程式：`focusTimerPro.test.js`——Pro 的時長選擇（任務建議的最少分鐘、低於建議時的提醒、預設時長與自訂時長互相清除、記住上次的時長〔預設或自訂〕、不是正數的時長視為沒有選）、倒數到選定時長自動結束並響結束音、詢問結果、Pro 的備註隨結果送出（免費使用者沒有）、達到最低有效時間時響兩聲且只響一次（關閉聲音、免費使用者、沒有 Web Audio 時不響）、不存在的任務與已在進行中。`focusTimer.js` 67% → 89%。
  - 開 PR 前以改動原始碼驗證：14 個改動都會讓測試失敗（第一輪有兩個沒被抓到：自訂時長 0 測不到「必須是正數」、第二次開始時沒檢查選擇視窗；已補強）。
  - 審查（#279）：Codex 沒有問題。獨立 review 找到三個 P2（斷言沒有作用）：「計時已停止」在拿掉 `clearInterval` 時仍通過（之後每秒重複結束、響聲、開結果視窗，只是沒人按）；小視窗原本就是隱藏的；按「自由計時」時沒有先選時長。已改為：倒數途中縮成小視窗、分頁睡過目標時間、結束後不再響也不再開第二個結果視窗、結果的分鐘數是目標而不是實際經過、選了時長仍按自由計時。P3 也補上：10 分鐘以下的顯示、提醒的邊界（剛好等於建議時間不提醒）、自訂改回預設時清掉提醒、倒數結束時立刻停止桌面模式的感測器（不是等選完結果）。7 個改動都會讓測試失敗；環境音在 jsdom 沒有麥克風，無法測。

- [x] **TEST-005** 補上呼吸稱號的狀態與路由的導覽測試（TEST-004 之後的下一項，2026-11-26）
  - 只加測試、不改 app 程式：`titleBreathingState.test.js`（Lv.50 起日之呼吸的解鎖：每個條件各自不成立時都不解鎖——有效日 70%、S／A XP 60%、前三流派 75%、單一流派未滿 45%；新流派要連續三天領先才換上、狀態存在這台裝置；說明視窗的主／副流派、未解鎖說明、文字跳脫、關閉）、`routerNavigation.test.js`（底部列與滑動方向、超過 200 ms 才顯示載入中、頁面載入失敗時回首頁並提示、左右滑動換頁與不換頁的情況：太短或偏垂直、第一頁與最後一頁、輸入框與剛打完字、拖曳中、全螢幕照片）。`titleBreathing.js` 54% → 98%、`router.js` 69% → 99%。
  - 依 #277 的經驗，開 PR 前先以改動原始碼驗證：19 個改動中 17 個會讓測試失敗；剩下兩個無法觀察（「至少 5 筆」被 70% 有效日涵蓋、文字中的 `>` 本來就會被序列化為 `&gt;`），刪掉了對應的空測試。
  - 審查（#278）：Codex 沒有問題。獨立 review 找到兩個 P2：載入中提示只測了慢的情況（拿掉 `clearTimeout` 時，200 ms 內載完的頁面與失敗後的首頁會被提示蓋掉，沒有測試失敗）；輸入框裡的滑動因起點被重設為 (0, 0) 而變成垂直移動，防護沒有真的被測到。已補上快速載入與失敗後計時器的檢查、改從畫面上方開始滑動，並補上 P3（同一頁不滑動、不在順序裡的頁面、☆、兩列標示、🔒、`&` 的跳脫）；11 個改動都會讓測試失敗。沒做的 P3：門檻的精確邊界（各條件已能單獨擋下解鎖）、亂序執行時第一個測試依賴「第一次轉場」。

- [x] **TEST-004** 補上幾乎沒有單元測試的小模組（擁有者 2026-11-26：「不用停 能做就一直做吧」）
  - 起因：以 `vitest --coverage` 量 `pwa/js` 全部模組（原本設定只量 3 個檔案）：行覆蓋率 80.3%，`theme.js` 8%、`platform/share.js` 6%、`platform/badge.js` 與 `swUpdate.js` 0%、`authFlow.js` 42%。
  - 只加測試、不改 app 程式：`theme.test.js`（主題與外觀、Pro 每日隨機主題、背景圖、Liquid Glass 反光：指標緩動、傾斜上限、觸控螢幕 280 ms、iOS Chrome 靜止、iOS 動作權限只問一次）、`platformShareBadge.test.js`（分享與剪貼簿退回、App 徽章、本機提醒）、`swUpdate.test.js`（註冊、首次安裝不顯示、每次更新一個重新整理橫幅）、`authFlowForms.test.js`（登入／註冊訊息、密碼顯示、Google 登入錯誤、忘記密碼與設定新密碼的對話框）。四個模組分別到 99%／100%／100%／100%，`authFlow.js` 到 100%；整體行覆蓋率 82.4%。
  - 審查（#277）：Codex 沒有問題。獨立 review 以改動原始碼驗證測試，找到兩個 P2：SW 註冊失敗的測試在拿掉 `.catch` 後仍會通過（`vi.fn` 自己處理了回傳的 promise，改用一般函式）；BUG-120 原本寫成「顯示誤導的訊息」，實際上訊息被切換分頁隱藏、完全不出現（已更正，測試也改為固定現況）。P3：節流、缺少感測值、提醒延遲、橫幅插在最前面等斷言補強到改動原始碼會失敗。
  - `vitest.config.js` 的 coverage 改為 `pwa/js/**/*.js`，`npm run test:coverage` 才看得到全部模組。
  - 發現：BUG-120（註冊後自動登入失敗時畫面沒有任何說明，開啟「確認 email」後每個新註冊都會遇到；需核准，見 Next）。

- [x] **PS-260** 主題套組：10 個 3D 角色（男女各 5）與各自的房間、裝飾（使用者 2026-11-25：「接著請新增3D角色 需要至少10個不同的風格 男女各半 背景等物件也要有對應角色的整套設計 每次完成一個段落就請開PR 並merge避免任務中斷 也讓任何agent可以接手繼續開發 然後持續繼續開發 不用特別問我除非必要」）
  - 完成（2026-11-26，A–E 共 7 個 PR，v1.41.33–v1.42.0）。提案與分段：[`docs/ps-260-character-sets-proposal.md`](docs/ps-260-character-sets-proposal.md)。每段一個 PR，合併後才開始下一段；任何 agent 都可以從下一個未完成的段落接手。
  - 十套：太空人／武士／偵探／主廚／探險家（男），魔法師／偶像／園藝師／駭客／海洋學家（女）；房間與裝飾見提案 §2，id 在 `art-pipeline/ps260-sets/sets_catalog.py`。
  - [x] **PS-260A** 提案＋10 個主角的 Q 版 sprite（120 張）、`outputs.json`、預覽、測試（runtime 還不使用）。完成（#269，v1.41.33）：每張 15.6–22.5 KB、共 2.25 MB；試渲染時修正了胸前印花透出、圍裙浮空、鞋底讓人站低、帽尖碰到畫布上緣。
  - [x] **PS-260B** 10 套房間風格（Q 版＋像素版，白天＋夜晚）＋各自的窗外；B1（男性 5 套）、B2（女性 5 套）各一個 PR
    - [x] **PS-260B1** 太空站、劍道場、偵探事務所、法式廚房、叢林營地（#271，v1.41.35）。風格可指定自己的窗外（`scene.build_exterior`：星空＋行星、竹林、叢林、花園、海底，或換顏色的城市），植物與星點沿著穿過窗戶的視線放置，地面是只在窗內看得到的楔形；`render_pack.py --prop-boxes` 只渲染家具會留下的框，每個光線從約 30 分鐘降到約 10 分鐘。家具裁切掉的像素最多 140（限制 400）。#271 的獨立 review 指出只渲染框時看不到框外：`process_pack.py` 現在會讓碰到渲染外圈邊緣的家具失敗，改用整張重新渲染（書架在 4 張中如此）；整張渲染顯示劍道場白天書架的淡影子在框外有 617 像素，所以劍道場的 `shadow_floor` 改為 72（降到 66）。
    - [x] **PS-260B2** 魔法塔、偶像練習室、溫室花房、賽博空間、海底研究站（v1.41.36）。沒有家具碰到渲染外圈邊緣，裁切掉的像素最多 120。
  - [x] **PS-260C** 裝飾（Q 版＋像素版，白天＋夜晚）：每個房間的 6 件 PS-250F 裝飾＋該套組自己的 2 件（20 件新模型）
    - [x] **PS-260C1** 男性 5 套房間的裝飾（太空站、劍道場、偵探事務所、法式廚房、叢林營地）（v1.41.37）。10 件新模型在 `ps244-blender/decor_sets.py`，兩個固定位置（後牆、右前方地板 z 32；後牆的 z 在 #274 review 改為 23，畫在書架之上，避免書架夜晚的淡影子蓋在上面）；夜晚會發光的部分只用自發光材質，不改共用的房間渲染。6 件 PS-250F 裝飾以 `--decor-boxes` 渲染、裁到預設框，裁掉的像素最多 757（法式廚房夜晚懶骨頭的淡影子尾端，與 PS-250F2 夜貓工作室落地燈的 729 同類；上限 1000）。`previews/sets/` 有每套主角＋房間＋裝飾的完整預覽。
    - [x] **PS-260C2** 女性 5 套房間的裝飾（魔法塔、偶像練習室、溫室花房、賽博空間、海底研究站）（v1.41.38）。#273 review 修正的魔藥瓶與水族箱在渲染前就修好；魔法塔的 2 件在修正後重新渲染。溫室花房夜晚懶骨頭的淡影子在框外裁掉 1092 像素，溫室的 `shadow_floor` 改為 72（降到 454，與劍道場相同做法），並用原本的渲染重新處理溫室房間的家具；最大的裁切是賽博空間夜晚落地燈的 908（燈桿影子落在框外近黑的牆上，看不到；PS-250F2 夜貓工作室的落地燈同樣是 729）。
  - [x] **PS-260D** 10 個主角的像素版（選擇介面列出的都要有兩種畫風，所以在 runtime 之前）。完成（#270，v1.41.34）：不需要渲染，由 PS-260A 的 sprite 依 PS-250D 的方式縮小（92 格、32 色、1 px 描邊、×4），每張 5.7–8.2 KB、共 829 KB；只依賴 A，所以比 B、C 先合併。`pixel-outputs.json` 記錄每張的 Q 版來源與 SHA-256，Q 版重新渲染而沒有重做像素版時測試會失敗。
  - [x] **PS-260E** runtime（v1.42.0）：10 個主角加入角色目錄（`characterCatalog.js`），10 個房間加入房間清單（`SET_ROOM_IDS`），每個房間的 2 件裝飾只在自己的房間出現（`ROOM_DECORATIONS`，白天與夜晚的位置取自 `decor-placements.json`，測試會比對；載入失敗時不畫，因為預設房間沒有對應的裝飾）。Edit Mode 新增「主題套組」：一鍵換成該套的主角與房間、並顯示房間的 2 件裝飾，畫風與 Companion 不變；主角、房間、裝飾也都能分開選，列在 PS-250 的選項之後。有自己窗外的房間不疊 PS-251B 的晨昏窗景。房間縮圖由 `thumbnails.py` 產生（Q 版與像素版各 10 張）。都不預先快取，第一次顯示時才下載。
    - PS-243 延後載入 JS 預算：擁有者 2026-11-26 同意放寬 4 KB（304 → 308 KB，315,392 B）。提案 §4 建議把套組資料放 JSON，實作時套組資料與介面共 +2,799 B gzip，放在 JS 模組裡不需要另外下載、離線也能用，所以沒有拆成 JSON；目前 313,662 B，剩 1,730 B，下一個加大個人空間 JS 的任務仍要先看預算。
  - 實機上看 10 套的效果（iPhone、Android、主畫面 PWA）屬於 PS-243 的人工驗收。
  - [x] **PS-260F** 離線時的套組房間（#275 獨立 review 的兩個 P3，使用者 2026-11-26：「好啊 繼續做」）（v1.42.1）：首頁與個人空間的圖片在套組房間載入失敗、退回預設房間時，早晨／傍晚會顯示預設房間的城市窗景（先放隱藏、不下載的窗景圖），並拿掉套組的專屬裝飾（`data-room-only`），與 Pixi 場景相同；Edit Mode 裡沒有預設圖的專屬裝飾在離線時顯示空的虛線框（`data-unavailable`，以 CSS `content` 換掉瀏覽器的破圖示），外觀說明補上一句。PS-243 延後載入 JS 313,946 / 315,392 B，剩 1,446 B。

- [x] **UI-204** 主畫面圖示改為「上升的軌道」（擁有者 2026-11-21：「都有開PR 並merge吧」；v1.41.32）
  - 起因：以 iPhone 圖示 skill（yoyoCadence/Iphone_Icon_AI-skill）實測 Orbit。UI-203 的圖示在 29pt 辨識度沒問題，但「紫色行星加環」是任何叫 Orbit 的 app 都能用的圖（VPN、瀏覽器、天文），看不出 Orbit 的核心「成長」；三顆星在 40pt 以下只是雜點，環伸到圖示的 88%。
  - 新設計：同樣的紫金配色、行星與軌道；軌道改成越轉越寬、越亮的螺旋（1.75 圈，看得到內圈細、外圈粗兩段），代表每天的努力累積成軌跡；末端的金色衛星是光源，從右上照亮行星。三輪修改：只看得到一圈、成長讀不出來且分段有條紋 → 1.75 圈、不透明的分段；環的影子在行星上像土星的條紋 → 淡化；亮芯太早開始、左下搶過金色衛星 → 只在最後四分之一。
  - 來源：`art-pipeline/app-icon/generate-icon.mjs` 產生 `icon.svg`（SVG 無法沿著路徑改變線寬與顏色，所以把螺旋取樣成互相重疊一個取樣點的不透明小多邊形；後半段畫在行星之前，前半段之後）。輸出與審過的設計逐位元組相同（只有開頭註解不同）。`npm run icons` 照舊產生 `pwa/assets/` 的四個 PNG。
  - 測試：`tests/e2e/ui203-app-icon.test.js` 通過（滿版 reach 0.469、maskable 0.375）。第一版因為金色衛星的光暈尾端超出範圍而**失敗**（maskable 0.419 > 0.4），改小光暈後通過——這個測試擋住了一個肉眼看不出的問題。
  - `npm run bump`：service worker 的快取名稱跟著改（圖片是 cache-first，不換快取名稱的話已安裝的使用者會一直拿到舊 PNG）。iPhone 仍要刪掉主畫面圖示、重新加入才會換新圖示（同 UI-203）。
  - 取捨（已在 PR 說明）：意義與動態感更強；小尺寸下兩版都仍讀作「有環的行星」，品牌辨識沿用；行星變小、被遮住得比較多。

- [x] **HW-112D 後續 2** 訪客設定不沿用帳號的快取資料；#265 審查 P3（v1.41.31）
  - 帳號 A 的遠端讀取失敗、這台裝置快取的是另一個帳號 B 的使用者時，登入畫面可選「以遊客身分繼續」；B 沒有任務就會開訪客設定，之前沿用 B 的 id、名字、經驗值，把訪客寫進 B（`upsertProfile` 因登入的不是 B 而留下待同步，B 之後登入時就把訪客名字送上去）。現在訪客設定若發現快取的使用者是這台裝置同步過的帳號（storage.js 在帳號第一次遠端讀取成功時寫入的 session sync cutover 標記 `yoyo_sessionSyncCutover:v1.21:<帳號>`），就以全新的訪客資料開始。遊客自己的本機使用者沒有這個標記，照舊沿用（含 PRO-014Q Q6 重建 profile 的情境）。標記的 key 不從 storage.js 匯入（INFRA-105），測試比對兩邊一致。
  - 未處理（既有，不急）：同樣情境下 B 的快取**有**任務時，「以遊客身分繼續」會直接用 B 的本機資料進入訪客模式（顯示與寫入 B 的快取，雲端寫入因登入帳號不同而被擋下、留待 B 登入時同步）。要改需決定此時訪客應看到什麼（空白開始或拒絕），先記錄。
  - 審查（#266）：Codex 沒有問題；獨立審查沒有 P1／P2。P3 #1 於 #267 補測試：登入帳號自己的設定（有同步標記）照舊沿用自己的資料（拿掉「只限訪客」的條件時，帳號的經驗值、連續天數與試用會被歸零並同步上去，這個測試會失敗）。未改（記錄）：(2) `storage.getSessions()` 不依擁有者過濾，上述情境中新的訪客仍會看到 B 快取的紀錄、精力與今日計畫（只在本機，不會上傳），與「B 的快取有任務」一併待決定；(3) 另一個分頁存入的是訪客（不是帳號）時，重新載入後仍顯示「另一個分頁切換了帳號」（僅文字）。
  - #265 審查 P3：頭像讀取（`FileReader.onload`）也檢查是否仍是最新一次開啟的設定；訪客設定重新載入時，只有已儲存的是一個帳號才設「切換了帳號」的提示旗標（另一個分頁登出時不設）。
  - 測試（`appBootSequence`）：快取同步過的帳號 → 新的訪客 id、經驗值歸零；遊客自己的使用者 → 沿用；標記 key 與 storage.js 一致；讀取中重新開啟 → 預覽維持預設；另一個分頁登出 → 重新載入但不設提示。三項修正各自移除時對應測試都會失敗。

- [x] **HW-112D 後續** 初次設定畫面與另一個分頁、backfill 後補傳照片（v1.41.29；#262 第二輪審查 P3 #2、#263 獨立審查 P3 #1）
  - `showSetup()` 每次開啟都在同一個表單上多加一組 listener（頭像按鈕、頭像檔案、送出），較早的仍會執行並用它開啟時的帳號再存一次。現在以 `_setupGeneration` 計數，只有最新一次開啟的 listener 動作。
  - 訪客設定（`ownerId` 為 null）開啟時記下已儲存的帳號；送出時若已改變（另一個分頁登入了帳號、這個分頁沒收到 SIGNED_IN），改為重新載入，不寫入：之前會沿用那個帳號的 id，把訪客名字上傳到它的 profile，`saveTasks(預設任務, 那個帳號)` 也會把它快取的任務當成刪除送出。登入帳號的設定沿用原本的 `_currentSession` 比對。
  - `_loadRemote()`：`loadFromRemote` 的 backfill insert 在它 resolve 之後才完成；完成後再 `flushProofSync()` 一次，讓等待紀錄的照片（HW-112D (c) 的重新上傳清單）立刻排入上傳。讀取失敗時不送。
  - 審查（#264）：Codex 沒有問題；獨立審查沒有 P1／P2。P3 於 #265 改：額外的 flush 只在真的有 backfill 時才送（`Promise.all([])` 是 `[]`，原本每次同步都多送一次）；訪客設定重新載入前設定提示旗標；重新開啟設定時清掉頭像預覽與檔案欄位；`_setupGeneration` 移到 `showSetup()` 的 JSDoc 上方。
  - ~~待辦（#264 審查 P3 #5）：訪客設定沿用另一個帳號快取的 id~~ 已於 #266 完成（v1.41.31，見 Done）。
  - 測試（`appBootSequence`）：兩次開啟只存一次、不重新載入；訪客設定開著時另一個分頁存入帳號 → 重新載入、不存使用者也不存任務；backfill 完成後再 flush 一次。三項各自移除時對應測試都會失敗。

- [x] **HW-112D (c)** 清理雲端遺留的佐證照片（v1.41.28；擁有者 2026-11-19 同意「安全地做」）
  - 來源：刪除紀錄時，雲端照片的刪除排不進佇列（儲存空間滿），或離線時關掉 app，照片就留在雲端。
  - 新模組 `platform/proofSweep.js`（SHELL）：`sweepOrphanCloudProofs(ownerId, { sessions })`，在 `app.js` 的 `_loadRemote()` 成功、`flushProofSync()` 之後執行，`sessions` 是這個帳號在這台裝置已儲存的紀錄（已儲存的使用者不是這個帳號時不跑）。每個帳號在這台裝置每 7 天最多一次（`orbit_proofsweep_at:<帳號>`，完成才記錄）。
  - 刪除條件（全部成立）：物件滿 30 天（別台裝置剛上傳、紀錄還在路上的照片很新）；這台裝置沒有這個紀錄、也不在上傳佇列；伺服器 `sessions` 沒有這個 id（`select('id').eq('user_id', 帳號).in('id', 每批 100 個)`）。物件時間讀不到的不刪。
  - 安全檢查：伺服器查詢同時帶入最多 5 個這台裝置「已確認在伺服器」的紀錄（沒有 `_syncPending`、不在待同步名單）當作證明，任何一個沒回來就停止（RLS 或 token 問題讓查詢靜默回傳空集合時，不會把每張照片都當成孤兒）；沒有可用的證明就不跑。查詢、列出、刪除任何錯誤都停止且不記錄；刪除前再確認登入的帳號；每次最多刪 100 張。
  - 重新上傳（#263 Codex P2）：裝置 A 的照片已上傳、紀錄卻一直沒上伺服器時，B 的清理可能在 30 天後刪掉雲端那份；A 的紀錄之後同步時原本不會重新上傳照片，之後 A 登出就會清掉最後一份。現在 `proofSync` 每次 flush 記下「紀錄還沒上伺服器、本機有照片」的 id（`orbit_proofsync_recheck:<帳號>`，在 `sessionsNotOnServer.js`），紀錄確認上伺服器後重新排入上傳（雲端還在就是「已存在」）；在那之前 `uploadedLocalProofIds()`／`unsureProofPhotos()` 都把它算成還在等，登出與「清除這台裝置」都會保留本機這份。上傳佇列寫入失敗時清單保留，下次再試。
  - 審查（#263 第三輪）：Codex P2（與獨立審查 P3 #2 相同）已改：儲存空間滿、重新上傳清單寫不進去時，紀錄還沒上伺服器的照片這一輪不上傳、留在上傳佇列（之前會照樣上傳並移出佇列，之後就沒有任何記號會再上傳）。補測試：寫入清單失敗時不上傳、空間恢復後先記錄再上傳；`unsureProofPhotos()` 把清單中的照片算成還在等。
  - e2e `hw112d-proof-sweep` 在本機平行連跑時偶發失敗，原因都在測試替身：(1) 測試在攔截到 DELETE 時就檢查「已清理」記號，但記號在刪除回應回來後才寫，改成輪詢；(2) 替身的伺服器沒有 profile／任務，SIGNED_IN 路徑先跑時會進設定畫面，補上 profile 與任務；(3) 「一週內不再清理」改由單元測試涵蓋，移除 e2e 中的重新載入。修正後平行連跑 24 次全過。
  - 獨立審查第三輪沒有 P1／P2；未改的 P3（不急，記在這裡）：(1) ~~backfill 完成後再 flush 一次~~ 已於 #264 完成；(2) v1.41.27 以前的裝置登出時會丟掉紀錄未上伺服器的本機照片，若那筆紀錄 30 天後才到，新裝置的清理可能刪掉雲端那份；(3) 帳號在這台裝置第一次 `loadFromRemote` 成功之前（session sync cutover 未完成），沒有旗標也不在待同步名單的紀錄不會被記入重新上傳清單；(4) 同一台裝置兩個分頁可能同時清理（重複刪除無害）。
  - 獨立審查（#263）：P1 與 Codex P2 是同一條路徑（照片先上傳、紀錄晚到超過 30 天），已由上一點的重新上傳解決。P3 一併改：每一批伺服器查詢都帶證明紀錄（之前只有第一批，token 中途變成匿名時後面的批次會被當成「沒有紀錄」）；補「列出後到刪除前登入帳號改變」的測試。未改（不急）：30 天以裝置時鐘計算（時鐘調快會提早清理，但有重新上傳與本機保留，不會遺失）；同一台裝置兩個分頁可能同時清理（重複刪除無害）。
  - `app.js` 以 `_sweepOrphanProofs()` 呼叫，永不拋錯（在每次同步的背景執行；#263 第一次 CI：`appBootSequence` 的 storage 替身沒有 `getSessions`，造成未處理的 rejection，本機只看了測試數字而漏看 vitest 另外列出的 Errors；之後本機驗證一律看 vitest 的結束碼）。
  - 補強：新模組 `platform/sessionsNotOnServer.js` 讀 storage.js 的待同步紀錄（`yoyo_sessionSyncPending:<帳號>`）與 `_syncPending` 旗標。`uploadedLocalProofIds()` 不再把「紀錄還沒上伺服器」的照片算成確定已上傳，所以登出與「清除這台裝置的佐證照片」會把它留在本機——雲端那份可能因為沒有紀錄而被清掉，本機這份就不會是最後一份被刪。`unsureProofPhotos()`（(a)）也把它們算成「還在等」。
  - 測試：`tests/unit/proofSweep.test.js`（只刪舊孤兒、保留本機／伺服器有／太新／在佇列／待同步／時間不明／非 UUID；查不到證明紀錄或沒有證明就不刪；錯誤、別的帳號、沒有 sessions 都不刪也不記錄；每週一次；每次 100 張、每批查詢 100 個；`sessionsNotOnServer` 讀真的 storage.js 寫的待同步名單）、`proofLocal`／`proofUnsure` 補強的案例、e2e `hw112d-proof-sweep.test.js`（真的 supabase-js：列出、REST 查詢的參數、只刪孤兒的那一張、一週內不再跑）。移除證明檢查或補強，對應的測試都會失敗。

- [x] **HW-112D (b)** 跨分頁切換帳號時，舊分頁不再把資料寫到另一個帳號底下（v1.41.27；擁有者 2026-11-19 同意）
  - 問題：分頁 1 的記憶體是帳號 A，分頁 2 登出並登入 B（localStorage 換成 B）。分頁 1 完成一筆紀錄時，`saveSessions()` 以已儲存的使用者（B）為擁有者，把 A 的整份紀錄寫進 B 的快取，並把新紀錄以 B 的身分 insert 到伺服器（auth 在分頁間共用，所以會成功）。任務、精力同理。
  - `storage.saveSessions()`／`saveTasks()`／`saveEnergy()` 多一個參數：呼叫端記憶體中資料的擁有者（`state.user?.id ?? null`）。與已儲存的使用者不同就不寫入（回傳 false、`console.warn`），並發出 `orbit:stored-account-changed` 事件，`app.js` 顯示「另一個分頁已切換帳號，這裡的變更沒有儲存；請重新整理這個頁面」（3 秒內只一次）。不傳參數的舊呼叫維持原行為（新舊版本混用時不會壞）。事件名稱不從 storage.js 匯出（INFRA-105），兩邊各寫一次，測試確認一致。
  - `sessionFlow.js`：`commitSession()` 與撤銷（`window.deleteSession`）在改動任何狀態之前先比對 `storage.getUser()?.id` 與 `state.user?.id`，不同就提示並停止（撤銷不會先寫刪除紀錄）；之後的寫入也帶擁有者。其他呼叫端（`dayCycle.js` 的精力重設、`home.js` 拖曳排序、`settings.js` 任務編輯／刪除、`app.js` 初次設定）都帶擁有者。
  - 舊分頁重新載入（#262 獨立審查 P2）：`saveUser()`／`saveUserLocal()` 等寫入目前使用者的地方很多（早晨視窗、專注時長、設定開關、每週獎勵、連續天數保護…），舊分頁一呼叫就把 A 寫回成已儲存的帳號，之後的保護都失效。所以 `app.js` 在知道「已儲存的帳號被別的分頁換成另一個帳號」時直接重新載入：跨分頁的 `storage` 事件（`yoyo_user` 寫入另一個帳號；被移除＝登出，交給 SIGNED_OUT）、從 bfcache 回來（`pageshow` persisted）、回到前景（`visibilitychange`）。這個視窗自己正在切換（它的 session 已經是已儲存的帳號）時不動。重新載入後提示「另一個分頁切換了帳號，這裡已重新載入」。storage 層的拒絕寫入保留，作為事件送達前那一瞬間的保險。
  - 第二輪獨立審查（#262，92aaf47）沒有 P1／P2（沒有重新載入迴圈、自己切換帳號時不誤觸發、e2e 連跑 16 次穩定）。P3 #1（重新載入後若停在登入畫面，提示旗標會留到之後的登入）於 #263 改成頁面一啟動就讀取並清除。P3 #2 另列待辦（見 Next 的 HW-112D）。
  - 審查（#262）：獨立審查 P2 見上一點；P3 一併改：拒絕時的提示改成「這筆變更沒有儲存」、`submitFocusResult()` 的提前返回補單元測試；未改：初次設定時 `saveUser()` 因儲存空間滿而失敗，接著的 `saveTasks()` 會顯示「另一個分頁已切換帳號」的提示（不正確但罕見）。Codex P2 已改：`completeInstant()` 與 `submitFocusResult()` 在 `commitSession()` 回傳 false 時不再跳出拍佐證照片的畫面（原本會替沒有儲存的紀錄存一張沒有紀錄可找的照片）。
  - 測試：`tests/unit/storageOwnerGuard.test.js`（真的 storage.js、Supabase 以 B 登入的 spy：A 的分頁寫入不寫、不 insert、發事件；B 自己、訪客、沒帶參數照舊）、`sessionFlowSettlement`（完成與撤銷都不改狀態、不寫入、提示）、e2e `hw112d-stale-account-tab.test.js`（兩個分頁：另一個分頁換帳號後完成任務 → 提示、不寫入；重新整理後顯示新帳號）。

- [x] **HW-112D (a)** 「檢查同步」分開說明無法確認已上傳的佐證照片（v1.41.26；擁有者 2026-11-19 同意）
  - 新模組 `platform/proofUnsure.js`（SHELL）：`unsureProofPhotos(ownerId, sessions)` 列出這個帳號在這台裝置、同步已處理過（backfill 完成、不在上傳佇列）卻不是「確定已上傳」的照片：舊版本的 PNG／WebP（重新編碼後可能有送、可能沒有，無法確認）、超過 200 KB（被略過）、紀錄 id 不是 UUID（永遠不會上傳）。backfill 之前不列（照片還在等）。只用既有的 export（INFRA-105）；backfill 標記的 key 與 `proofLocal.js` 一樣自行讀取，測試用真的 `proofSync.js` 寫的標記確認一致。
  - `statusBarSyncCheckText()` 多一個 `unsure` 數量（`photos` 仍是全部未確定上傳的張數，`unsure` 不會超過它）：在等的照片照舊說「還沒上傳」；這些另外說「無法確認已上傳（多半是舊版本存的，再等也不會改變）」並說明怎麼另存。只剩這些時 `ok` 仍是 false，文字說存好就可以移除舊圖示。新舊版本混用時（舊的 `app.js` 不傳 `unsure`）行為與之前一樣。
  - 新模組 `ui/proofKeepSheet.js`（SHELL）：結果下方的「查看這 N 張照片」打開一個列出這些照片的畫面（DOM 建立，任務名稱只當文字），長按照片即可存到相簿或分享；免費版的完成紀錄只顯示 30 天，較舊的照片只能從這裡看到。帶 `.proof-lightbox` class，Orbit Window 會在它下面暫停（PS-249A）；Escape 或「完成」關閉並把焦點還給按鈕。
  - 測試：`tests/unit/proofUnsure.test.js`（真的 proofSync／proofLocal；文字；畫面）、`ps249aOverlayCover` 認得新的全螢幕規則、e2e `bug118-status-bar-notice` 新增一個（舊 PNG＋一張在等的 JPEG：分開的文字、只有一個按鈕、畫面中的照片沒有被 `pointer-events`／`-webkit-touch-callout` 擋住、焦點）；320px 截圖確認。
  - 可再評估（不急）：重新編碼後成功送出的 PNG 其實已在雲端，若 `proofSync` 記下「已確認送出」就能不列；目前照實說「無法確認」，建議另存，較安全。
  - 審查（#261）：Codex P2 已改：照片畫面只列這些照片，其他資料可能還在等，所以不再說「存好就可以移除舊圖示」，改成存好後再按一次「檢查同步」，其他資料也同步了才移除。
  - 審查（#261 第二輪）：Codex P2 已改：登出（含其他分頁登出經由 SIGNED_OUT）或換成另一個帳號時，關閉開著的照片畫面與原本的佐證照片燈箱（掛在 `<body>`，原本會留在登入畫面上方）；`proofKeepSheet.js` 多一個 `closeProofKeepSheet()`（新模組，app.js 匯入不違反 INFRA-105）。
  - 獨立審查（#261）沒有 P1／P2；P3 一併改：按鈕張數取自文字（`statusBarSyncCheckText()` 回傳 `unsure`，新舊版本混用時舊模組不回傳就不出按鈕）；照片畫面 z-index 1100，蓋過「新版本已就緒」橫幅（1000，舊圖示更新後會看到），低於大型揭曉（1200）與導覽、登入；按下時帳號已變就重新檢查；全螢幕照片（燈箱或這個畫面）開著時左右滑不換頁；文字改成「例如舊版本存的或太大的照片」。未改（P3，不急）：焦點鎖定在畫面內、Escape 只關最上層的對話框；登入但沒有已儲存 session 時存的照片在 backfill 之後不會排入上傳（可再評估重新排入）。
  - **擁有者驗收（真機）**：iPhone 主畫面 app 裡長按照片，確認選單出現「儲存到照片」或「分享」（`data:` 圖片在 standalone 模式的長按選單 agent 無法驗證；不出現的話改用 `navigator.share` 傳檔案）。

- [x] **PRO-014F2 F2A** 個人空間的 Pro 呈現（v1.41.25；擁有者 2026-11-19 決定 §9 全部照建議；提案 `docs/pro-014f2-personal-space-pro-proposal.md`）
  - 新模組 `personalSpace/v2/proPresence.js`（SHELL）：以 `getProRolloverStatus()` 判斷（`pro`／`not-pro`／`unknown`），只有已知的 Pro 顯示標記；`unknown` 不顯示、不說話、不記錄。每個帳號在這台裝置記 `orbit_ps_pro_seen:<帳號>` = `{ status, changedOn }`：第一次記錄不說話；已知狀態改變時記下當天，`status === 'pro'` 且是當天才說那句話；結束時不說。
  - 首頁（`home.js`）與個人空間頁算好後當成 `coreState.proPresence` 傳給 `buildPersonalSpaceV2Snapshot()`（builder 維持純函式）；只換夥伴的 `dialogueKey`（狀態、動畫、world action 不變），有揭曉事件時不換。快照與 view model 帶出 `proMark`。
  - 標記：個人空間狀態列「等級」之後（`.personal-space-v2-hud-stats .personal-space-v2-pro`，比狀態列的 span 規則更具體，主色背景＋`--on-primary` 文字）；首頁 Orbit Window 標題列 Momentum 旁（只在 `home-window`，個人空間頁不重複）。文案 `companion.pro.started` 加進夥伴文案表與 telemetry 的 allowlist。
  - 純顯示：沒有新增任何有價值的資料或操作，不需要 server 端強制；新的 Pro 判斷位置 3 處（狀態列標記、Orbit Window 標記、夥伴的話），都用 `getProRolloverStatus()`，沒有新增 `storage.isProUser()` 呼叫。
  - 測試：`tests/unit/pro014f2PersonalSpacePro.test.js`（8）、e2e `pro014f2-personal-space-pro.test.js`（首頁與狀態列的標記與實際計算樣式、個人空間頁只出現一次、當天的那句話、狀態不確定時都不顯示）；320px 截圖確認。
  - 注意：PS-243 的延遲載入預算（V2 ＋ Pixi，304 KB gzip）剩約 0.5 KB；之後在個人空間加程式前要先處理預算（另列任務或擁有者調整）。
  - 審查（#260）：Codex 沒有問題；獨立審查沒有 P1／P2。P3 於 #261 一併改：成為 Pro 那天不蓋過使用者自己的目標提醒（AI-203B 的 `remind` 狀態，提案 §5.2 原本只說換台詞）；首頁標記加 `role="img"`（有 `aria-label` 的 span 需要 role）；個人空間頁以 `options.effectiveDate` 判斷當天；CHANGELOG 改成「從非 Pro 變成 Pro 的那一天」（第一次記錄不說話，重新訂閱會再說一次）；INFRA-116 的 Done 說明改成現在的 TCP 等待；`run.sh` 的拒絕訊息只給第一個原因（換行不會進到訊息）。

- [x] **INFRA-116** CI 跑資料庫測試（擁有者 2026-11-19 核准）
  - `ci.yml` 新增 `database` job：PostgreSQL 16 官方容器（已含 PGDG apt，裝上 `postgresql-16-pgtap`），把 repo 唯讀掛進容器，以 `postgres` 使用者在容器內執行 `tests/database/run.sh`（`REQUIRE_PGTAP=1`，走本機 socket）。不接觸 production、不需要任何 secret；容器的第一次啟動會先開只聽 socket 的暫時 server 再重啟，所以用 TCP 的 `pg_isready -h 127.0.0.1` 等到正式的 server（#260 起）。
  - 一併處理 #252 第二輪審查的 P3：`run.sh` 拒絕任何可能連到別處的設定——`PGHOST` 逗號清單中任何一個非本機主機、非 loopback 的 `PGHOSTADDR`、或設了 `PGSERVICE`（`ORBIT_DB_TEST_ALLOW_REMOTE=1` 才略過）。本機以 `REQUIRE_PGTAP=1` 跑 10 份全部通過；四種遠端設定都以結束碼 2 拒絕。
  - `tests/database/README.md` 更新。
  - 審查（#259）：Codex 沒有問題；獨立審查沒有 P1／P2（在本機 Docker 照 CI 步驟以真的 `postgres:16` 跑過，10 份通過、失敗時結束碼正確傳回）。CI 上實際跑了 10 份（含 pgTAP 的 pro014d）。P3 於 #260 一併改：等待改用 TCP 的 `pg_isready`（第一次啟動的暫時 server 只聽 socket），等不到時印出容器 log；pgTAP 以 `--no-install-recommends` 安裝並重試三次；checkout 不保留憑證（repo 掛進容器）；`run.sh` 拒絕含換行的 `PGHOST`／`PGHOSTADDR`（`read` 會在換行處停下，藏住後面的主機）。

- [x] **HW-112C2b** 佐證照片：設定頁、登出、狀態列文字（v1.41.24）
  - 新模組 `pwa/js/platform/proofLocal.js`（SHELL；INFRA-105：`proofSync.js`、`proofCloud.js` 都已發佈，新的 export 放在新模組；`settings.js`、`app.js` 只 import 它的新 export，它只 import 既有的 export）：
    - 「確定已上傳」：這個帳號的照片已補傳過（backfill 標記，與 `proofSync.js` 寫的同一個 key，測試以真的 `proofSync.js` 確認）、不在待傳清單、是 bucket 會照原樣收的 JPEG（≤ 200 KB；舊版的 PNG／WebP 上傳時要重新編碼，不能確定成功，不算）、session id 合乎 bucket 規則。不確定的都保留。
    - 登出（§9.5 B）：`handleSignOut()` 在清掉 `state.sessions` 之前，移除這個帳號「確定已上傳」的本機照片與下載的照片；其他保留。
    - 設定頁（§9.4 A）：登入時「清除這台裝置的佐證照片（N 張）」只清這個帳號的本機照片（待傳的保留）與下載的照片，成就照片的選擇保留（之後從雲端顯示）；「刪除所有佐證照片（包括雲端）」問兩次，先刪本機（包括待傳的）、選擇與下載的照片，等正在跑的同步結束（沒有本機照片，待傳清單只會清空，不會再上傳），再以 `list()` 分頁（每頁 100）列出這個帳號的雲端資料夾、每 100 個一批刪除（也會刪掉沒有對應紀錄的檔案）；失敗時提示連線後再按一次。訪客只有「刪除佐證照片」（沒有雲端備份，問一次並說明無法復原），並清掉成就照片的選擇。其他帳號的照片不動（原本的按鈕會刪掉這台裝置上所有帳號的照片與選擇）。
  - `statusBarNotice.js`（BUG-118）：登入時的警告改成「還沒上傳的佐證照片…只存在舊圖示」；「檢查同步」把還沒上傳的照片（`pendingProofUploads`）也算進去，都清空才說可以移除。
  - 審查（#257，a3f8293）：Codex P1——「清除這台裝置」只跳過待傳清單裡的照片，但第一次以新版離線開啟時補傳還沒跑、清單是空的，會刪掉唯一的那份；`proofSaved` 存不進清單時也一樣 → 改用和登出相同的「確定已上傳」判斷（補傳已完成、不在待傳清單、照原樣可收的 JPEG），其他都保留並在提示中說明。Codex P2——只有下載副本的裝置，按鈕因本機張數為 0 被停用 → 登入時按鈕一直可用（清下載的副本）。e2e 加上「補傳還沒跑時清除，兩張都保留」。
  - 審查（#257，獨立審查 c59ba6c）：沒有 P1（a3f8293 的 P1 已由 c59ba6c 修好）；P2 (1)「刪除所有」等雲端時使用者換頁，完成後把設定頁畫在別的頁面上（router 共用 `#content`）→ 只在設定頁還在時重畫；(2) 「檢查同步」只算待傳清單，補傳還沒跑、存不進清單、或無法照原樣上傳的照片會被說成「都上傳了」→ 改算「這個帳號在這台裝置、還沒確定上傳的照片」（`photosNotSurelyUploaded`）；(3)「刪除所有」的確認說「其他裝置也不會再看到」不正確 → 改成說明其他裝置已下載的副本留到那台裝置登出或清除、那裡還沒上傳的仍會上傳。P3 一併改：刪除雲端不再等 IndexedDB 清除（iOS 可能卡住）；被當成訪客的帳號（儲存的 session 不見了）清除時仍保留待傳的照片；登出時以這個分頁的 `state.user` 配這個分頁的紀錄。e2e 加上「刪除中換頁不會被蓋回設定頁」；新測試在前一版都會失敗。
  - 審查（#257，獨立審查 248b5b9）：沒有 P1／P2。P3 一併改：「刪除所有」雲端刪完後再清一次下載副本（期間顯示的列可能又從雲端抓回來）；「檢查同步」用的紀錄清單只在屬於同一個帳號時採用。留下的 P3：永遠上傳不了的照片（轉檔失敗的 PNG、超過 200 KB）會讓「檢查同步」一直說還有照片沒上傳，提示文字可另外說明（不急）。
  - 審查（#257，cdc1a8f）：Codex P1——換帳號時 `_currentSession` 已是 B、記憶體中的紀錄仍是 A 的；這時登出會用 B 的補傳標記與待傳清單判斷 A 的照片，A 從未上傳的照片可能被當成已上傳而刪掉 → 新的 `signOutProofCleanup()`：本機照片一律以「記憶體中紀錄的帳號」（`state.user`）判斷，已登入的另一個帳號只清它下載的副本；測試在舊的配對方式下會失敗。
  - #256 最後一輪獨立審查的 P3（`proofCloud.js`）：選中的紀錄被刪除後不再重試它的照片；重試的計時改成「最早到期的『沒有照片』」再 1 秒（原本從現在起算整整 10 分鐘，最久要等近 20 分鐘）；成就相框正在用的照片（有 data URL）不會被記憶體上限放掉（避免相框閃回預留圖）。各有測試，在前一版會失敗。
  - #254 第四輪獨立審查的 P3：上傳期間被刪、刪除清單又存不進去時，雲端檔案也會刪（補測試）；上傳迴圈遇到失敗提早結束前先送出排進來的刪除；`unsavedRemovals` 的註解。
  - 測試：`tests/unit/proofLocal.test.js`（10），`statusBarNotice.test.js`（+2），`proofSync.test.js`（+2，在舊程式上會失敗）；e2e `hw112c2b-proof-settings.test.js`（清除這台裝置時保留待傳的、刪除全部清空本機與雲端資料夾且不再上傳、登出只移除已上傳的）。

- [x] **HW-112C2a** 佐證照片在其他裝置顯示（v1.41.23）
  - 新模組 `pwa/js/platform/proofCloud.js`（SHELL；INFRA-105：`sessionRow.js`、`home.js`、`personalSpaceV2.js`、`app.js` 只 import 它的新 export，它只 import 依賴既有的 export，含 `proofSync.js` 的 `PROOF_BUCKET`／`proofObjectPath`）：
    - 登入的帳號、這台裝置沒有本機照片的紀錄列，先放一個隱藏的預留元素（沒有照片的列看起來和以前一樣）；列進入畫面（IntersectionObserver，上下 200px）才下載 `proofs/{uid}/{session}.jpg`，同時最多 3 個，同一張只發一次；下載完成後換成一般的縮圖（檢視、展示到個人空間都可用，展示的選擇會更新整個清單）。
    - 不用 `list()`：「沒有雲端照片」（404、或 400 帶 statusCode 404／not_found）記 10 分鐘，每次同步（`_loadRemote`）與回到前景時清掉；離線、逾時、過期的 token（400 `InvalidJWT`）、伺服器錯誤不記，之後再試；回來的不是 JPEG（例如代理的錯誤頁）不顯示。
    - 下載前後都確認登入的還是同一個帳號，換了就不顯示也不存。
    - 下載的照片不放 localStorage：存在 IndexedDB `orbit-proofs`（照片與「最後看到的時間」分開存，清理時不必讀照片），每個帳號最多 300 張或 15 MB，最久沒看的先刪；重新開啟時從這裡顯示，不再下載。以 `blob:` URL 顯示。
    - 成就照片（首頁的 Orbit Window 與個人空間）：選中的照片這台裝置沒有時，下載雲端那份，轉成 data URL（`orbitWindow.js` 只接受 data URL，不改它），下載完更新相框（首頁就地更新、個人空間重畫一次）。
    - 登出（`handleSignOut`）時清掉這個帳號下載的照片（記憶體、「沒有照片」的記錄、IndexedDB），其他帳號的不動（§5.5）。
    - 拍照存檔後，那一列的預留元素換成剛拍的照片（`proofSheet.js`）。
  - **與提案的差異**：§5.3 建議 Cache API 的 `orbit-proofs-<ownerId>`，但 `sw.js` 在每次更新 activate 時刪掉自己以外的所有 cache，照片會在每次版本更新後消失；改 `sw.js` 的清除規則屬部署行為（需核准），所以改用 IndexedDB（service worker 不碰），一個資料庫、以帳號分開。
  - 測試：`tests/unit/proofCloud.test.js`（41：誰會下載、路徑與 bucket、「沒有照片」10 分鐘後過期、三種 not found 的形式、同步與回到前景時清掉、離線／過期 token／伺服器錯誤不記、不是 JPEG 不顯示、同時最多 3 個且同一張只發一次、下載期間換帳號、登出時不送、重新開啟從 IndexedDB 顯示、15 MB 上限先刪最久沒看的、登出只清這個帳號、只下載進入畫面的列、訪客不觀察、重畫時換掉 observer、成就照片下載後以 data URL 顯示、訪客／紀錄不在／已有照片時不動），`fake-indexeddb` 為新的 devDependency；`tests/unit/sessionRowCloud.test.js`（7）；e2e `hw112c2-cloud-proof.test.js`（真的 supabase-js 與 Chromium 的 IndexedDB：畫面外不下載、捲到時顯示、沒有的不顯示、不寫 localStorage、選為成就照片、重新載入不再下載、登出清掉）；`hw112c-proof-upload.test.js` 加上拍照後那一列顯示剛拍的照片。
  - 另：#255 獨立審查的 P3——疊加組合符號的 e2e 先確認不裁切時上一列真的會不同（字型不疊加時不會空過）。
  - 審查（#256，6f5cdfb）：Codex 兩個 P2——(1) 下載的照片在轉成位元組（`arrayBuffer()`）時登出，登出清掉快取之後這張又被寫回 IndexedDB（共用裝置上留下私人照片）→ 每個帳號一個「清除代數」，`clearCloudProofs()` 時加一；下載開始時記下，寫進記憶體與快取前（與寫入同一個 task）再比對，不同就不寫；(2) 進入畫面時就停止觀察那一列，下載得到「沒有照片」或離線失敗後，那一列再也不會重試（直到整頁重畫）→ 沒找到的列記下來，「沒有照片」被清掉（同步、回到前景）或 10 分鐘到期時重新觀察（還沒到期的下次再排）。新增 4 個測試，在舊程式上都會失敗。
  - 審查（#256，獨立審查 6f5cdfb）：P2 (1) 同上（已修），另外 iOS 會在記憶體不足時關掉 IndexedDB 連線，舊的 handle 讓登出時的清除默默失敗 → `onclose` 時下次重新開啟，刪除失敗時換新連線再試一次；每次同步（`_loadRemote`）也刪掉其他帳號留下的下載照片（`keepCloudProofsOf`：同時只會有一個帳號登入，沒經過登出就換帳號、session 過期時留下的也會清掉）。P2 (2) 個人空間的照片下載完成時整頁重畫，會關掉正在看的詳情、重掛場景，下載期間每次重畫還會多一個回呼 → 改成和首頁一樣就地更新相框；同一張照片下載中再問，只通知最後一個呼叫者一次。P3 一併改：下載 20 秒沒回應就放棄（不再卡住 3 個名額）；IntersectionObserver 以 `<main>`（實際捲動的容器）為 root，200px 的提前載入才有作用；記憶體中的照片超過 200 張時放掉最舊、不在畫面上的（之後從 IndexedDB 回來）。測試 30 個；e2e 加上個人空間的相框。
  - 審查（#256，d931682）：Codex P2——成就照片第一次找不到（還沒上傳、離線）後不會再試（不在列的追蹤裡），另一台裝置上傳後相框仍是預留圖，直到別的原因重畫 → 和列一樣記下，「沒有照片」被清掉或到期時再試，通知最後畫的那一頁；若列在這期間已載入，直接更新相框、不再下載。CI：#255 P3 加的自我檢查在 CI 失敗——CI 的字型不會把組合符號疊高到上一列，代表原本的比對在那裡沒有作用 → 改成也在頭像裡放一條確定伸到上一列的色條：裁切時上一列不變、不裁切時改變（與字型無關；把裁切拿掉時失敗）。
  - 審查（#256，獨立審查 9c4d337）：P2——記憶體上限會放掉剛加入、還沒畫上頁面的那張：畫面上已有 200 張時，之後的照片都不會顯示（Pro 的完成紀錄頁會畫出所有紀錄）→ 剛加入的永遠保留，其他都在畫面上時允許超過上限。P3 一併改：下載中的請求以「清除代數」區分（登出又以同一帳號登入時不會接上舊的、注定落空的下載）；`keepCloudProofsOf` 只在那個帳號仍登入時清別的帳號（換帳號後才完成的舊同步不會清掉新帳號的）；重新查看沒找到的列時，若照片已由別處（成就照片）載入，直接顯示。測試 36 個，新增的 6 個在前一版都會失敗。
  - 審查（#256，aa2af8b）：Codex P2——「沒有照片」還沒到期時重畫的列不會有預留元素，之後到期、回到前景都不會再找（只追蹤既有的預留元素）→ 預留元素只看「登入、這台裝置沒有、還沒載入」，「沒有照片」只延後下載（`wantsCloudProof(…, { evenIfMissed: true })`）；成就照片遇到列剛記下的「沒有照片」時也排進重試。獨立審查 P2——記憶體上限仍會放掉同時下載、還沒畫上頁面的照片（只保護剛加入的那張）→ 30 秒內載入的都不放。P3：重試只針對目前選的那張（選擇改了或清掉就不再試）；登出時也清掉等待中的成就照片回呼。測試 41 個，新增的 5 個在前一版都會失敗。
- [x] **PRO-014F1 收尾** 排行榜 Pro 標記的可讀性、光環效能與測試精確度（v1.41.22，#253 獨立審查的 P3）
  - Pro 標記（`.pro-badge`、`--inline`、`--corner`，各頁共用）、排行榜的「你」標記與字母頭像都是主色底：白字在主色很亮的主題只有 1.1–3.6:1。新增 `--on-primary`，只在白字未達 4.5:1 的 8 個主題設定為該主題自己的深色（liquid-galss、像素、cyberpunk、Material、aurora-blue、emerald、flame 用背景色；anime 是淺色主題，用它的文字色 `#2d1b2e`），其他主題維持白字；`tests/unit/badgeContrast.test.js` 從 style.css 逐一算每個主題的對比（≥ 4.5:1），拿掉任一個設定就失敗。其他用主色底的元件（按鈕等）不在這次範圍。
  - 光環：外圈仍是頭像自己的 `box-shadow`（靜止），會呼吸的光暈改成 `::after` 一層、動畫只改 `opacity`（合成層，不重畫）；Pro 頭像不再 `overflow: hidden`，照片自己切圓。減少動態時光暈靜止（opacity .75）。e2e 改查 `::after` 的動畫，並新增 liquid-galss 下標記文字是深色的檢查；4 個主題（dark-purple、liquid-galss、像素、anime）截圖確認外觀。
  - `proGateCallSites`：`pages/leaderboard.js` 不再整檔豁免，單獨的測試只放行一處 `r.is_pro === true`（拿掉它與註解後不能再有任何 Pro 欄位讀取；改壞時測試失敗）。
  - `leaderboard.test.js` 沒有 `Intl.Segmenter` 的測試：改用 `Object.create(Intl, { Segmenter: { value: undefined } })`（繼承所有成員），容器在 `afterEach` 移除。
  - 審查（#255，4a60e6b）：獨立審查 P2——Pro 頭像為了光暈不再 `overflow: hidden`，字母頭像（別人取的公開名稱的第一個字素）若帶 19 個疊加的組合符號（名稱規則允許），會往上畫進上一列（PRO-014E2 刻意擋掉的）→ 頭像內容包進 `.lb-avatar-face`（圓形、`overflow: hidden`），只有外層不裁切；e2e 把這種名稱放在第二列，比對上一列的截圖與換成普通「Z」時相同（拿掉裁切時失敗）。P3 一併改：對比測試改以 `theme.js` 的 `_ALL_THEME_IDS` 為準，任何主題找不到 hex 主色就失敗（原本會默默略過）；`proGateCallSites` 的允許讀取改成錨定的 `r.is_pro`（`user.is_pro === true` 不能冒充）；排行榜選中的分頁（`.lb-tab.active`）也用 `--on-primary`；`.lb-info` 設 `position: relative`，名字畫在光暈上面。

- [x] **HW-112C1** 佐證照片上傳到雲端（v1.41.21，#254）
  - 新模組 `pwa/js/platform/proofSync.js`（SHELL；INFRA-105：既有模組只 import 它的新 export，它只 import 依賴既有的 export）：
    - 拍照存檔後（`proofSheet.js`），登入的帳號把照片排進上傳清單並在背景送出：`proofs/{user_id}/{session_id}.jpg`、JPEG Blob、`upsert: false`（沒有重拍，「已存在」當作完成）；上傳前後都確認登入的還是同一個帳號。PNG／WebP 的舊照片先重新編碼成 JPEG（不支援時跳過、留在本機）；超過 200 KB 的不送（bucket 會拒絕）。訪客不上傳。
    - 上傳清單 `orbit_proofsync_upload:<帳號>`（存 session id，不存圖片），每次遠端讀取成功後（開機、重新連線，`app.js` 的 `_loadRemote`）在背景補傳，一次最多 10 張，遇到失敗（通常是離線）就停、其餘留到下次；同一個帳號同時只跑一次。
    - 第一次（每個帳號一次）把這台裝置上屬於這個帳號紀錄的舊照片排進清單（§9.6）；別的帳號或訪客留下的照片不上傳；帳號的紀錄還沒載入時下次再試。
    - 撤銷紀錄時（`sessionFlow.js`）：刪掉這台裝置上的照片（原本會留下）、從上傳清單移除；登入時把雲端那份排進刪除清單 `orbit_proofsync_remove:<帳號>`，直到伺服器確認才移除（`remove()` 對不存在的檔案也回成功）。上傳期間被刪掉的紀錄，上傳完成後立刻刪掉雲端的檔案。
    - key 都以 `orbit_proofsync_` 開頭：`proofStore` 把所有 `orbit_proof_*` 當成照片（計數、`clearAllProofs()` 會刪），不能共用前綴。
  - **與提案的差異**：§5.4 建議雲端刪除沿用 session 刪除紀錄（加 `proofRemovedAt`）。那份紀錄的「完成」條件同時給 Personal Space 的重算用，分散在三處（`sessionFlow.js`、`storage.js` 的重試、V2 controller）；照片與兩者無關，改用 `proofSync.js` 自己的刪除清單，保證相同（重試到伺服器確認）、不動那三處。
  - 上傳以 multipart 送出（supabase-js 對 Blob 的做法，和頭像相同）：Storage 檢查的是檔案那一段的類型（`image/jpeg`），e2e 確認。
  - 不算進同步橫幅的待同步數字（照片是背景備份）。
  - 測試：`tests/unit/proofSync.test.js`（18：上傳的路徑、格式與不覆寫、「已存在」、失敗時保留並停止、換帳號不送、超過 200 KB、紀錄不在或不屬於這個帳號、一次 10 張、同時只跑一次、PNG 重新編碼與不支援時跳過、上傳期間被刪、不合 policy 的 id、補傳只限這個帳號且只一次、紀錄還沒載入時等待、key 不算進照片數、撤銷時本機與雲端都刪、刪除重試、訪客只刪本機）；`tests/unit/proofSyncHooks.test.js`（拍照存檔與撤銷紀錄的接點，登入與訪客）；`appBootSequence` 加上「遠端讀取成功後才補傳、失敗時不送」；e2e `tests/e2e/hw112c-proof-upload.test.js`（真的 Supabase client、攔截 Storage：存檔後送到自己資料夾的 JPEG、`x-upsert: false`；撤銷後 DELETE 那一個檔案、本機的照片也刪掉）。把三個接點各自拿掉時測試都會失敗。
  - 下一步 HW-112C2（Next）：其他裝置的顯示、設定頁、登出。
  - 審查（#254，42512d9）：Codex P2 與獨立審查的 P2 相同——同步進行中登出（或換帳號）時，`handleSignOut()` 清掉本機的 user 與紀錄，舊程式把「這台裝置沒有這個帳號的紀錄」當成「紀錄被刪了」：剛上傳完的照片被排進刪除清單（下次登入時刪掉有效的備份），其餘排隊的照片被丟掉（補傳已標記完成，不會再補）→ `ownSessionIds()` 在這台裝置沒有這個帳號的資料時回傳 null（未知，不是「刪了」），同步立刻停下、兩個清單都不動；只有帳號的資料還在而這一筆不在（或在刪除紀錄裡）才算刪除。獨立審查的 P3 一併改：同步進行中新排的照片或刪除，結束後再跑一次（原本要等下次開機）；壞掉的 data URL 不再卡住整個清單；伺服器明確拒絕（400／413／415／422）的那一張丟掉、不擋後面的（401／403 等保留重試）；補傳的清單存不進去（儲存空間滿）時不標記完成；同步結束前再處理一次期間排進來的刪除。測試從 18 個增加到 28 個，把每一項修正改壞時都會失敗。第二輪（0f6c962）：獨立審查的 P2——「明確拒絕」原本以 HTTP 400 判斷，但 Storage 對過期或無效的 token 也回 400（`InvalidJWT`），會把整個清單當成永久拒絕而丟掉 → 改以 Storage 的錯誤代碼判斷（supabase-js 保留在 `error.code`）：只有 `EntityTooLarge`、`InvalidMimeType`、`InvalidKey`（與沒有代碼的 413）丟掉，其他 400 停下並保留清單；「已存在」也認 `Duplicate`／`ResourceAlreadyExists` 代碼（測試 30 個）。第三輪（6fae449）：獨立審查沒有 P1／P2；Codex P2——補傳完成之後，新拍的照片若因儲存空間滿而排不進上傳清單，之後再也不會被找到 → 排不進時清掉「補傳已完成」的標記（刪除 key 在空間滿時也做得到），下次同步重新找這個帳號的所有照片（已在雲端的回「已存在」）；刪除排不進清單時直接試一次（測試 32 個）。記錄不改：照片在快取開機時（遠端讀取之前）存檔，而那筆紀錄已在別台裝置刪除，可能上傳後留下沒人用的雲端檔案；舊版 client 也不會刪雲端的檔案——都很少見，之後若要清可另列任務。第四輪（ec3ced8）：獨立審查沒有 P1／P2；Codex P2——刪除排不進清單（儲存空間滿）而直接那一次也失敗（離線）時，這筆刪除就被忘了：之後的同步只看存下來的清單，而 session 刪除紀錄在資料庫那列刪掉後就清掉 → 排不進清單的刪除留在記憶體裡（app 執行期間），每次同步都重試，並在有空間時寫回清單；直接試一次改成走同一個同步（測試 34 個，新增的兩個在舊程式上會失敗）。剩下的情況：儲存空間滿、離線，而且在空間或網路恢復之前就關掉 app——不另外做（先刪本機照片已騰出 10–40 KB，清單只要幾十個位元組）；HW-112C2 會讀這個帳號的雲端資料夾，到時可評估清掉沒有對應紀錄的檔案。
  - **CI（INFRA-117，併入 #254）**：GitHub Actions 的 `ubuntu-latest` 在 2026-11-18 換成 Ubuntu 26.04，Playwright 1.59.1 不支援（`npx playwright install --with-deps chromium` 直接失敗：`Playwright does not support chromium on ubuntu26.04-x64`），e2e 在跑任何測試之前就紅了，之後每個 PR 都會遇到（CI 不在 main 的 push 上跑）。devDependency `@playwright/test` 升到 1.65.1（套件裡有 `ubuntu26.04-x64`；1.59.1 只到 24.04）；不改 CI 設定。本機以容器預裝的 Chromium 跑完整 e2e 仍全部通過。

- [x] **PRO-014F1** 排行榜的 Pro 光環與標記（SUB-14 的排行榜部分，v1.41.20，#253）
  - `get_leaderboard()` 的 `is_pro` 為 `true` 的列：頭像外圍一圈主題強調色的光環（`.lb-avatar--pro`，3.2 秒緩慢明暗；`prefers-reduced-motion: reduce` 時靜止、光環仍在），名稱後面「✦ Pro」（沿用 app 既有的 `pro-badge--inline` 樣式），排在「你」之前；只認嚴格的 `true`（字串 `'true'`、缺少都不算）；不影響排名。
  - **Pro 入口的授權**（PRO-014F 的完成條件）：本次沒有新增任何取得資料、觸發運算或解鎖功能的 Pro 入口，只有顯示。`is_pro` 由 018 的 `get_leaderboard()`（SECURITY DEFINER）在 server 以 `is_pro_active()` 對 `pro_entitlements` 判定，client 不傳任何 Pro 狀態；排行榜的其他資料對所有登入者相同。
  - 一併處理 #251 審查的 P3：沒有 `Intl.Segmenter` 時的首字退回加上測試（`vi.stubGlobal` 後重新載入模組；把退回改壞時會失敗）、無法建立時記住不再重試；`clearLeaderboardOptOutPending` 的說明改成「加入或離開」。
  - 審查（#253）：Codex 沒有問題；獨立審查沒有 P1／P2（在 6 個主題、兩種外觀、320px 寬截圖確認；把退回改壞或拿掉 `vi.resetModules()` 時測試會失敗），P3 由「PRO-014F1 收尾」完成（v1.41.22，見 Done）。合併（2026-11-18，a305822）。
  - 測試：單元（Pro／非 Pro／`'true'`／缺少、標記位置、不影響排名、退回）；e2e `tests/e2e/pro014f-leaderboard-pro.test.js`（只有 Pro 列有光環與標記、計算後的 `box-shadow` 與動畫名稱；減少動態效果時動畫為 `none`）。截圖確認預設與純白光兩種主題。`proGateCallSites` 的允許清單加上 `pages/leaderboard.js`（讀的是 RPC 回傳的 `is_pro`，不是 profile 欄位，只用於顯示）。

- [x] **DEV-001** 讓任何 agent 在雲端容器裡都能直接跑完整的檢查（#252，只改測試工具與文件，不 bump）
  - `playwright.config.js`：環境變數 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定 Chromium（容器裡是 `/opt/pw-browsers/chromium`）；沒設定時行為不變。不必再寫暫時的設定檔。
  - `tests/database/run.sh`：每份 `*.test.sql` 一個新的本機資料庫（替身 → `pwa/db/0*.sql` → 測試，`plpgsql.check_asserts = on`），輸出 PASS／FAIL／SKIP，有失敗時結束碼 1；pgTAP 的 `not ok` 與「planned N but ran M」也算失敗（故意改壞的純 SQL、pgTAP 斷言與計畫數三種情況都確認會失敗）；沒有 pgtap 時 `pro014d` 跳過。本機 10 份全部通過。
  - `support/supabase-standin.sql` 加上 Supabase 的 `extensions` schema（`pro014d` 用 `create extension pgtap with schema extensions`），`pro014d` 在這條鏈上也能跑。
  - `support/name-rule-parity.mjs`：公開名稱規則的 client／server 比對（2026-11-13 只在 scratchpad 裡的工具），輸出 SQL 給 psql（先寫成檔案再 `psql -f`，腳本出錯時才不會被當成成功），不一致或比對少於 500 個名稱時失敗，`--count` 不是 1000 以上的整數時直接報錯；`--mutate` 故意改壞 client 的結尾空白規則，用來確認比對有效（48,114 個名稱：正常 0 個不同，改壞後 434 個）。
  - 審查（#252）：Codex 沒有問題。獨立審查：沒有 P1；P2 兩個都在比對工具（`--count 0` 等會比對 0 個名稱仍然通過；`node … | psql` 在腳本出錯時仍回傳 0）→ 已修。P3 一併改：`run.sh` 列出 pgTAP 失敗的項目、測試路徑以執行的目錄為準並先確認存在、中斷時刪掉測試資料庫、以 `create extension … pgtap` 判斷 pgTAP 測試、`REQUIRE_PGTAP=1`、`not ok` 不限行首、拒絕非本機的 `PGHOST`。
  - 文件：新的 `tests/database/README.md`；`tests/e2e/README.md` 與 `docs/agent-handoff.md` §8 改成環境變數與 `run.sh` 的跑法、容器被換掉時要重裝什麼；§2 記下 2026-11-18 使用者的工作方式。

- [x] **PRO-014E2 收尾**（v1.41.19，#251）
  - 設定頁：只有加入或離開排行榜（`isPublic` 有變）才清掉舊版留下的「關閉」；只改名稱時保留，讓它照樣送出（E2 第三輪審查的 P3）。
  - 排行榜的頭像首字改以字素（grapheme）取：帶重音符號的字母、國旗、帶膚色的 emoji 都完整顯示；沒有 `Intl.Segmenter` 的舊瀏覽器仍取第一個 code point。
  - 記錄 E2 第三輪審查與合併；在 Next 列出 2026-11-18 的完善清單（DEV-001、PRO-014F、HW-112C、INFRA-116）。

- [x] **PRO-014E2** client 改用 `get_leaderboard()` 與公開名稱（v1.41.18）
  - 完成（2026-11-13，#250）：
    - `pwa/js/leaderboardPublic.js`（新模組；INFRA-105：既有的 SHELL 模組只 import 新模組的 export）：
      - 公開名稱的規則 `displayNameProblem()` 與 018 的 `profiles_display_name_check` 相同：1–20 個 code point、27 段任何位置都不行的字元、開頭不能是空白／variation selector／tag、結尾的空白後面只接 variation selector／tag 也不行。
      - `fetchLeaderboardRows()` 呼叫 `get_leaderboard()`；自己的快取 `yoyo_leaderboardCacheV2`（寫入時刪掉舊的 `yoyo_leaderboardCache`，兩種列的格式不會混用）。快取記下是哪個帳號的（`is_me` 因人而異），只給同一個帳號讀；請求進行中換了帳號，或設定頁存了名稱（清快取時遞增的 generation），回來的列都不寫入快取。
      - `savePublicSettings()`：`update(...).eq('user_id', 本人).select('display_name, is_public').single()`，等伺服器回應；名稱不符規則時伺服器回 23514。
    - 排行榜：改用 RPC；「你」只看 `is_me`；名稱用 `display_name`；成長率與「新使用者」用 `joined_on`；頭像只簽 `avatar_path`（NULL 顯示首字，首字以 code point 取，emoji 不會被切半）；只截斷名稱文字、「你」標記保留，堆疊的組合符號裁在一行內。
    - 設定頁：
      - 訪客只顯示「登入帳號後才能加入排行榜」。
      - 開啟時沒有公開名稱 → 先出現輸入框（預設空白，不帶入帳號名稱），按「儲存並加入排行榜」時一次寫入名稱與開啟；已有名稱 → 直接開啟。名稱前後的半形空白（手機鍵盤選字後常會補上）直接去掉；再點一次開關不會清掉打到一半的名稱；Enter 不會在選字時（含 Safari 的 keyCode 229）送出；錯誤訊息以 `aria-describedby`／`aria-invalid` 連到輸入框。
      - 關閉保留名稱；「修改名稱」只改名稱；公開但沒有名稱（E2 之前用舊版開啟的人）會提示並可設定。
      - 寫入期間停用整張卡片；失敗時開關恢復原狀並說明原因（名稱不符規則／網路）；回應回來時已切換帳號則丟棄；成功後只更新本機的 user（`saveUserLocal`）並清掉排行榜快取。離開設定頁再回來時輸入框重新開始。
    - `storage.js`：`is_public` 與新的 `display_name` 在 `PROFILE_FIELDS` 只讀不寫（整份 profile 的上傳不再帶這兩欄，其他裝置的舊資料不會把設定蓋回去）；移除不再使用的 `getLeaderboardCache`／`saveLeaderboardCache`；登出時清掉兩個排行榜快取。這一版寫的 profile 待同步快照帶 `fields: 'pro014e2'`；沒有這個標記的快照來自 v1.41.17 以前（那一版離線關掉排行榜時，關閉是跟著 profile 上傳的）。任何要取代或上傳這種快照的地方（`saveUser`、`saveUserAndSync`、刪除紀錄的復原、`loadFromRemote`），若它的 `isPublic` 是 false，先把「關閉」移到另一個 key `leaderboardOptOutPending:<帳號>`（開機時 `processYesterdayStreak()` 的 `saveUser` 比讀取伺服器早，快照會先被換掉）；`loadFromRemote` 在讀取之前送 `update({ is_public: false })`，確認有一列被更新才刪掉這個 key（失敗或 0 列時保留、中止這次讀取）。只照做關閉、不照做開啟；設定頁存檔成功時刪掉這個 key（使用者最新的選擇優先）。
    - 測試：
      - `tests/unit/leaderboardPublic.test.js`：從 018 讀出字元範圍與長度上限比對；可以與不可以的名稱（含 BMP 以外的字元、英格蘭旗、各類看不見的字元）；RPC、快取、寫入。
      - 排行榜、設定頁、storage 對映、整合測試與 `leaderboardViewGrantsSql` 更新（client 不再讀 view）。
      - 新的 e2e `tests/e2e/pro014e2-leaderboard-name.test.js`：真的 Supabase client、攔截 REST；開啟 → 不合規則的名稱被擋 → 輸入名稱 → 只有一次 PATCH（`display_name` 與 `is_public`，限本人）→ 排行榜顯示公開名稱、標記「你」、畫面上沒有帳號名稱。
    - 驗證：單元與整合測試 1724 個、e2e 100 個全部通過（另 1 個原本就略過），lint 通過；兩輪審查修正的 13 種改壞情況都會讓測試失敗。名稱規則以本機 PostgreSQL 的 018 CHECK 對 55,224 個隨機名稱（集中在每段字元範圍的兩側）比對，0 個不同；把結尾空白的規則改壞時有 520 個不同，把兩段字元範圍改壞時單元測試會失敗。截圖確認設定頁三種狀態與排行榜（含 20 個全形字與堆疊組合符號的名稱）。
    - 審查（#250，89f4848）：Codex P2——快取沒有綁帳號，A 登出時還在進行的請求會在清快取之後寫回，同一天 B 開排行榜會看到 A 的列標成「你」→ 快取記下帳號、換帳號後的回應不寫入也不顯示。獨立審查：沒有 P1；P2 同上，另加「設定頁存名稱之後，之前送出的請求把舊名稱寫回快取」→ generation；P2：v1.41.17 離線關掉排行榜、還沒上傳就更新到這一版，關閉會遺失（新版上傳不帶 `is_public`，接著讀回 true）→ 上述的舊快照處理。P3 已改：Safari 選字的 Enter、前後空白、「不能有」的訊息（全形空白、組合的 emoji）、再點一次開關保留草稿、aria。沒改（記錄）：NUL 或單獨的 surrogate（打不出來）會被伺服器拒絕並顯示網路錯誤；頭像首字以 code point 取（以組合符號開頭的名稱，首字會是單獨的符號，只影響外觀）；開機的讀取若比設定頁的儲存晚回來，開關會短暫顯示舊狀態，下一次讀取就恢復。
    - 第二輪（1c821eb）：Codex 沒有問題。獨立審查：沒有 P1；P2：舊快照裡的「關閉」通常在 `loadFromRemote` 看到之前就被開機的 `saveUser` 換掉（之後上傳不帶 `is_public`，讀回 true）→ 改成上述的另一個 key，並以 0 列視為失敗。P3（記錄、不改）：沒有標記的快照是整份 user 的副本，`isPublic: false` 不一定是使用者剛關掉——一台離線很久、停在舊版的裝置更新後，可能把之後在別台裝置開啟的人關掉一次（偏向不公開，設定頁看得到，v1.41.17 本來也會這樣）。
    - 第三輪（f1d7aef）：Codex 沒有問題；獨立審查沒有 P1／P2。P3：只改名稱時也會清掉舊版留下的「關閉」（改名不是加入與否的選擇）→ #251 改成只有 `isPublic` 有變時才清；開啟時另一個裝置的舊「關閉」可能正在送出、讓剛開啟的人又被關掉（偏向不公開，設定頁看得到，記錄不改）；profile 列不存在時 0 列會讓同步一直失敗（client 不會刪 profile 列，碰不到，記錄不改）。CI 全綠後合併（2026-11-16，d4f7077）。

- [x] **2026-11-13 production 套用（BUG-119A、HW-112B、PRO-014EA、PRO-017RA）**：擁有者 2026-11-13 回覆「可以送了 依序即可」，agent 以 Supabase MCP 依序執行，每一項都是只讀檢查 → production 乾跑（完整的資料庫測試，單一 transaction、結尾 rollback；四項都另以只讀查詢確認沒有留下任何東西）→ 套用（`begin; set local lock_timeout = '5s';` … `commit;`，MCP 的確認即擁有者核准）→ 事後檢查（只讀的定義、權限、md5 與可見性檢查；需要合成帳號的部分在 transaction 裡做、結尾 rollback；019 套用後另跑完整的 pro014l）。
  - **BUG-119A（017）**：套用前 policy 仍是 010（`foldername(p.name)`）、`is_public_leaderboard_avatar` 不存在；公開使用者 2 位、有頭像且檔案存在 1 位。乾跑 bug119 測試全部通過。套用後：policy 為 `bucket avatars AND is_public_leaderboard_avatar(name)`，函式的 `pg_get_functiondef` md5 與本機以檔案套用的相同（`d7dacbf3…`），只給 authenticated（加上 postgres、service_role）；以合成帳號確認旁人只看得到公開使用者現在的頭像，已登入的旁人看得到那 1 位真的公開使用者的頭像，anon 看不到。
  - **HW-112B（016）**：套用前沒有 `proofs` bucket 與 policy。乾跑 hw112 測試（含 12 種壞檔名、UPDATE／DELETE 的 USING、`storage.protect_delete`）在真的 Storage 表上全部通過。套用後：bucket 私有、200 KB、只收 `image/jpeg`；四個 `proofs_*` policy 只給 authenticated，定義（`pg_policies`）的 md5 與本機以檔案套用的相同（`7afa17ea…`）；以合成帳號確認本人看得到自己的、別人與 anon 看不到。**還沒做**：以測試帳號經 Storage API 上傳，確認大小與 MIME 的限制——併入 HW-112C 的驗收（見 Backlog 的 HW-112）。
  - **PRO-014EA（018）**：套用前 view 與 010 相同、權限與 015 相同，`get_leaderboard` 與 `display_name` 不存在；公開使用者 2 位、頭像不在自己資料夾的 0 位。乾跑 1（018 ＋ pro014e，3894 個不允許的字元逐一檢查）與乾跑 2（backfill，62 個案例）都通過；2 位公開使用者都會補上公開名稱、0 位留空。套用後：CHECK 的 `pg_get_constraintdef` md5 與 repo 相同（`46e980e2…`），`get_leaderboard()`（`e00fdf13…`）與 view（`4a95f577…`）的定義 md5 與本機以檔案套用的相同；2 位公開使用者都有公開名稱、不公開而有公開名稱的 0 位；舊 view 不再顯示原本的名稱；RPC 只給 authenticated（加上 postgres、service_role）；以一位真的公開使用者的身分呼叫 RPC，列數等於公開且有公開名稱的人數、`is_me` 恰好一列、沒有 NULL 名稱，anon 被拒。**套用之後不要再 commit 重新執行 018**（018 開頭有說明）：擁有者清掉的不當名稱會被從 name 補回來。
  - **PRO-017RA（019）**：套用前 `set_pro_entitlement_updated_at()` 是 012 的版本（md5 `5f393e3e…`，回滾時比對），兩張表、三個 RPC 與新欄位都不存在，postgres 可以 UPDATE `auth.users`（測試需要）。乾跑 019 ＋ pro017 全部通過。套用後：四個函式（`set_pro_entitlement_updated_at`、`get_my_referral_code`、`redeem_referral`、`claim_referral_reward`）的 `pg_get_functiondef` 合起來的 md5 與本機以檔案套用的相同（`90b9e473…`）；兩張表都開 RLS，`referral_codes` 只有一個 SELECT policy、`referrals` 沒有 policy，client 只有 authenticated 對 `referral_codes` 的 SELECT；三個 RPC 只給 authenticated（加上 postgres、service_role）；兩張表都是空的。另外在套用後的 production 跑 pro014l（SUB-16）全部通過。「確認 email」由擁有者另外做（Next 的 PRO-017RA-Auth）。
  - **送出 SQL 的方法**：工具的輸入會把小寫的 `\uXXXX`、`\t`、`\r`、`\n` 等反斜線逸出轉成字元本身，直接送出會讓 production 存下看不見的字元、與 repo 不同。做法：把含逸出的那一句放進 `EXECUTE replace($q$ … $q$, '<佔位字>', chr(92) …)`，佔位字在 server 端換回反斜線——018 的 regex 用 `#u`／`#U` 換成 `chr(92) || 'u'`／`'U'`，019 的 `E' \t\r\n'` 用 `#BS` 換成 `chr(92)`。本機先比對這樣套用與直接執行檔案的 `pg_get_constraintdef`／`pg_get_functiondef` md5 完全相同，套用後再以 production 的 md5 確認。另外，函式內的註解是函式內容的一部分，送出時不能刪（本機第一次組 019 的乾跑 SQL 時刪了註解，md5 不同，改正後才送到 production）。016 的 `\.jpg$` 不是 JSON 逸出、不受影響（policy 的 md5 相同）。之後的 migration 若含反斜線逸出，沿用這個方法。
  - 乾跑、套用與事後檢查都沒有讀出任何使用者的名稱或 email（回傳的只有計數、布林值、md5、policy 定義與權限清單）。

- [x] **PRO-017R1** migration 019：邀請朋友解鎖 Pro（SUB-17）的資料表與三個 RPC，加上資料庫測試
  - 完成（2026-11-12，#248；production 套用為 PRO-017RA）：
    - `pwa/db/019_referrals.sql`：
      - `pro_entitlements.referral_reward_granted_at`（一次性標記）；`set_pro_entitlement_updated_at()` 把它算進去。
      - `referral_codes`（`user_id` 主鍵、8 碼的 `code` 唯一並以 CHECK 限定字元）與 `referrals`（`invitee_id` 主鍵、`inviter_id`、不能是自己）：server-owned，RLS 開啟，`REVOKE ALL … FROM public, anon, authenticated`；`referral_codes` 只給 authenticated 讀自己的（一個 SELECT policy），`referrals` 不給任何權限、不建立 policy；檔案裡寫明刻意不建立寫入 policy。
      - `get_my_referral_code()`：沒有就建立（亂數取自 `gen_random_uuid()` 完全隨機的 8 個 byte，撞碼重試）。
      - `redeem_referral(p_code)`：格式、碼存在、不是自己、還沒綁定、帳號建立 7 天內（`auth.users.created_at`，不是本人改得到的 `profiles.created_at`）。
      - `claim_referral_reward()`：已有 7 個有效日的被邀請者人數（有效日同 012；只算被邀請者帳號建立當天到 UTC 今天）；3 位 → 30 天 Pro，一生一次；已是 Pro（含試用、終身）時不發、不消耗；`FOR UPDATE` ＋ `WHERE … IS NULL`，同 012。
      - 三個 RPC 都是 `SECURITY DEFINER`、`search_path = ''`，只給 authenticated。
    - `tests/database/pro017.test.sql`：表與函式的結構、RLS、policy 與權限（含 PUBLIC 與 anon 的七種權限）；邀請碼的格式、同一人相同、不同人不同、只讀得到自己的、client 不能寫；綁定：五種狀態、全形的碼、全形空白、小寫加 tab 與換行、改綁別人的碼、7 天又 1 分鐘與 created_at 是 NULL 的帳號被拒（不存在的碼也回 `too_late`）、6 天 23 小時可以、client 讀寫 `referrals` 被拒；達成的條件（連線的 TimeZone 設成 UTC+14 與 UTC−12）：建立當天就有紀錄的 F、今天才湊滿的 B（另有娛樂剛好 120 分鐘）算；建立前與未來的日期、娛樂 121 分鐘、生產 XP 49、只有 B 級任務、A 級但 invalid、不算生產力、`base_xp` 60 但 `final_xp` 40 各少一天的不算；7 個日期齊但帳號只存在 6 天的不算；2 位達成不發放（付費已過期時 `paid_active` 是 false）、付費中、終身、試用中都不發放也不消耗、付費已過期時發放 30 天、第二次不延長；updated_at trigger；沒有 sub 與 anon 都被拒。
    - `tests/database/pro017.rollback.sql`：刪除三個 RPC 與兩張表、還原 012 的 trigger 函式、刪除欄位（已發放的 Pro 保留）；設 `lock_timeout`（刪除表會以 AccessExclusiveLock 鎖住 `auth.users`）。
    - `tests/database/support/pro017-concurrency.sh`：本機兩個連線同時領取，兩個情境都要只發一次、兩邊期限相同：(1) 第一個領取後 2 秒才 commit；(2) 另一個連線先鎖住邀請者的 entitlement 列，兩個領取同時開始。019 有兩道防線（`FOR UPDATE` 與 `WHERE … IS NULL`）；兩道都拿掉時情境 2 發放兩次（本機實測），只拿掉一道時仍然通過。暫存檔用 `mktemp -d`，結束時刪除。
    - 替身的 `auth.users` 加上 `created_at`。
    - 本機 PG16（001～019）：`pro017` 與其他 8 份測試都通過；回滾後 trigger 函式與套用 019 前的 `pg_get_functiondef` 相同、`pro014l` 仍通過；再套用兩次（可重複執行）後 `pro017` 仍通過；並行腳本兩個情境都通過；改壞 019 的 43 種情況都會失敗（含兩輪審查發現存活的全部：有效日的每個條件、試用中、過期付費、帳號年齡與它的兩側（6 天 1 小時、8 天）、兩個時區、120 分鐘與 2 位的邊界、綁定期限、NULL 的建立時間、正規化（NFKC、空白、零寬空白）、已綁定與太舊的人都先回答、回傳的 `paid_active`）；乾跑的兩種切法（從 `begin;` 或從第一個 `do $$`，接著跑 pro014l）在 10:00 UTC 之後也都通過。
    - 審查（#248）：Codex 沒有問題（e251769）。獨立審查：沒有 P1；P2：有效日的條件只測到娛樂、試用中與過期付費沒有測、「每個假帳號至少要存在 7 天」不成立（只看日期時 5 天多就能湊滿）→ 測試補齊，並在 `claim_referral_reward()` 加上「被邀請者的帳號要存在滿 7 天」，讓提案核准的說法成立；第二輪（ff2f6fe）：Codex 沒有問題；獨立審查沒有 P1，P2：乾跑時 pro017 把 TimeZone 留在 UTC+14、pro014l 的 UTC 設定又被切掉，10:00 UTC 之後誤報失敗 → 測試在第 0 節固定 UTC、時區段落結束後放回 UTC，乾跑說明改成保留 pro014l 的 timezone 那一行；P3：已綁定的人不能試探碼的斷言、帳號年齡卡在 168 小時的兩側（6 天 23 小時 59 分、7 天 1 分）、「7 天」改成 168 小時（不受日光節約時間影響）、去掉零寬空白與 BOM；P3：NFKC 正規化與去掉 tab／換行、已經綁定或太舊的人不查碼、並行腳本加鎖住列的情境與 `mktemp`、回滾設 `lock_timeout`、套用時 `auth.users` 的鎖、匿名登入維持關閉、pro014l 在同一個乾跑 transaction 裡跑、兩個時區、各種邊界。

- [x] **PRO-014E1** migration 018：排行榜的公開名稱（`profiles.display_name`）與 `get_leaderboard()`，加上資料庫測試
  - 完成（2026-11-12，#247；production 套用為 PRO-014EA）：
    - `pwa/db/018_leaderboard_display_name.sql`：
      - `profiles.display_name`（NULL 或 1–20 字；任何位置都不能有控制字元、半形空白以外的空白類字元、零寬與方向控制字元、常被拿來做「看不見的名稱」的字元〔Hangul／Braille 的空白、U+1D159、U+1D173–U+1D17A、U+1BCA0–U+1BCA3、U+13430–U+1343F、U+16FE4，與 tag／variation selector 旁邊未指派的 default-ignorable U+E0080–U+E00FF、U+E01F0–U+E0FFF〕、BOM、軟連字號；開頭不能是空白、variation selector 或 tag，結尾不能是空白〔後面只接 variation selector／tag 也不行〕）。只允許半形空白，檢查不依賴 locale。只有組合符號、私人使用區、U+FFFC、其他未指派的字元等仍可通過（也可能用來藏起前後空白），由擁有者清除（§9 第 8 點）。RLS 不變（002 的四個 owner-only policy）。
      - 既有公開使用者（§9 第 2 點 B）：name 整理後補進 display_name（空白類字元換成半形空白 → 拿掉其他不允許的字元 → 去掉開頭的空白／variation selector／tag 與結尾的空白 → 前 20 字 → 再去掉一次）；WHERE 以和 CHECK 相同的條件再檢查，整理完仍不符合的不補，所以不會讓 migration 失敗。只補 `is_public` 且 `display_name` 為 NULL 的人，可重複執行（但 EA 之後不要 commit 重新執行，見 018 開頭）。
      - `get_leaderboard()`：`SECURITY DEFINER`、`STABLE`、`search_path = ''`，只回傳九個欄位（`display_name, avatar_path, total_xp, week_xp, streak_days, mode, joined_on, is_me, is_pro`），只列公開且有公開名稱的人；`is_me` 取代 `user_id`；`avatar_path` 只在是本人資料夾裡的路徑時才有值（017 只讓別人讀這種檔案）；`is_pro` 來自 `pro_entitlements`（含試用，§9 第 5 點），不看 profile 的 `is_pro`；日期以 UTC 計算；沒有 `auth.uid()` 的呼叫者拿不到資料。`REVOKE ALL … FROM public, anon` 後只給 authenticated。
      - `leaderboard_view`（§9 第 4 點 A）：`name` 改為 `COALESCE(display_name, '匿名')`，其他與 010 相同；`CREATE OR REPLACE VIEW` 保留 015 的權限。
      - 回滾步驟寫在檔案開頭（不刪 `display_name` 欄位）。
    - `tests/database/pro014e.test.sql`：欄位、constraint、函式的結構與權限（含 PUBLIC）、回傳的九個欄位、view 的欄位與權限不變；名稱規則：018 列出的 27 段不允許的字元，每一個（共 3894 個 code point）都被擋、每段兩端外面的鄰居允許；variation selector 與 tag 每一段的兩端不能在開頭、不能藏起結尾的空白；另有 12 種邊界（空字串、21 字、前後空白、只有 variation selector 或 tag、用它們藏起前後空白）被擋、10 種好名稱（中文、emoji、加 VS16 的 emoji、英格蘭旗、20 個 emoji 等）可以，特殊字元都以 `chr()` 寫出；六個合成帳號，連線的 TimeZone 設成 UTC+14 與 UTC−12 各跑一次（不管現在 UTC 幾點，兩者至少一個的日期與 UTC 不同）：只列公開且有公開名稱的人、`is_me` 只有自己、本週 XP 只算 UTC 最近 7 天的生產力 `final_xp`（`base_xp` 故意不同）、`joined_on` 是 UTC 日期、別人的 `avatar_path` 正確、含有自己 user_id 的任意網址與別人的路徑回傳 NULL、試用與終身付費是 Pro、過期付費與只有 profile `is_pro` 的不是；沒有 sub 拿不到資料、anon 不能呼叫；view 顯示公開名稱與「匿名」、不再有 email 前段，其他欄位以 UTC 與 010 的定義比對；本人能改自己的公開名稱、改不到別人的。
    - `tests/database/pro014e.backfill.test.sql`：先建立合成帳號，再以 `\ir` 套用 018，檢查補上的名稱：19 種名稱（長度、前後空白、開頭空白要先去掉才取 20 字、全形空白、tab、BOM、方向控制、只有零寬字元、只有 VS16 或 tag、用 VS16 藏起的前後空白、中間的 VS16 保留、不公開）＋ 018 列出的 27 段不允許的字元各一個（兩端各放一個，空白類換成半形空白、其他拿掉）＋ 空白類每一段的兩端（都換成半形空白）；再改一個、套用第二次，確認只補 NULL。018 已套用過的資料庫也能跑。
    - `tests/database/support/supabase-standin.sql`：讓 pwa/db 的 001～018 能依序套用在空的 PostgreSQL（角色、Supabase 的 public 預設權限、`auth.users`／`auth.uid()`、Storage 的最小替身）。現有的 infra110、pro014r、pro014l、bug109、bug119、hw112 測試在這條鏈上也都通過（bug119 與 hw112 原本只在 storage-standin.sql 上跑過，這裡是真的 002／004／013 的 RLS 與 trigger）。
    - 本機 PG16：替身 → 001～017 → backfill 測試（套用前）→ 018 → 兩份測試與 infra110、pro014r、pro014l、bug109、bug119、hw112 都通過；改壞 018 的 63 種情況都會失敗：CHECK 少任何一段字元（27 種）或段中間少一個（2 種）、補名稱的清單少一段（3 種）、空白類清單少一個（4 種）、開頭／結尾的 VS 與 tag 規則拿掉或縮小（7 種）、30 字、補名稱不先去掉開頭空白、RPC 十一種（含用連線的日期、加總 `base_xp`、`avatar_path` 原樣回傳或只要「含有」user_id）、view 五種（含 7 天、頭像 NULL、不過濾生產力、總 XP 0）、補名稱兩種。
    - 審查（#247）：Codex 沒有問題（75f398f）。獨立審查：沒有 P1／P2；P3 全部處理：只由 variation selector 或 tag 組成的名稱、U+1D159 等「看不見的名稱」字元、用 VS16 藏起前後空白（CHECK 加上，補名稱同步）；測試每段字元都檢查、補名稱每段一個案例、開頭空白的去除、兩個時區、view 的其他欄位、`base_xp`；`avatar_path` 只回傳本人資料夾的路徑；乾跑分成兩個 transaction 的寫法、真的套用也加 `lock_timeout`、lint 0029、EA 後不要 commit 重新執行、EA 到 E2 之間的行為改變、ZWNJ、替身加 `\set ON_ERROR_STOP on`。
    - 第二輪（a2bba58）：Codex 沒有問題。獨立審查：沒有 P1／P2；P3：再擋 U+13430–U+1343F、U+16FE4 與 tag／variation selector 旁邊未指派的 default-ignorable（也能藏起前後空白）；測試改成每一個 code point、VS 與 tag 每一段的兩端、空白類每一段的兩端、含有自己 user_id 的網址（審查中存活的 10 種改壞方式現在都會失敗）；EA 的套用前檢查加上頭像計數。5353031：Codex 沒有問題，CI 通過後合併。
    - 編號：017 是 BUG-119（#246），所以這裡是 018。

- [x] **BUG-119** 排行榜頭像的 Storage policy 讀錯欄位：功能從來沒生效（2026-11-11 寫 HW-112A 時發現；擁有者 2026-11-11 核准修正：「ok」）
  - 位置：`pwa/db/010_leaderboard_avatars.sql` 的 `avatars_select_public_leaderboard_profiles`。子查詢 `from profiles p where p.user_id::text = (storage.foldername(name))[1]` 裡沒加表名的 `name` 會先找最內層的 `profiles.name`（顯示名稱），不是 `storage.objects.name`（檔案路徑）。production 的 `pg_policies` 也顯示為 `storage.foldername(p.name)`（2026-11-11 只讀查詢）。
  - 子查詢在呼叫者的權限下執行，受 profiles 的 RLS 限制（002：只看得到自己那一列）。所以：
    - 原本的功能（已登入的人看得到公開排行榜使用者的頭像）從來沒生效。
    - 外洩的路走不通：要讓條件成立，名稱必須是「自己的 user_id/任意字」（至少 37 字），但 `profiles.name` 有 30 字的上限（001 的 CHECK；BUG-109 證實 production 有這個限制）。2026-11-11 先寫成「任何人都能讓自己讀到所有頭像」，是在沒有這個限制的替身上重現的；#246 的審查前發現並改正。修正後也不再依賴名稱長度的上限。
  - 修正：**只把 `name` 改成 `objects.name` 不夠**：子查詢仍受 profiles 的 RLS 限制，旁人看不到別人那一列，公開使用者的頭像還是讀不到（本機替身重現：Z 看到 0）。所以改用 `SECURITY DEFINER` 的小函式繞過呼叫者的 RLS，只回答布林值（不採用從 `leaderboard_view` 讀：PRO-014E 之後要拿掉這個 view）。
  - 只讀查詢（2026-11-12，只回傳計數）：8 個 profile、2 個公開、**0 個觸發**（名稱的第一段等於自己 user_id）、0 個名稱含 `/`；`avatars` 有 10 個檔案、公開且有頭像的 1 個。目前沒有人利用過這個漏洞（只看得到現在的狀態，看不到過去）。
  - 完成（2026-11-12，#246；production 套用為 BUG-119A）：
    - `pwa/db/017_avatar_public_policy_fix.sql`：`public.is_public_leaderboard_avatar(object_name text)`（`SECURITY DEFINER`、`STABLE`、`search_path = ''`、只回傳布林值；`REVOKE ALL … FROM public, anon` 後只 `GRANT EXECUTE` 給 authenticated）回答「這個檔案是不是某個公開使用者現在的頭像」：檔案的第一層資料夾（確認是小寫 UUID 後以主鍵查詢）是那個 profile 的 user_id、`is_public`、而且 `avatar_url` 等於檔案路徑。`avatars_select_public_leaderboard_profiles` 改成 `bucket_id = 'avatars' and public.is_public_leaderboard_avatar(name)`（policy 裡沒有子查詢，`name` 就是物件名稱）。只開放現在的頭像、不是整個資料夾：`uploadAvatar()` 每次上傳都用新檔名、舊檔不刪，開放整個資料夾會讓別人列出並下載換掉的舊照片。回滾步驟與「不要收回 authenticated 的執行權」寫在檔案開頭。
    - `tests/database/bug119.test.sql`：函式與 policy 的結構與權限；四個合成帳號（X 想利用 010 的人、Y 公開、P 不公開、Z 旁人），Y 另有一張換掉的舊頭像，另一個只在 transaction 裡的 bucket 有和 Y 的頭像同名的檔案：Z 只看得到 Y 現在的頭像（看不到舊頭像、另一個 bucket 的檔案、P 與 X）；X 把名稱改成「自己的 user_id/x」被 30 字上限擋下，把 `avatar_url` 指向 P 的檔案或 Y 的舊頭像並改成公開也打不開，之後只看到自己與 Y 現在的頭像；P 看得到自己與 Y 現在的頭像；anon 看不到、不能呼叫函式；函式對舊頭像、不公開、不存在、沒有資料夾、大寫或非 UUID 的資料夾、NULL 都回 false。
    - 本機替身加上 `auth.users` 與建立 profile 的 trigger（同 004／013），profiles.name 加上 001 的 30 字上限。本機 PG16：替身 → 003 → 016 → 017 → BUG-119 與 HW-112 的測試都通過；改壞 017 的九種情況都會失敗：留著 010 的 policy、開放整個資料夾、不檢查資料夾是不是本人、不看 `is_public`、函式不是 SECURITY DEFINER、函式給 anon、沒給 authenticated、policy 也開放別的 bucket、policy 不限 authenticated。
    - 審查（#246）：Codex 沒有問題（404fb97、05113bb）。獨立審查：沒有 P1；P2 017 開放了公開使用者的整個頭像資料夾（含換掉的舊照片）→ 改成只開放現在的頭像（`avatar_url` 等於檔案路徑，且資料夾是那個 profile 本人）；P3：收回 authenticated 的執行權會讓所有 Storage 讀取失敗 → 017 與 BUG-119A 註明；測試沒有以行為檢查 bucket 的範圍 → 加另一個 bucket 的同名檔案；`user_id::text = folder` 用不到主鍵 → 先確認是 UUID 再轉型；過時的「提案」與「下一步」改寫。第二輪（404fb97）：沒有 P1／P2；P3：policy 的 bucket 檢查改成整個條件的完全比對（原本的文字比對讓 `avatars OR proofs` 通過）、收回執行權的影響寫完整（讀取、移動、刪除）、7 天簽名網址的限制與 BUG-119A 的頭像檔案計數寫進文件。函式在 public schema，已登入的人可以以 RPC 呼叫，只回答「這個路徑是不是公開使用者現在的頭像」，與 `leaderboard_view` 已公開的 `avatar_url` 相同；PRO-014E 移除 view 之後仍只回答布林值（要知道 user_id 與檔名才問得出 true）。

- [x] **BUG-118A**（擁有者）確認重新加入的主畫面圖示
  - 結果（2026-11-11）：重新加入的圖示打開後**沒有**出現 BUG-118 的提示，頂部也沒有模糊。偵測的前提（`default` 下頂部 safe area 為 0）在真機上成立，其他使用者不會被誤提示。
  - 同時發現：重新加入後**沒有**出現 UI-203 的新圖示（v1.41.17 已於 2026-11-11 13:20 UTC 部署成功）。原因推定為 Safari 裡的 Orbit 仍由舊版的 service worker 提供舊的 `index.html`（沒有 `apple-touch-icon` 的連結，manifest 與圖示也是舊快取）。已請擁有者：用 Safari 打開 Orbit → 設定頁確認 v1.41.17（出現「新版本已就緒」就按「重新整理」，沒出現就關掉分頁重開）→ 加入主畫面前看預覽是不是紫色行星；預覽仍是舊圖示就回報。

- [x] **HW-112A** migration 016：佐證照片的私有 bucket `proofs` 與四個 policy，加上資料庫測試
  - 完成（2026-11-11，#245）：
    - `pwa/db/016_proof_storage.sql`：bucket `proofs`（私有、每個檔案 200 KB、只收 `image/jpeg`）；`proofs_select`／`proofs_insert`／`proofs_update`／`proofs_delete` 都只給 `authenticated`，以 `storage.foldername(name)[1]` 限定自己的資料夾；INSERT 與 UPDATE 的 WITH CHECK 另外要求名稱剛好是 `{user_id}/{小寫 UUID}.jpg`。可重複執行（bucket `on conflict`、policy 先 drop）。回滾步驟寫在檔案開頭（HW-112C 前後不同）。
    - `tests/database/hw112.test.sql`：bucket 設定；四個 policy 的指令、角色與子句；其他 policy 都限定自己的 bucket（permissive policy 是 OR 起來的）；以兩個合成帳號與 anon 模擬 Storage API：上傳（別人的資料夾、大寫、別的副檔名、子資料夾、不是 UUID、只有前綴相同的資料夾都被拒）、讀取、修改（別人改不到、不能搬到別人的資料夾或不合規則的名稱）、刪除（需 `storage.allow_delete_query`，別人與 anon 刪不到）。單一 transaction，結尾 rollback。
    - 本機演練：這個雲端環境的 Docker daemon 可以啟動，但拉 Supabase 的 image 被網路政策擋下（public.ecr.aws 的 blob 403、Docker Hub 429），`supabase start` 不能用；直接執行下載的 Supabase Storage migration 也被環境的安全規則擋下。改用自己寫的最小替身 `tests/database/support/storage-standin.sql`（依 production 的 Storage 版本 0079 照抄 `storage.foldername()`、兩張表的欄位與 RLS、權限、`protect_delete`，加上 003 與 010 的頭像 policy）。本機 PG16：替身 → 003 → 016 → 測試，全部通過；故意改壞 016 的五種情況（拿掉名稱規則、SELECT 不看資料夾、UPDATE 的 WITH CHECK 改成 true、DELETE 不看資料夾、加一個不限 bucket 的 policy）都會失敗。
    - 替身與真的 Storage 的差異由 HW-112B 的 production 乾跑補上（同一份測試）。
    - 審查（#245）：Codex 沒有問題。獨立審查：016 本身沒有 P1／P2（17 種路徑技巧只有正確的名稱能上傳）；P2 測試測不到 UPDATE／DELETE 的 USING（加了 WHERE 就也套用 SELECT policy，`proofs_select` 先把別人的檔案藏起來）→ 第 5 節前加一個只在 transaction 裡、看得到所有 proofs 的 SELECT policy；P2 BUG-119 的影響與修正寫錯（profiles 的 RLS）→ 改寫，替身加上 002 的 profiles RLS；P3：名稱規則再加四種壞名稱（沒有 `^`、`.` 沒跳脫、結尾換行、結尾 `/`），其他 policy 的檢查改成 USING 與 WITH CHECK 分開比對且只給 authenticated，替身的說明與權限改正，乾跑加 `lock_timeout`，移動／複製會繞過大小與類型的限制寫進 016 與 HW-112B。改壞 016 的八種情況（含審查發現原本測不到的五種）現在都會失敗。
    - 寫測試時發現 BUG-119（010 的頭像 policy 讀錯欄位），記在 Backlog，等擁有者核准。

- [x] **UI-203** 重新設計主畫面的 app 圖示（擁有者 2026-11-11：「加入主畫面的 LOGO 太醜 請你重新設計」）
  - 舊圖示：紫橘漸層加白色「O」與圓環；PNG 的四角是透明的圓角，iOS 會把透明處補成黑色；manifest 只有兩個 `any maskable` 圖示，沒有 `apple-touch-icon`。
  - 完成（2026-11-11，v1.41.17，#244）：
    - 來源 `art-pipeline/app-icon/icon.svg`（放在 `pwa/` 以外，網站上不多一個沒有 CSP 的 SVG 文件）：紫色漸層的背景、行星、環（環的前半段在行星前面）與軌道上的金色衛星、三顆星；不透明的滿版方形。
    - `npm run icons`（`scripts/make-icons.mjs`，共用 `scripts/appIconLib.mjs`；用 Playwright 的 Chromium 輸出，找不到 Playwright 預期的瀏覽器時以 `CHROMIUM_PATH` 指定；同一個 Chromium 輸出完全相同，換版本可能有反鋸齒的差異，所以只在 SVG 改了才重新產生）產生 `pwa/assets/` 的 `icon-192.png`、`icon-512.png`（`purpose: any`）、`icon-maskable-512.png`（主體 `<g id="art">` 縮到 80%）、`apple-touch-icon.png`（180×180，`index.html` 以 `<link rel="apple-touch-icon">` 提供）。
    - 刪除舊的產生器 `pwa/make-icons.html`（部署在網站上、沒有 CSP 的開發頁面；`docs/infra-113-csp.md`、`docs/infra-107-html-cache.md` 已更新）。
    - 測試：`tests/e2e/ui203-app-icon.test.js`：manifest 的圖示與 `apple-touch-icon` 的尺寸、用途，四角與中心都不透明（舊圖示的角是透明的，會失敗）；maskable 的主體不超出 Android 的安全範圍（中心 40% 半徑的圓，量得約 0.37；縮放改成 1 會失敗），滿版的主體不碰到 iOS 裁掉的角。
    - iPhone 沿用加入主畫面當時的圖示：要看到新圖示必須重新加入（BUG-118 的步驟：先加新的、確認後再移除舊的）。Android 只有從 Chrome 安裝的 app 會更新，在 Chrome 之後檢查 app 時（可能會請使用者確認）。
    - 審查（#244）：Codex 沒有問題。獨立審查沒有 P1／P2；P3：UI-001 與既有任務撞號 → 改為 UI-203；Android 更新的說法太肯定；沒有東西守住安全範圍 → 加測試；不同 Chromium 版本的輸出差異 → 寫在腳本開頭；`icon.svg` 部署在網站上 → 移到 `art-pipeline/`；單元測試的範例網址仍是 `make-icons.html` → 改名；深色桌布上圖示的邊緣看不出來 → 背景最暗處調亮（`#120a2e` → `#26135a`），星星改成三顆較大的。

- [x] **BUG-118** 1.41.14 之前加入的主畫面圖示，更新後頂部仍模糊（擁有者 2026-11-11 回報）
  - 現象：BUG-117A 時，擁有者更新到最新版後頂部仍模糊；刪掉主畫面圖示、從 Safari 重新加入後才正常。擁有者：要使用者重新加入才會好，是程式的 bug，要修正。
  - 原因：iOS 把 `apple-mobile-web-app-status-bar-style` 存在主畫面圖示裡（加入當時的值）。BUG-117 把 index.html 改成 `default`，但舊圖示仍以 `black-translucent` 開啟，而 BUG-117 的 CSS 只在不透明狀態列下有效（style.css 的註解已寫明）。頁面裡沒有任何 CSS 或程式能改這個設定：其他專案在 header 下方加留白，真機上只多了一條空白，模糊仍在狀態列（Folio #999 被 #1003 還原）。有一份 iOS 27 的回報說更新後完全關閉再開就會套用，多數回報則說只能重新加入。我們的 BUG-117A 步驟也把「完全關閉再開」放在更新之前，可能從沒在更新後重開過。
  - 完成（2026-11-11，v1.41.16）：
    - 新模組 `pwa/js/statusBarNotice.js`（INFRA-105，加入 SHELL）：以 `navigator.standalone` 與頂部 safe area（`--sat`；`default` 下為 0，BUG-118A 在真機確認）判斷仍是半透明狀態列的舊圖示（只看直向、螢幕短邊 475px 以下〔看螢幕不看視窗：iPad 的分割畫面可能很窄〕：BUG-117 的 header 蓋不滿 iPad，新圖示在 iPad 上不一定有效）。
      - 第一次：請使用者完全關閉再打開（含有 Home 鍵的 iPhone）；app 內的重新載入（更新橫幅）不算啟動，關閉前每次都提示。
      - 之後的啟動仍是半透明：請使用者重新加入主畫面，順序是「Safari 打開網址（出現「新版本已就緒」先重新整理，否則舊快取的頁面會再加入一個舊設定的圖示）→ 加入主畫面 → 打開新圖示確認頂部正常（已登入時確認紀錄都在；仍模糊就移除新的、在 Safari 重新整理後再加）→ 已登入時先在舊圖示連網打開、按「檢查同步」確認沒有還沒同步的資料（離線時新增的紀錄只在舊圖示裡；按下時讀待同步佇列，上傳失敗的也還在佇列裡，只有連線時佇列是空的才說可以移除）→ 最後才移除舊圖示（打開後還會出現提示的那個）」。橫幅只顯示標題與一行說明，步驟與舊圖示裡只存在這台裝置的資料（訪客的所有資料；已登入時的佐證照片、背景圖片、主題、今天的計畫與個人空間）在「怎麼做」裡。不依賴可能變動的同步狀態：使用者在新圖示裡確認。
      - 到了重新加入這一步，之後的重新載入也維持這一步（`readdShownAtMs`）；每一步按 ✕ 後不再出現；狀態列不透明時不顯示、也不清除記錄（單次讀到 0 不會讓關掉的提示重來）。標題以「頂部如果…」開頭（iOS 26.1 之前沒有模糊）。狀態存在 `orbit_status_bar_notice`。
    - `app.js`：`showMainApp()` 在 header 下方顯示（`#status-bar-notice`，`role="region"`，文字以 `textContent` 放入，✕ 44px）；是否登入看 `_currentSession` 或裝置上存的 session（`sessionPresence.js` 的 `hasStoredSession()`：快取開機時 `getSession()` 還沒回來，離線且 token 過期時 BUG-116 的 `getSession()` 約 25 秒後回傳沒有 session）；`_applyProDependentUi()` 時重畫，文字不變就不重建（不重唸、不丟失焦點）。`domActions.js` 加上 `dismissStatusBarNotice`。
    - 測試：`tests/unit/statusBarNotice.test.js`（22 個）；`tests/e2e/bug118-status-bar-notice.test.js`（7 個：舊圖示依序看到重開與重新加入、重新載入維持所在的步驟、關閉後不再出現；已登入的舊圖示在離線且 token 過期時仍顯示帳號的文字〔拿掉 `hasStoredSession()` 會失敗〕；不透明狀態列保留記錄；瀏覽器分頁、窄視窗的 iPad 看不到；用鍵盤關閉後焦點移到頁面；「檢查同步」依按下時的佇列回答，訪客沒有這個按鈕；320×568 打開「怎麼做」時橫幅自己捲動，按鈕與回答都拿得到〔拿掉高度限制會失敗〕）。
    - 審查（#243）：
      - Codex：P1 已同步的帳號仍有只存在裝置上的資料 → 一律提醒；P2 快取開機時先以訪客的文字顯示 → 重畫；P2 橫幅開著時新增的紀錄會讓「都已同步」變成錯的 → 不再聲稱同步狀態，改在新圖示裡確認。
      - 獨立審查：P1 離線且 token 過期時整段都是訪客的文字 → 以裝置上存的 session 判斷；P2 重新加入之後的重新載入回到「完全關閉」→ `readdShownAtMs`；P2 先刪後加可能刪了資料又加回舊設定的圖示（舊的 service worker 仍提供舊 HTML）→ 先加新圖示、確認後再移除舊的；P2 `app.js` 的接線沒有測試 → 已登入的 e2e。P3：橫幅太長 → 標題加一行、細節收在「怎麼做」；`role="status"` 重唸 → `region`；✕ 太小；iPad；iOS 26.1 之前；有 Home 鍵的 iPhone；只存在裝置上的資料列得更完整；單次讀到 0 清掉記錄 → 保留。
      - 獨立審查第二輪（bae6be5，前一輪全部修正）：P2 新的步驟少了「舊圖示裡還沒同步的紀錄」的保護（離線新增後直接去 Safari）→ 移除前先在舊圖示連網打開、確認沒有「離線中」或「同步暫停」；Codex 再指出 P2：只看沒有錯誤提示不夠（慢速連線時還在「同步中」）→ 改成「檢查同步」按鈕，依按下時的待同步佇列回答；P2：小 iPhone 上打開「怎麼做」會超出畫面且無法捲動 → 橫幅最高 55% 畫面、內容自己捲動。P3：App 切換器的開法；兩個同名圖示怎麼分；新圖示仍模糊時怎麼辦；iPad 改看螢幕短邊；關閉後焦點移到頁面。
    - BUG-117A 的步驟改寫為 BUG-118A（Next）。

- [x] **BUG-117A**（擁有者）真機確認 BUG-117 的修正
  - 結果（2026-11-11）：更新到最新版後頂部仍模糊，重新加入主畫面後正常 → BUG-118。底部導覽列與狀態列顏色的檢查移到 BUG-118A。

- [x] **PRO-014H** Production Pro entitlement client cutover
  - 目標：把 `REPO_PRO_ENTITLEMENT_SOURCE` 由 `legacy` 切到 `server`，讓 production 的 `isProUser()` 實際改用 server-derived UI projection
  - 範圍：repo 常數變更、付費／非付費／trial／離線／切換帳號的實機驗證、rollback 程序；不含新功能
  - 完成條件：切換後付費使用者維持 Pro、非付費不會誤授權、離線在 grace window 內維持、超出後 fail closed
  - （2026-11-11 前的計畫，已由下方「完成」取代：相容層先保留，回退見 `docs/pro-014h-cutover.md` §4）**rollback 是「旗標＋相容層」兩件事，不能只切回 `legacy`**：本任務會移除 `PRO-014C` 的 legacy 寫回相容層，而 `legacy` gate 的 `isTrialUser()` 只讀 `user.trialStartedAt`。若只把旗標切回 `legacy` 而不還原相容層，trial 使用者會直接失去 Pro —— rollback 本身變成一次故障。演練與記錄需涵蓋兩者同時還原。
  - **前置：`PRO-014J` 完成（因此 C／D／I 皆已完成且 client 已上線），以及 `PRO-014L`、`PRO-014P` 完成。** 依 AGENTS.md §3 高風險規則，production rollout 需另行取得明確核准
  - **為什麼 `PRO-014L` 是前置**：SUB-16 連勝解鎖目前在 client 端寫 `state.user.isPro`。切到 `server` source 後那個寫入不再有任何效果，連勝解鎖會靜默失效 —— cutover 不該挾帶一個功能迴歸。
  - （已取代，改列 PRO-014HB）一併移除 `PRO-014C` 建立的 legacy 相容層（client 寫回 `trial_started_at`）—— cutover 後 legacy gate 不再被使用。**移除與旗標切換應在同一次變更內**，rollback 時也一起還原。
  - 依賴：`PRO-014J`、`PRO-014L`、`PRO-014O`（已於 v1.25.5 完成：cached-user 啟動也會 refresh projection）、`PRO-014P`（**擋 cutover**；2026-11-01 完成，#221）；`PRO-014Q` 已完成（2026-10-31），實機驗證使用 [`docs/pro-test-accounts.md`](docs/pro-test-accounts.md) 的 5 個測試帳號，測試前先重跑其中的 SQL。
  - 前置 `PRO-014RA`（014 套用到 production）：**已完成**（2026-11-01）。`server` source 下終身付費不再被試用日期限制。
  - **cutover 前（PRO-014L）**：再跑一次 012 的回填（L2 普及前舊版 client 仍以 profile 發放 SUB-16，回報的筆數是新標記的帳號）；並查 profile 顯示 SUB-16 還有效、但 server 的付費授權沒有涵蓋到同一天的帳號（查詢見 `docs/pro-014l-streak-unlock-server.md` §7），由擁有者決定。L2 的 legacy 寫回與 PRO-014C 的相容層一起移除；`showMainApp()` 處理 `FLAG_STREAK_UNLOCK_NEW` 的舊版相容（只有 1.41.13 以前快取的 `dayCycle.js` 會設這個旗標）也一起移除。
  - **切換前要決定核准名單**（2026-10-31 發現）：PRO-014I 套用 011 時核准名單為 0 筆，沒有把 legacy 的 Pro 搬到 `pro_entitlements`。專案擁有者自己的帳號在 `profiles` 是終身 Pro（`is_pro = true`、`pro_expires_at` 為 NULL），但 `pro_entitlements` 沒有資料列；切到 `server` source 當天就會失去 Pro。切換前要由擁有者決定哪些帳號列入核准名單並寫入 `pro_entitlements`。
  - **核准名單已寫入並對帳（2026-11-02）**：
    - 決定（2026-11-01，使用者）：只有專案擁有者的主帳號，授權為終身。
    - 覆核：擁有者以只讀查詢確認帳號（1 列，`profiles.is_pro = true`、`pro_expires_at` 為 NULL），agent 覆核 UUID、授權類型與到期日。
    - 寫入：擁有者在 SQL Editor 執行，寫入前有三道檢查（email 恰好 1 個帳號、UUID 與覆核的一致、`pro_entitlements` 尚無資料列），任一不符就中止且不寫入。
    - 寫入內容：`is_pro = true`、`pro_expires_at = NULL`、`trial_started_at = NULL`。來源是擁有者的核准，不是 profile 的欄位；profile 的試用起點不搬移。
    - 對帳：以該帳號身份呼叫 `my_pro_status()`，結果 `is_active = true`、`expires_at = NULL`、`trial_ends_at = NULL`，即終身付費。
    - 紀錄（依 `docs/sub-14-leaderboard-pro.md` 的對帳規則）：核准 1 筆、成功 1 筆、拒絕／重複 0 筆，執行人為專案擁有者。email 與 UUID 不寫進 repo。
    - 撤回：刪除該帳號在 `pro_entitlements` 的資料列。`legacy` source 下這筆資料沒有作用，切換到 `server` 後才生效。
  - In progress（2026-11-11）：使用者回覆「ok 核准」，BUG-117（#237）合併後開始（Backlog → In Progress）。
    - 只讀檢查（2026-11-11，Supabase connector，只看筆數）：`profiles.streak_unlock_used` 0 筆，012 回填重跑會新標記 0 筆、提案 §7 的不一致帳號 0 筆——這次不需要任何寫入（cutover 前若有變再跑一次）。8 個 profile 中，legacy 規則（`is_pro_active()` 套在 profile 欄位上，client 的試用也是 15 天）與 server 規則各有 4 個有效；切換後失去權限 0、多出權限 0。`profiles.is_pro` 6 筆與 server 4 筆的差是已過期的 Pro。
    - 做法（同一個 PR）：`REPO_PRO_ENTITLEMENT_SOURCE` 改為 `server`；移除兩個 legacy 相容層（`startTrial()` 寫回 `profiles.trial_started_at`、`grantStreakUnlock()` 把 SUB-16 寫回 profile 的 `isPro`／`proExpiresAt`）與 `showMainApp()` 的 `FLAG_STREAK_UNLOCK_NEW` 處理（實作時改為保留，見下方「完成」）；測試改為以 `server` 為預設；rollback 程序（旗標、相容層與期間資料一起還原）寫進文件。
    - 部署後：擁有者以 `docs/pro-test-accounts.md` 的 5 個測試帳號做真機驗證（先重跑該文件的 SQL）。
  - 完成（2026-11-11，v1.41.15，#238）：
    - `REPO_PRO_ENTITLEMENT_SOURCE` 改為 `server`：Pro 與試用的判定都讀 `my_pro_status()` 的 projection，profile 的 `is_pro`／`pro_expires_at`／`trial_started_at` 不再決定 Pro；裝置無法降回 `legacy`。
    - `db.startTrial()` 成功後立刻 `refreshProEntitlement()`：開機是先 refresh 再開始試用，沒有這一步新帳號要到下一次 refresh 才看得到試用（`legacy` 下由相容層掩蓋）。
    - **與原計畫不同：兩個 legacy 相容層與 `FLAG_STREAK_UNLOCK_NEW` 的處理先保留**（`docs/pro-014h-cutover.md` §3）。它們寫的是 server 的值，`server` 下不參與判定；開機「profile 沒有試用開始時間才呼叫 `start_trial()`」與設定頁的試用進度條還在用試用開始時間；保留後回退時期間的試用與 SUB-16 都在 profile 裡（回退前仍要以只讀查詢對帳：直接改 `pro_entitlements` 或舊裝置蓋回 profile 的情況不會出現在 profile）。移除改列 `PRO-014HB`。
    - 回退程序與真機驗證步驟：`docs/pro-014h-cutover.md`。
    - 測試：預設改為 `server`；legacy 的測試保留為「回退路徑」，以 mock `isServerProEntitlementEnabled()` 強制（`storage.test.js`、`pro014pRollover`、`proEntitlementGate`、`proGateCallSites`、`proSettingsProjection`、`proTrialRpc`）；新增「profile 欄位在 server 下不算 Pro」「預設不需裝置設定」「開始試用後立刻是 Pro」「start_trial 失敗不 refresh」（拿掉 refresh 時兩項失敗）；`streakUnlock.test.js` 的已知 Pro 改由 snapshot 決定；e2e 的 Pro 使用者改以 `seedProSnapshot()` 寫入 projection（隨機主題、成長報告 PDF）。
    - 審查（#238）：Codex 沒有問題。獨立審查沒有 P1；P2：app 留在記憶體超過 24 小時會在線上失去 Pro → 新模組 `pwa/js/proResume.js`（INFRA-105，加入 SHELL），回到前景時上次結果超過一小時（或沒有）就 refresh；P2：隨機主題與試用到期提示只在 refresh 之前跑 → `_applyProDependentUi()` 在三條 refresh 路徑之後重跑（換日補做、隨機主題、試用提示、header、頁面）。P3：`startTrial()` 只替同一帳號 refresh、拋錯不影響結果；回退程序加上對帳、改為改旗標並 bump 而非 revert；更新後第一次離線開啟與開發者殘留資料列入 PRO-014HA；一項 legacy 檢查原本在 server 下空跑（補上 `proSource.legacy`）；新增 server 下 SUB-16 發放後是 Pro 的測試。各新測試在拿掉對應修正時都會失敗。

- [x] **BUG-117** iPhone 上 header（頭像、名稱、XP／能量條）被模糊蓋住（擁有者 2026-11-04 回報，附截圖）
  - 現象：排行榜頁最上方從狀態列往下約到 header 底部，內容被由上而下漸弱的模糊蓋住；下面的內容清楚。`modern` skin（`data-ui-skin`）的深色畫面。
  - 已查（2026-11-04）：`#header`（`modern` skin：`padding: calc(env(safe-area-inset-top) + var(--space-3)) …`）預設沒有 `backdrop-filter`（只有設定背景圖〔`html.has-bg`〕或 liquid-glass 主題時才有），而且 `backdrop-filter` 只模糊元素後面的東西，不會模糊 header 自己的內容；app 沒有其他蓋在 header 上的模糊層。推測是 iOS 在狀態列底下的模糊（scroll edge effect），而 header 的一部分在那個範圍內，尚未確認。
  - 擁有者回答（2026-11-11）：從主畫面圖示開（standalone）；iOS 已更新到最新仍一樣；不確定何時開始；每一頁都一樣（最上面是同一個置頂的狀態列），捲動也一樣。
  - 原因（2026-11-11 查）：iOS 26.1 起，主畫面 web app 用 `apple-mobile-web-app-status-bar-style=black-translucent` 時，系統會在頁面最上方約 40pt 疊一層由上而下漸弱的模糊（Liquid Glass 的 scroll edge effect），頁面無法關掉；`black-translucent` 會讓 WebKit 不做頂部的顏色延伸（顏色延伸就是 WebKit 跳過這層模糊的條件）。沒有 Apple 文件，依據是多個專案的回報與一個真機確認（nesquena/hermes-webui#8365：改成 `default`、把不透明的標題列設為 sticky 後，從主畫面重開不再模糊）。
  - In progress（2026-11-11）：擁有者回答後開始（Backlog → In Progress）。做法：狀態列改為 `default`（頁面從不透明的狀態列下方開始）；在 iOS 的主畫面 app 裡讓 `#header` 為 sticky、不透明、沒有 `backdrop-filter`，當作頂部的顏色來源。需要擁有者在真機確認；iOS 可能在加入主畫面時記住狀態列樣式，舊的圖示也許要刪掉重加。
  - 完成（2026-11-11，v1.41.14，#237）：
    - `pwa/index.html`：`apple-mobile-web-app-status-bar-style` 由 `black-translucent` 改為 `default`。app 從不透明的狀態列下方開始，`env(safe-area-inset-top)` 變成 0，header 的上方留白自動縮回；`viewport-fit=cover` 保留（橫向的左右 safe area）。
    - `pwa/assets/style.css` 最後的 BUG-117 區塊，只在 iOS 的主畫面 app（`@media (display-mode: standalone)` 加 `@supports (-webkit-touch-callout: none)`）生效：`#header` 為 `position: sticky; top: 0`（`#main-app` 不捲動、`<main>` 才捲動，所以版面不變）、`z-index: 2`（WebKit 以忽略 pointer-events 的點擊測試在頂端找固定／sticky 的元素；一直存在的時段色調 `body::after` 是全螢幕 fixed、z-index 1，沒有這一行會先被找到）、背景不透明（modern 用 `--modern-bg`、liquid-glass 用 `--bg`、其他主題用 `--surface`）、沒有 `backdrop-filter`、隱藏 `::before`／`::after` 的光澤。header 因此不再有 3–13% 的時段色調。WebKit 接受寬度達 90% 的元素，430px 的欄寬在約 475px 以下的手機都夠；iPad 上 header 較窄，模糊可能還在。瀏覽器、Android 與桌面不變。
    - 新模組 `pwa/js/appHeight.js`（INFRA-105，加入 SHELL）：`--app-height` 原本是可視高度加上底部 safe area（`--sab`，舊的 `black-translucent` 下 iOS 主畫面 app 量到的高度少了這一段）。狀態列改為 `default` 後，其他專案量到 `innerHeight` 就是螢幕減狀態列、已到底部，再加 `--sab` 會把底部導覽列的 home indicator 留白推出畫面（body 隱藏溢出）。所以 iOS 主畫面 app（`navigator.standalone`）且上方 safe area 為 0 時不加；其他情況（瀏覽器、Android、仍以 translucent 開啟的舊圖示）不變。沒有真機量測，是依其他專案的回報推定，BUG-117A 要確認。
    - 測試：`tests/e2e/bug117-ios-header.test.js`：狀態列只有一個 `default`；iOS 以外 header 維持 static；以 iOS 主畫面 app 的條件提供 `style.css`（規則留在檔案中的原位置），14 個主題 × 兩種 skin × 有無背景圖 × 四個時段全部是 sticky、不透明、沒有背景圖、沒有 backdrop filter、沒有 `::after`，而且頂端的點擊測試（強制 pointer-events）找到的是 header（拿掉 `z-index: 2` 時 224 種組合都找到 `BODY`）。`tests/unit/appHeight.test.js`：三種情況的高度與接線。Chromium 不會畫 iOS 的模糊，是否真的消失要真機確認（BUG-117A）。
    - 審查（#237）：Codex 沒有問題；CI 的 lint 失敗（e2e 在頁面中的 `getComputedStyle` 被當成 Node 全域）以 `window.getComputedStyle` 修正。獨立審查 P1：時段色調層讓 WebKit 找不到 header → `z-index: 2`；P2：`--app-height` 加 `--sab` 在 `default` 下可能溢出 → `appHeight.js`；P2：測試改為原位置的規則與點擊測試；P3：拿掉 `#app` 的滿版（90% 已足夠），`theme-color` 列入 BUG-117A 檢查。


- [x] **PRO-014L2** client 改走 `grant_streak_unlock()`（新模組，INFRA-105）
  - 依提案 §5.3：只在本機連勝 ≥ 45、遠端載入與 Sessions 上傳之後詢問（`loadAndStart()`、cached-user 背景同步、連線恢復同步）；依 `paid_active` 寫回 legacy profile，只延長、不縮短、不取消；刪除換日裡的 SUB-16；訪客的進度條改為「需要登入帳號」；測試與 bump。
  - 依賴：`PRO-014LA`（**012 必須先在 production**，否則 legacy 下 SUB-16 失效）。
  - 2026-11-10：PRO-014LA 完成（012 已在 production），可以開始，移入 Next。
  - In progress（2026-11-10）：#234 合併後開始（Next → In Progress）。依提案 §5.3（使用者核准 §10，全部照建議）。
  - 完成（2026-11-10，v1.41.13，#235）：
    - `db.grantStreakUnlock(userId, getUser)`（`storage.js`，既有物件的新方法）：呼叫 `grant_streak_unlock()`，嚴格驗證回傳（只接受一列；status 在四種之內；`granted` 與 status 一致；`paid_active` 為 true 時 `is_active` 必為 true；`granted` 必為付費且有期限與時間；`already_granted` 必有標記時間；時間欄位必須能解析），不符合就不採用。`granted`／`already_granted` 時寫 `streakUnlockUsed = true`；`paid_active` 為 true 時把 legacy profile 的 Pro 延長到 server 的期限（profile 已是終身、或已是 Pro 且期限更晚時不寫；免費 profile 的 `proExpiresAt` 也是 null，只有 `isPro === true` 時沒有期限才算終身；server 是終身時寫終身），永遠不寫 `isPro = false`、永遠不看 `is_active`。回應回來之後才以 `getUser()` 取目前的 `state.user`、直接修改再 `storage.saveUser()`，記憶體與儲存一致（請求期間同步換掉了 profile 時，寫到新的 profile、保留同步的變更；改了帳號或登出時不寫）。之後 `refreshProEntitlement()`（legacy 下 no-op）。回報 `recovered`：付費的 `already_granted` 而本機原本不知道。
    - 新模組 `pwa/js/streakUnlock.js`（INFRA-105，加入 SHELL）：只在已登入、本機連勝 ≥ 45、`streakUnlockUsed` 為 false、Pro 狀態不是 `pro`（`unknown` 也問）時詢問；`not_eligible`／`active_entitlement` 依 owner 記住當天（`orbit_streak_unlock_asked`），隔天才再問；但還有 Session 等著上傳時不記住 `not_eligible`（server 還沒看到那幾天，上傳的那次同步會再問；`active_entitlement` 與 Session 無關，照樣記住）；失敗不記住；同一 owner 的並行詢問共用一個請求；`granted` 或 `recovered` 時更新畫面並顯示原本的慶祝視窗；`db.grantStreakUnlock` 不存在（新舊版本混用）時不做事。
    - `app.js` 的三個位置（遠端載入與 Session 補傳之後）：`loadAndStart()`（`bootWithLocalState()` 之後、等 `loaded.backfilled`；BUG-106 的第二次開機只有這裡）、cached-user 背景同步（`_reportSyncResult()` 之後）、連線恢復同步（同上）。不在開機的第一次 `bootWithLocalState()` 詢問。
    - 刪除 `processYesterdayStreak()` 的 SUB-16 區塊：換日不再有任何 client 端的 Pro 寫入。`FLAG_STREAK_UNLOCK_NEW` 與 `showStreakUnlockModal` 保留 export（INFRA-105：移除既有 export 也會讓混用的舊模組載入失敗）。
    - 訪客：新模組 `pwa/js/sessionPresence.js` 的 `hasStoredSession()`（讀 Supabase client 的 session key，同排行榜；只 import supabase.js，避免 router → 頁面 → dayCycle 的循環）。設定頁與個人頁的「連勝解鎖 Pro」對沒有 session 的人顯示「需要登入帳號」。
    - 測試：`tests/unit/streakUnlock.test.js`（41 項：寫回規則〔免費 profile 發放、回應遺失後補上並 `recovered`、試用中回填的帳號不變終身、付費到期不取消、終身不縮短、期限更晚不縮短／較早延長、server 終身寫終身〕、拒絕與錯誤不寫、9 種不合規回傳、多列、別的帳號、詢問條件、當天記住與隔天再問、並行合併、登出時不更新、混用版本、訪客判斷；審查後加上：有 Session 待上傳時不記住 `not_eligible`、請求期間 profile 被換掉、回應後換帳號〔profile 已換／未換〕、記憶體中是別人的 profile、回應後登出；每項都在拿掉對應的修正或檢查時失敗）；`appBootSequence.test.js` 4 項（補傳完成後才詢問、BUG-106 路徑在換日之後、離線不問而連線恢復後才問、補傳前登出不問；把詢問移到補傳之前的突變會失敗）；`pro014pRollover.test.js` 的 SUB-16 項目改寫為換日不發放、不消耗；`proGateCallSites.test.js` 改為除 `storage.js` 外沒有 client 端 Pro 寫入；`profile.test.js`／`settings.test.js` 加訪客情境。
    - 審查（#235）：Codex 2 項 P2（待上傳時記住拒絕、寫回到舊的 profile 物件）於 ee304a5 修正；獨立審查沒有 P1，P2（回應後換帳號的測試）與註解於 1ada380 補上（`dayCycle.js`／`proRollover.js` 的 SUB-16 說明、`showMainApp()` 的 `FLAG_STREAK_UNLOCK_NEW` 標為舊版相容、隨 PRO-014H 移除）。Codex 複審沒有問題。


- [x] **PRO-014L** SUB-16 連勝解鎖改由 server 授權
  - 目標：45 天連勝換 30 天 Pro 的授權由 server 發放，而不是 client 自行寫入
  - 現況（`PRO-014C` 實作時發現）：`pwa/js/dayCycle.js` 直接寫 `state.user.isPro = true` 與 `proExpiresAt`，再經 `saveUser()` 同步上雲。這是 client 決定的 Pro 授權 —— 與 `startTrial()` 原本的問題同一類，只是沒被 `PRO-014C` 的範圍涵蓋。
  - **在 `server` source 下會直接失效**：`isProUser()` 改讀 projection 後，寫 `state.user.isPro` 不再有任何效果，連勝解鎖等於靜默消失。因此這項必須在 `PRO-014H` cutover 前完成，否則就是一個功能迴歸。
  - 範圍：新的 `grant_streak_unlock()` RPC（migration 變更）、`dayCycle.js` 的授權路徑、once-per-account 的 server 端強制、相關測試
  - 完成條件：同一帳號無法重複領取；連勝條件由 server 驗證而非 client 傳入；`server` 與 `legacy` 兩種 source 下都正確
  - **前置：屬 RPC／schema 變更，依 AGENTS.md §3 需先取得核准**。（原本「與 `PRO-014I` 的 production 套用一併規劃」已過時：011 已套用；改依提案 §5 的 L1／LA／L2。）
  - 依賴：`PRO-014C`
  - In progress（2026-11-02）：使用者同意先寫提案（只寫文件，不改程式碼、不動資料庫）。草稿 PR #154（2026-09-01，另一個工作階段）以 v1.25.2 為基礎，提案對照目前的 main 檢視它的設計。從 Backlog 移入 Next，再移入 In Progress。
  - 提案（2026-11-02，#224）：[`docs/pro-014l-streak-unlock-server.md`](docs/pro-014l-streak-unlock-server.md)。**使用者核准 §10**（#226 的工作階段記錄 2026-11-02 的回覆「可以照你建議」；2026-11-04 在本工作階段再次確認「PRO-014L 可以照建議」）：拆成 L1／LA／L2；資格維持「任何一段 45 天」、client 只在連勝 ≥ 45 時詢問；回填已用過的帳號；訪客不再有 SUB-16、進度條改為「需要登入帳號」；L1 合併後關閉 #154。拆成 PRO-014L1（Done，#226 實作、#233 合併）、PRO-014LA（Done，2026-11-10，#234）、PRO-014L2（Next）。
    - 實測：#154 的 012 在本機（production 已有的相關 migration，含 013、014）可以套用。另外確認：資格是「歷史上任何一段 45 天」；不符合也會建立資料列；與 014 配合正確。獨立 review 另發現 #154 在「已領過」時把 `is_active`（含試用）寫回 legacy 的 `is_pro`，會授予終身或取消 Pro。
    - **2026-11-04 使用者核准 §10（全部照建議）**，見 Next 的 2026-11-04 核准。
    - 建議：保留 #154 的 SQL 主體（含 `date <= current_date`），只加回填已用過的帳號；拆成 L1（migration 012＋ASSERT 測試）→ LA（擁有者套用）→ L2（client 改走 RPC，新模組，INFRA-105）；只在本機連勝 ≥ 45 時、遠端載入之後詢問（同 PRO-014P 的三個補做位置）；RPC 多回傳只代表付費的 `paid_active`，`granted`／`already_granted` 依它寫回（只延長、不縮短、不取消，回應遺失後重試可補上）；訪客不再有 SUB-16；L1 合併後關閉 #154。
  - 完成（2026-11-10）：L1（#233）、LA（2026-11-10 擁有者套用，#234）、L2（#235，v1.41.13）。PRO-014H cutover 前仍要再跑一次 012 的回填並比對 profile 與 server 的付費（見 PRO-014H 與提案 §7）。


- [x] **PRO-014LA** 在 production 套用 012（專案擁有者執行）
  - 依提案 §5.2：套用前確認（函式與欄位不存在、trigger 與 011 相同並存下、回填的預期筆數）→ `begin;`＋012＋測試＋`rollback;` 乾跑 → 正式套用（`begin;` 後先 `LOCK TABLE public.pro_entitlements IN EXCLUSIVE MODE;` 再計數）→ 檢查權限、`SECURITY DEFINER`、`search_path`、owner、回填筆數、`pro_entitlements` 中 `is_pro` 為 true 與有試用起點的筆數在套用前後不變（在套用的同一個 transaction 內比對，不同就中止）、擁有者帳號的 `my_pro_status()` 仍為 `true／NULL／NULL`（DO block）→ 再跑一次 ASSERT 測試 → 以只改文件的 PR 記錄。
  - agent 不具 production 權限；每一步提供完整 SQL，擁有者執行並截圖。
  - 依賴：`PRO-014L1`。擋：`PRO-014L2`。
  - 2026-11-04：L1（#233）合併後即可執行，移入 Next。
  - 完成（2026-11-10，擁有者在 Supabase SQL Editor 執行；agent 提供每一步的 SQL，並先在本機 PostgreSQL 16 完整演練）：
    - 步驟 0（套用前確認）：`grant_streak_unlock()` 不存在、`streak_unlock_granted_at` 不存在；`profiles.streak_unlock_used = true` 0 筆（回填預期 0）；`pro_entitlements` 中 `is_pro` 4 筆、有試用起點 5 筆。
      - `set_pro_entitlement_updated_at()` 的 `md5(prosrc)` 是 `bb45d52b0e23f6e3d6ddce483699877c`，不是 repo 011 的 `e25d391b8488c3ca1022a27f28bfadaa`：正好是 011 那段本文改成 CRLF 換行的 md5（推測是當初貼上時帶入 CRLF），內容一字不差。012 以 `CREATE OR REPLACE` 換掉它；之後若以 `pro014l.rollback.sql` 回滾，還原後的換行取決於貼上的來源（repo 檔是 LF），行為相同；比對 md5 前先把 `\r\n` 換成 `\n`。
    - 步驟 1（`begin;`＋012＋`pro014l.test.sql`，測試結尾的 rollback 一併還原）：Success。SQL Editor 因測試的暫存表跳出「建表沒有開 RLS」的確認，選 Run without RLS（暫存表只存在該連線、rollback 時消失；012 本身不建表）。
    - 步驟 2（`begin;` → `lock table public.pro_entitlements in exclusive mode` → 存下 `is_pro`／試用筆數與回填預期 → 012 → DO block 比對 → `commit;`）：Success。
    - 步驟 3（套用後）：anon 不可執行、authenticated 可執行；`SECURITY DEFINER`；`search_path=""`；owner `postgres`；authenticated 不能 UPDATE `streak_unlock_granted_at`；已標記 0 筆（與回填預期相同）。
    - 步驟 4（rollback）：每個 `is_pro` 且沒有到期日的帳號（擁有者主帳號依 PRO-014H 為終身，因此在內）以本人身分呼叫 `my_pro_status()` 仍為 `true／NULL／NULL`：Success。
    - 步驟 5（`pro014l.test.sql` 原樣，結尾 rollback）：Success。
    - `012` 開頭的「執行日期」已改為 2026-11-10。PRO-014L2 移入 Next。
    - agent 另以 Supabase connector（2026-11-10 起可用）唯讀查詢 production 覆核：步驟 3 的七項全部相同；套用後 `set_pro_entitlement_updated_at()` 的 `md5(prosrc)` 是 `ea7112f4e63d6d8b85620457c785baf8`，即 012 那段本文的 CRLF 版本（內容與 012 相同）。

- [x] **PRO-014L1** migration 012（`grant_streak_unlock()`、一次性標記、`paid_active`、回填）與 ASSERT 測試，不改 client
  - 依提案 §5.1。沿用 #154 的資格、鎖、一次性、30 天、試用中不消耗；加 `paid_active` 與回填。
  - 完成條件：本機 PostgreSQL 依 production 的相關 migration 套用後，012、`tests/database/pro014l.test.sql`、回滾、重套都通過；改壞關鍵條件時測試會失敗；SQL 契約測試鎖住權限、輸入面、`paid_active` 與回填只寫標記。
  - 不改 `pwa/js`，不需要 bump。屬 schema 變更，已由提案核准實作；production 套用另立 `PRO-014LA`。
  - In progress（2026-11-02）。
  - 完成（2026-11-02，#226；2026-11-04 由本工作階段帶到目前的 main，#233）：
    - `pwa/db/012_streak_unlock_server.sql`、`tests/database/pro014l.test.sql`（ASSERT）、`tests/database/pro014l.rollback.sql`、`tests/unit/streakUnlockSql.test.js`、`docs/pro-014l-local-validation.md`（從 #154 帶入並加註記）。
    - 本機 PostgreSQL 16：套用 001、002、004、005_profiles_extra_cols、006–009、011、013、014 後套用 012（先建 2 個已用過 legacy SUB-16 的帳號、終身的擁有者、免費帳號：回填只標記那 2 個，擁有者的 `my_pro_status()` 仍為 `true／NULL／NULL`）；測試通過且沒有留下資料；重套、回滾、回滾後重套再測都通過。
    - 測試涵蓋：權限（含欄位層級）、未登入、17 種資格情境（含 B 任務、A 任務 invalid、非生產 XP、49 XP、整段 B 任務）、已領過與 `my_pro_status()`、付費已到期時 `paid_active` 為 false（已領過已到期、付費到期但試用中、終身＋已領過）、只對 fixture 重跑的回填、trigger、以 `authenticated` 身份呼叫。
    - 突變（DB 測試會失敗）：`already_granted` 或 `active_entitlement` 的 `paid_active` 不看到期日、`already_granted` 回傳含試用的 `paid_active`、門檻 44 天、拿掉 A／S、invalid、生產 XP、日期條件、XP 改 40、trigger 不看新欄位。資料列鎖與回填的語句由 SQL 契約測試鎖住（DB 測試重跑的回填必須與 012 的語句相同；migration 在 RPC 之外只能以這一句寫入 `pro_entitlements`）。
    - 獨立 review（#226，兩輪）：沒有 P1；P2（付費到期的 `paid_active` 未測）已補；P3 已處理（回填改為只更新尚未標記的資料列，重跑回報新標記的筆數，測試以 `GET DIAGNOSTICS` 斷言 2 筆、0 筆；migration 在 RPC 之外對 `pro_entitlements` 的寫入只允許回填這一句，含不寫 `public.`、`ONLY`、`TRUNCATE`、`MERGE` 的寫法；以 authenticated 呼叫後還原原本的角色；檔頭註明不含 BEGIN／COMMIT；回滾留下的資料列；LA 的筆數比對放在套用的 transaction 內；文件）。
    - lint、`npm test`（90 files／1503 tests）通過；不需要 bump。
  - 2026-11-04 重新驗證（#233，合併到目前的 main 之後；#226 的工作階段已不存在，使用者選擇由本工作階段接手）：
    - 本機 PostgreSQL 16（以最小的 Supabase 替身：`anon`／`authenticated`／`service_role` 角色、`auth.users`、從 `request.jwt.claim(s)` 讀取的 `auth.uid()`、Supabase 式的預設權限）依序套用 001、002、004、005_profiles_extra_cols、006–009、011、013、014。
    - 套用 012 之前建立 4 個帳號（2 個已用過 legacy SUB-16、其中 1 個有試用；終身的擁有者；免費）。套用後只有那 2 個被標記，`is_pro`、`pro_expires_at`、`trial_started_at` 不變；擁有者的 `my_pro_status()` 前後都是 `true／NULL／NULL`。
    - `pro014l.test.sql` 通過，前後 `auth.users`／`pro_entitlements`／`sessions` 筆數相同；重套 012、回滾（函式與欄位都已移除）、回滾後重套再測都通過。
    - 突變（測試都會失敗）：門檻改 44 天、`already_granted` 的 `paid_active` 改用含試用的 `is_pro_active()`、拿掉 `date <= current_date`。
    - lint、`npm test`（95 files／1536 tests）通過；`check-version-bump` 不需要 bump。
  - 獨立 review（#233）：沒有 P1。P2（核准日期寫成事實、PRO-014L 一行過時）已修。P3 也在套用前一併處理（012 尚未套用到任何地方）：
    - 資格以 `(now() AT TIME ZONE 'UTC')::date` 為界，不再用 `current_date`（跟著呼叫者的 `TimeZone`；review 實測 `Pacific/Kiritimati` 下 UTC 明天的第 45 天被發放）。
    - 發放的 `UPDATE` 加 `AND e.streak_unlock_granted_at IS NULL`，`NOT FOUND` 時回 `already_granted`：`FOR UPDATE` 之外的第二道防線。本機並行實測：拿掉 `FOR UPDATE`（並在 `UPDATE` 前 `pg_sleep`）時，有這個條件只發放一次，沒有時兩次都 `granted`。
    - DB 測試加 4 個情境（共 21）：某天只有 S 任務（發放）、某天的 A 是 recovery 不是 task（不發放）、娛樂剛好 120 分鐘（發放）、以 UTC+14 的 `TimeZone` 呼叫時 UTC 明天的第 45 天（不發放）；測試開頭 `set local timezone = 'UTC'`。突變（DB 測試都會失敗）：門檻 44、`already_granted` 的 `paid_active` 含試用、拿掉日期條件、改回 `current_date`（UTC 10:00 之後執行時）、`IN ('A')`、拿掉 `impact_type = 'task'`、`< 120`。
    - 回滾腳本：011 的函式本文逐字複製（prosrc 的 md5 與 011 相同），整份包在 `begin;`／`commit;` 內。
    - 提案 §5.2 第 3 步、PRO-014LA：套用前先 `LOCK TABLE … IN EXCLUSIVE MODE` 再計數（READ COMMITTED 下同一個 transaction 擋不住並行的 `start_trial()`）。

- [x] **INFRA-114** 去掉 CSP 的 `'unsafe-eval'`（INFRA-113 發現）
  - Pixi 8 以 `new Function` 產生 shader／uniform 程式碼，CSP 沒有 `'unsafe-eval'` 時拒絕啟動（Orbit Window 退回 poster）。Pixi 的 `pixi.js/unsafe-eval` 外掛可取代，但它是給全域 `PIXI` 的 classic script，要改 `scripts/vendor-pixi.mjs` 把它接到 ESM 的 class 上（它只改 class 的 prototype），而且 gzip 後 4,004 B，超過 PS-243 延後載入 JS 預算剩下的 2,223 B。
  - 2026-11-04 決定：放寬 JS 預算，去掉 `'unsafe-eval'`。
  - In progress（2026-11-04）：#231 合併後開始（Next → In Progress）。做法：`scripts/vendor-pixi.mjs` 另外產生 `pwa/vendor/pixi-unsafe-eval.js`（ESM：import vendored pixi，把外掛的 classic script 包在函式裡、以 pixi 的 export 作為它的 `PIXI`），runtime 載入 Pixi 時一起載入；PS-243 延後載入 JS 預算 300 → 304 KB；CSP 拿掉 `'unsafe-eval'`。
  - 完成（2026-11-04，v1.41.12）：CSP 的 `script-src` 只剩 `'self'` 與 PDF 的兩個 cdnjs 網址。
    - `scripts/vendor-pixi.mjs`（純函式在 `scripts/vendorPixiLib.mjs`）另外產生 `pwa/vendor/pixi-unsafe-eval.js`：`import * as pixi from './pixi.js'`，把 `pixi.js/dist/packages/unsafe-eval.min.js` 包在函式裡、以 `{ ...pixi }` 作為它的 `PIXI` 執行一次，不設全域。外掛用到的 17 個名稱都是 vendored pixi.js 的 export，修改的是同一批 class 的 prototype（shader、uniform、UBO 的 sync 產生器，`_unsafeEvalCheck` 改為不檢查）；外掛只修改它自己打包的 ParticleBuffer 副本，所以包裝後再把 vendored pixi 的 `ParticleBuffer.prototype.generateParticleUpdate` 換成外掛的 `generateParticleUpdatePolyfill`（與套件的 ESM 入口 `pixi.js/unsafe-eval` 相同；獨立 review 在瀏覽器實測：不換時 `ParticleContainer` 會被 CSP 擋下，換了之後正常）。app 目前沒有用 particle。外掛的格式改變時腳本拒絕產生。
    - `pixiSceneRuntime.js` 載入 Pixi 時一起載入外掛（`Promise.all`），外掛在任何 renderer 建立前執行；`sw.js` 的 SHELL 預先快取它（與 `pixi.js` 同一處）。
    - PS-243 延後載入 JS 預算 300 → 304 KB（311,296 B），baseline 另列外掛：V2 JS 79,728＋Pixi 225,428＋外掛 4,332＝309,488 B，剩 1,808 B。
    - 畫面：同一時段下，舊版（有 `'unsafe-eval'`）與新版的 Orbit Window canvas 截圖逐像素相同。
    - 測試：`tests/unit/pixiUnsafeEval.test.js`（vendored 檔＝腳本從已安裝的 pixi.js 產生的結果、格式改變時拒絕、外掛用到的名稱都有 export、import 後 prototype 被替換且沒有全域、runtime 與 SHELL 都載入它）、`csp.test.js`（`script-src` 沒有 `'unsafe-eval'`／`'wasm-unsafe-eval'`）、`tests/e2e/infra114-no-eval.test.js`（有外掛：場景 `ready`、沒有違規；場景以外的 Pixi 功能〔Text、BitmapText、Blur／ColorMatrix filter、MeshPlane、RenderTexture、ParticleContainer〕在 CSP 下都能 render、沒有違規，不換真的 ParticleBuffer 時 particle 這項失敗；外掛換成空的模組：違規 `script-src`／`eval`、場景退回 poster）、`infra113-csp.test.js`（各畫面與場景沒有違規）。

- [x] **INFRA-110A** 在 production 套用 015（`leaderboard_view` 只給已登入的使用者讀）
  - **需專案擁有者執行**：production 資料庫操作，Claude 不具權限。先讓 v1.41.9（遊客顯示登入提示）部署，再套用 015。順序相反時遊客會看到「無法載入排行榜」；順序正確時，還沒更新到 v1.41.9 的舊分頁或 PWA（INFRA-107：要等新的 service worker 接手）裡沒有快取的遊客也會暫時看到，更新後即改為登入提示。
  - 步驟（Supabase SQL Editor）：
    0. 確認 view 的擁有者：`select pg_get_userbyid(relowner) from pg_class where oid = 'public.leaderboard_view'::regclass;` 預期 `postgres`（若不是，REVOKE 不會生效，先回報）。
    1. 乾跑：`begin;` ＋ `015_leaderboard_view_grants.sql` 的內容 ＋ `tests/database/infra110.test.sql` 從第一個 `do $$` 到 `rollback;` 之前的內容 ＋ `rollback;`，預期 Success（任何 ASSERT 失敗會中止並顯示原因）。
    2. 套用 `015_leaderboard_view_grants.sql`。
    3. 檢查：`select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'public' and table_name = 'leaderboard_view' order by 1, 2;` 預期 `authenticated` 只有 `SELECT`，沒有 `anon`（`postgres`、`service_role` 不變）。
    4. 在 app 確認：登入的帳號看得到排行榜；遊客看到「登入帳號後才能看排行榜」。
  - 完成後在本項記錄執行日期與結果，並把 015 開頭的「執行日期」改為實際日期。
  - 依賴：`INFRA-110`
  - 完成（2026-11-04，擁有者執行〔步驟 1、2 在 Supabase SQL Editor〕；套用時 production 已是 v1.41.9 之後的版本）：
    - 步驟 1（乾跑：`begin;`＋015＋`tests/database/infra110.test.sql` 的 ASSERT＋`rollback;`）：Success. No rows returned。agent 給過完整版與精簡版，不確定擁有者跑的是哪一個；兩者都包含 `check_asserts` 的檢查、anon／authenticated 的 `has_table_privilege` 迴圈（anon 沒有 7 種權限的任何一種〔含經由 PUBLIC 的〕、authenticated 沒有 SELECT 以外的權限）、以 anon 讀取被拒、以 authenticated 讀取成功；精簡版不含 `role_table_grants`「沒有 PUBLIC／anon 的 grant」與欄位清單兩項。
    - anon 的權限 ASSERT 與 anon 讀取被拒都通過，代表以 postgres 執行的 REVOKE 確實生效（view 的擁有者若是 postgres 不能代為操作的角色，例如 supabase_admin，REVOKE 只會出現 WARNING，這兩項會失敗），所以步驟 0 未執行；view 的擁有者本身沒有查。
    - 步驟 2（套用）：Success。
    - 步驟 3 未執行（production 沒有查 `role_table_grants`）：實際權限由步驟 1 的 `has_table_privilege` ASSERT 與下面的 REST 檢查確認。
    - 步驟 4（在 app 確認）：未登入時在網站的 Console 以 anon key（只帶 `apikey` header）`GET /rest/v1/leaderboard_view?select=user_id&limit=1` → `401`，`{"code":"42501",…,"message":"permission denied for view leaderboard_view"}`；擁有者的帳號在 iPhone 上登入後照常看到排行榜。遊客畫面的登入提示沒有另外看（`tests/unit/leaderboard.test.js` 涵蓋）。
    - `015` 開頭的「執行日期」已改為 2026-11-04。

- [x] **INFRA-115A** 部署 v1.41.11 後確認成長報告 PDF（jsPDF 4.2.1 從 cdnjs 載入）
  - cdnjs 的檔案與 SRI 相符由 CI 的 e2e 確認（見 INFRA-115）；這一項是部署後在真的瀏覽器走一次完整流程。需要能連到 cdnjs 的環境：Claude 的工作環境連不到。
  - 步驟：以 Pro 帳號（或 `+orbit-paid` 測試帳號）在設定頁按「產生 PDF 報告」→「產生 PDF」，預期下載 PDF、沒有「PDF 產生失敗」。若失敗，瀏覽器 Console 會顯示 SRI 或 404 的錯誤，回報給 agent。
  - 或（不需部署）：`curl -fsS https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js | openssl dgst -sha512 -binary | openssl base64 -A` 應等於 `export.js` 中 `integrity` 的 `sha512-` 之後的部分。只看檔案開頭的版本註解不夠：重新壓縮的檔案也會保留它。
  - 依賴：`INFRA-115`
  - 完成（2026-11-04，由 CI 確認，不需擁有者操作）：#230 的 CI（head `a00ad05`）e2e 86 passed、沒有 skipped，其中只在 CI 執行的 `cdnjs serves the bytes the SRI names` 以網路取得 cdnjs 上的 jsPDF 4.2.1 與 html2canvas 1.4.1：都是 200、`Access-Control-Allow-Origin: *`、sha512 與 SRI 相同。瀏覽器中的完整流程（CSP、SRI、下載 PDF）由同一檔案的 e2e 以相同的檔案驗證。之後若實際產生 PDF 失敗，再回報。部署後的網站沒有實際產生過 PDF。

- [x] **INFRA-115** 升級成長報告 PDF 的 jsPDF（INFRA-113 發現）
  - `export.js` 從 cdnjs 載入 jsPDF 2.5.1：`npm audit` 列出 critical／high（`addImage` 的 ReDoS 與 DoS、Node.js 才有的檔案讀取、選用的 DOMPurify 的 XSS）。app 只在瀏覽器中把自己的 canvas 截圖交給 `addImage`，沒有用 `html()`，實際風險低。
  - 方向：改用 jsPDF 4.x（cdnjs 網址與 SRI、CSP 的 `script-src` 一起改，`csp.test.js` 會檢查一致），確認 API 變更與 PDF 輸出。
  - 2026-11-04 核准。
  - In progress（2026-11-04）：BUG-116（#229）合併後開始（Next → In Progress）。目標 jsPDF 4.2.1（npm 最新）。這個工作環境連不到 cdnjs，SRI 以 npm 套件的 dist 檔計算；同一方法算出的 2.5.1 與 html2canvas 1.4.1 的 hash 與 cdnjs 公布的 SRI 相同。
  - 完成（2026-11-04，v1.41.11）：`export.js` 改載入 `https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js`（SRI `sha512-plOdvi…`），`index.html` 的 CSP `script-src` 同步改；html2canvas 1.4.1 不變。
    - API：app 只用 `new jsPDF('p', 'mm', 'a4')`、`internal.pageSize`、`addImage(JPEG)`、`addPage()`、`save()`，4.x 都沒有變更；UMD 仍是 `window.jspdf.jsPDF`。jsPDF 4.2.1 與 html2canvas 1.4.1 都不使用 `eval`／`new Function`（INFRA-114 拿掉 `'unsafe-eval'` 不影響 PDF）。
    - `jspdf`、`html2canvas` 以精確版本列為 devDependencies，`npm audit` 只剩 INFRA-112 記錄的 eslint／minimatch（moderate）。
    - 測試：`tests/unit/exportPdfLibs.test.js`（`export.js` 的網址版本＝devDependency、SRI＝npm dist 檔的 sha512、用到的 API 在 4.x 存在）；`tests/e2e/infra115-pdf.test.js`（以 devDependency 的檔案回應 cdnjs 網址：60 筆打卡的報告下載為多頁的 A4 PDF（實測 3 頁）、`/Producer (jsPDF 4.2.1)`、沒有 CSP 違規；檔案與 SRI 不符時瀏覽器拒絕〔Console 的 integrity 錯誤〕、顯示「PDF 產生失敗」、不下載；只在 CI 執行的一項以網路取得 cdnjs 上的兩個檔案，比對 sha512 與 SRI、CORS header）。PDF 轉成圖片看過：統計卡、圖表、明細表正常。
    - cdnjs 上的檔案：這個工作環境連不到 cdnjs，改由 CI 確認：e2e 的 `cdnjs serves the bytes the SRI names` 只在 CI（`process.env.CI`）執行，以網路取得兩個網址，比對 sha512 與 SRI、`Access-Control-Allow-Origin: *`；之後每個 PR 也會檢查。在此之前的依據：cdnjs 從 npm 複製檔案，2.5.1 與 html2canvas 1.4.1 的 npm 檔 hash 都與 cdnjs 公布的 SRI 相同；4.2.1 在 npm 發布已約 7 個月（2026-03-17）。部署後實際產生一次 PDF 的確認另立 INFRA-115A；INFRA-115A 以該項「或（不需部署）」的方式結案（#230 的 CI 比對 cdnjs 的檔案與 SRI），部署後的網站沒有實際產生過 PDF。

- [x] **BUG-116** 離線且 token 過期時登出，Supabase 的 session 留在裝置上（INFRA-110 獨立 review 發現，原本就有）
  - 現象：`supabase.auth.signOut()` 在 token 過期又離線時約 25 秒後回傳 `AuthRetryableFetchError`，`sb-<project>-auth-token` 沒有被刪除（SDK 讀 session 失敗就提前結束）。app 照樣回到登入畫面，`storage.clearAll()` 只清 `yoyo_*`。之後以遊客繼續時，排行榜（INFRA-110 以這個 key 判斷是否登入）把它當成已登入，連上網後 refresh 成功會以剛登出的帳號查詢；下次啟動也會回到那個帳號。
  - 影響：只在同一台裝置，裝置上本來就有那個帳號的 refresh token，沒有資料外流；但「登出」沒有真正登出。
  - 方向：`signOut` 回傳錯誤時改用 `signOut({ scope: 'local' })` 或自行刪除本機的 session key。屬 auth 流程，實作前需核准。
  - 另：storage 寫入測試失敗時 supabase-js 把 session 只放在記憶體，key 不存在，已登入的使用者在排行榜會看到登入提示（少見，偏向隱藏資料）。
  - In progress（2026-11-04）：使用者核准（見 Next 的 2026-11-04 核准）。supabase-js 2.112.4 的原始碼：讀 session 失敗時 `signOut()` 不論 `scope` 都在刪除前就結束，所以 `scope: 'local'` 本身不夠，要先刪掉本機的 session key。
  - 完成（2026-11-04，v1.41.10）：`pwa/js/auth.js` 的 `signOut()`。
    - 連線時照舊呼叫 SDK 的 `signOut()`（同時在 server 撤銷 session）；回傳錯誤或 throw 時，從 SDK 自己的 storage（`supabase.auth.storage`，localStorage 不能用時是記憶體）刪除 `supabase.auth.storageKey`，再呼叫 `signOut({ scope: 'local' })`：沒有儲存的 session 時 SDK 不發 request，執行自己的清理（`-user` 與 PKCE 的 key、快取的 refresh 失敗、遞增 `_sessionRemovalEpoch` 讓同時進行中的 refresh 不會把 session 寫回）並發出 `SIGNED_OUT`。
    - `navigator.onLine === false`（`platform/network.js` 的 `isOnline()`）時不呼叫會等網路的那一次，直接走上面的本機清理：key 立即刪除；開著 app 時 token 才過期的情況，立即回到登入畫面（以前約 25 秒）。2.112.4 預設不使用 lock，進行中的 refresh 不會擋住它。
    - 例外：每個 SDK 呼叫都先等 `initializePromise`。離線打開 app、token 已過期時，client 啟動時的 refresh 也要重試約 25 秒，這段期間登出要等它結束才回到登入畫面（key 已先刪除，進行中的 refresh 不會寫回）。要不等它，得在 SDK 還沒發出 `SIGNED_OUT` 前就顯示登入畫面，之後再到的 `SIGNED_OUT` 會讓 `handleSignOut()` 清掉期間建立的遊客資料，所以不做。
    - 離線登出只結束這台裝置的 session（server 上的 refresh token 沒有撤銷，裝置上已刪除）；連線時照舊以 `scope: global` 結束所有裝置的 session。
    - `onLine` 為 true 但連不到伺服器時，仍要等 SDK 的 refresh 重試（約 25 秒）才登出；之後一樣刪除本機的 session。
    - 已知的窄窗（獨立 review）：離線登出時若有進行中的 refresh（啟動的遠端載入、自動 refresh），它會在登入畫面出現後繼續重試最多約 25 秒；期間恢復連線而 server **拒絕**這個 refresh token（400／500）時，SDK 會發出 `SIGNED_OUT`，若使用者已以遊客完成設定，`handleSignOut()` 會清掉這個新的遊客資料。需要同時發生數個條件（token 沒被撤銷，server 通常會接受，接受時 commit guard 丟棄新 token、不發事件），不另外處理。
    - 測試：`tests/unit/bug116SignOut.test.js`（真的 vendored client＋mock fetch：離線、連線但連不到伺服器〔fake timers 走完 SDK 的重試〕、連線成功、SDK throw、離線打開 app 後立即登出〔key 立即刪除，登出等啟動的 refresh 結束〕）；`tests/e2e/bug116-signout.test.js`（Chromium、真的 client；資料庫回 PostgREST 不重試的 500、其他 Supabase 請求擋下，等啟動的遠端載入失敗後 token 才過期、`context.setOffline(true)`：3 秒內回到登入畫面、key 被刪除、沒有任何 request）。兩者在修正前的 `auth.js` 上都會失敗。教訓：e2e 在遠端載入還在重試時讓 token 過期，重試會自己發出 refresh，2 個 worker 時約一半失敗；要先等遠端載入結束。
    - 未變更：上面「另」的情況（storage 寫入測試失敗時 session 只在記憶體）排行榜仍以 localStorage 的 key 判斷，已登入者會看到登入提示；登出本身已涵蓋記憶體的 storage。

- [x] **INFRA-110** `leaderboard_view` 的權限（AUDIT-001 發現）
  - 問題：Postgres 的 view 預設以擁有者的權限執行，不受 `profiles`／`sessions` 的 RLS 限制（`005_leaderboard.sql` 的註解「Views inherit table RLS by default」不正確）。view 只靠 `WHERE p.is_public = true` 限制列；migration 只 `GRANT SELECT ... TO authenticated`，但 Supabase 的預設權限（`ALTER DEFAULT PRIVILEGES ... TO anon, authenticated`）可能也讓 `anon` 讀得到，屆時未登入者可讀所有公開使用者的 `user_id`、名稱、XP、連勝、`created_at`、`avatar_url`。
  - 需要擁有者確認（agent 沒有連線正式資料庫）：在 Supabase SQL editor 執行 `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'leaderboard_view';`，看 `anon` 是否有 `SELECT`。
  - 方向（改 schema，需核准）：`REVOKE ALL ON leaderboard_view FROM anon, public`；考慮 `security_invoker = true`（需要另一條讓 authenticated 讀公開 profile 的 policy）或改為 `SECURITY DEFINER` RPC；是否還要回傳 `user_id`（目前只用來標示「你」，可改為回傳 `is_me`）。相關：PRO-014E。
  - **2026-11-02 使用者核准**（AUDIT-001 後的 AskUserQuestion，INFRA-110～113 全部核准，各自一個 PR）。
  - 順序：最後做；需要擁有者先在 Supabase 執行上面的查詢並提供結果（2026-11-03 使用者：之後提供）。
  - **2026-11-03 擁有者提供查詢結果**：`anon` 與 `authenticated` 都有 SELECT、INSERT、UPDATE、DELETE、TRUNCATE、REFERENCES、TRIGGER（Supabase 的預設權限），另有 `service_role`、`postgres`。確認未登入者只要有 anon key（公開在 `config.js`）就能以 `GET /rest/v1/leaderboard_view` 讀取。view 有 JOIN 與子查詢，不能被寫入，所以 INSERT 等實際上無效。
  - In progress（2026-11-03）：INFRA-113（#227）合併後開始（Backlog → In Progress）。
  - 完成（2026-11-03，repo 部分，v1.41.9；production 套用另立 INFRA-110A）：
    - `pwa/db/015_leaderboard_view_grants.sql`：`REVOKE ALL ON TABLE public.leaderboard_view FROM PUBLIC, anon, authenticated;` 後 `GRANT SELECT ... TO authenticated;`。只改權限，view 的定義與欄位不變；`service_role`、`postgres` 不變；可重複執行。
    - client（`pages/leaderboard.js`）：Supabase client 沒有儲存的 session（遊客）時顯示「登入帳號後才能看排行榜」，不查詢、也不顯示舊的快取。直接讀 client 的預設 key（`sb-<project>-auth-token`，測試檢查與 vendored client 一致），不用 `getSession()`：token 過期又離線時 `getSession()` 會先嘗試 refresh（約 25 秒）並回報沒有 session，已登入的帳號會被當成遊客（獨立 review 的 P2）。已登入時與以前相同（新的快取立即顯示）。以前遊客以 anon key 讀得到排行榜，015 之後會被拒絕。
    - 測試：`tests/database/infra110.test.sql`（ASSERT：authenticated 只有 SELECT、anon 與 PUBLIC 沒有任何權限；以 anon 讀取被拒、以 authenticated 讀取成功；view 的欄位與 010 相同）。在本機 PostgreSQL 16 以 Supabase 的預設權限重現擁有者查到的 grant（anon 讀得到公開的那一列），套用 015 前測試失敗、套用後通過，anon 讀取為 permission denied，authenticated 仍只讀到公開的使用者。Unit：`leaderboardViewGrantsSql.test.js`（migration 內容）、`leaderboard.test.js`（遊客、token 過期又離線的已登入帳號仍顯示快取、讀不到 storage 時照舊查詢、key 與 app 的 Supabase client 一致）。
    - 不在此變更：`user_id` 是否仍回傳（頭像路徑本身以 user_id 開頭）、`security_invoker`／RPC，見 PRO-014E。**PRO-014E 若以 DROP VIEW 重建 view，Supabase 的預設權限會再給 anon，要再執行 015**（015 開頭有註記）。
    - 獨立 review：在模擬 Supabase 角色（`supabase_admin`、`authenticator`、NOINHERIT 的 anon／authenticated、`postgres` 的預設權限）的 PostgreSQL 16 上跑 001–014，重現擁有者查到的權限；015 後 anon 被拒、authenticated 只讀到公開的使用者，乾跑步驟照字面在 SQL Editor 的方式可用。P2（離線過期 token 被當成遊客）已修正；P3 已處理（文件與註解、view 擁有者的檢查、部署順序的說明）。

- [x] **INFRA-113** 部署內容與 CSP（AUDIT-001 發現）
  - `deploy.yml` 上傳整個 `pwa/`，GitHub Pages 也公開 `pwa/db/*.sql`（migration）與 `pwa/server.cjs`。repo 本身是公開的，影響小；可改為上傳前排除。
  - `index.html` 沒有 Content-Security-Policy。可加 `<meta http-equiv="Content-Security-Policy">`，限制 script 只來自自己與 cdnjs、連線只到 Supabase，作為 XSS 的第二層防護。要先列出 app 用到的所有來源（Supabase、cdnjs、Pixi、data:/blob: 圖片），並以 e2e 確認。
  - 改部署設定，需核准。
  - **2026-11-02 使用者核准**（AUDIT-001 後的 AskUserQuestion，INFRA-110～113 全部核准，各自一個 PR）。
  - **2026-11-03 使用者決定**（AskUserQuestion）：嚴格的 CSP，先重構：把 `index.html` 的 22 個 `onclick`、JS 模板中的 10 個 inline handler 與 inline `<script>` 改為 `addEventListener`，CSP 的 `script-src` 只允許自己與 cdnjs，注入的 inline 程式碼不會執行。部署範圍（排除 `pwa/db`、`server.cjs`）與 `deploy.yml` 改用 Node 24 的 action 照原計畫。
  - In progress（2026-11-03）：INFRA-112（#225）合併後開始（Backlog → In Progress）。
  - 完成（2026-11-03，v1.41.8）：變更說明 [`docs/infra-113-csp.md`](docs/infra-113-csp.md)。
    - 頁面不再有 inline 程式碼：`index.html` 的 20 個 `onclick` 與 JS 模板的 8 個改為 `data-action`（新模組 `pwa/js/domActions.js`，只執行清單中的動作、只執行最內層的）；保護卡確認框的「取消」改為 `.onclick =`、重設密碼的顯示密碼改為 `addEventListener`；inline `<script>` 搬到 `pwa/js/swUpdate.js`（第一個 module script）。兩個新模組加入 SHELL；`app.js` 也 import `domActions.js`。
    - CSP（`<meta http-equiv>`）：`default-src 'self'`；`script-src 'self' 'unsafe-eval'` 加上 jsPDF 與 html2canvas 兩個檔案的完整網址（不是整個 cdnjs）；`style-src 'self' 'unsafe-inline'`；`img-src`／`connect-src` 只多 Supabase 主機（與 `config.js` 一致，測試檢查）；`worker-src`／`child-src 'self' blob:`（`child-src` 給 Safari 15.4）；`object-src 'none'`；`base-uri 'none'`；`form-action 'self'`。
    - `'unsafe-eval'`：Pixi 8 需要，去掉時 Orbit Window 退回 poster（已實測）。改用 Pixi 的外掛要超出 JS 預算，記為 INFRA-114。
    - `deploy.yml`：上傳前排除 `pwa/db/` 與 `pwa/server.cjs`（802 個檔案中上傳 787 個）；action 換成以 Node 24 執行的版本（`checkout@v5`、`configure-pages@v6`、`upload-pages-artifact@v5`、`deploy-pages@v5`）。部署只在合併後執行，合併後要確認 deploy 成功。
    - AGENTS.md §6：不可再加入 inline 程式碼，按鈕用 `data-action`；新的外部來源要一起改 CSP。
    - 獨立 review：沒有 P1／P2。P3 已處理：`app.js` 也 import `domActions.js`、`swUpdate.js` 提前、`child-src`、`router.js` 只查自己的 route（`navigate('__proto__')` 以前會丟錯誤）、測試更嚴格、`deploy.yml` 的複製方式、文件更正。仍在 v1.41.0 以前的 service worker 的使用者第一次開啟可能新 HTML 配舊 JS（部分舊模板按鈕無效），重新整理後正常，寫在變更說明 §3。
    - 測試：unit `csp.test.js`（10 項）；e2e `infra113-csp.test.js`（各畫面與 Pixi 場景沒有任何 CSP 違規；注入的 `onerror`／`onclick` 與清單外的 `data-action` 不執行，沒有 CSP 時失敗）。成長報告 PDF 以與 cdnjs 相同的檔案在 CSP 下一次性確認成功（SRI 通過、沒有違規）。

- [x] **INFRA-112** CI 加固與 Node 版本（AUDIT-001 發現）
  - `ci.yml` 沒有 `permissions:`，`GITHUB_TOKEN` 用 repo 預設權限；改為 `permissions: contents: read`（`deploy.yml` 已有）。
  - Node 20 → 22：vitest 1.6 有 critical 的 advisory（vitest、tinypool、vite、esbuild，只在開發與 CI，不會部署），修正版 vitest 5 需要 Node ≥ 22.12。升級 vitest 是 major，`environmentMatchGlobs` 等設定要改。GitHub Actions 也已警告 Node 20 的 action 將停用。
  - eslint 相關的 moderate advisory（minimatch、`@eslint/*`）一併看是否需要升級 eslint。
  - 改 CI 設定，需核准。
  - **2026-11-02 使用者核准**（AUDIT-001 後的 AskUserQuestion，INFRA-110～113 全部核准，各自一個 PR）。
  - In progress（2026-11-02）：INFRA-111（#223）合併後開始（Backlog → In Progress）。
  - 完成（2026-11-02；CI、測試與 devDependencies，不 bump）：
    - `ci.yml`：`permissions: contents: read`（artifact 用 runner 自己的 token）；Node 20 → 22；`actions/checkout@v5`、`actions/setup-node@v5`、`actions/upload-artifact@v6`（都以 Node 24 執行，消除 GitHub Actions 的 Node 20 停用警告；對 GitHub-hosted runner 沒有其他破壞性變更）。`deploy.yml` 的 action 留給 INFRA-113 一起改。
    - vitest 1.6 → 5.0.5、`@vitest/coverage-v8` 1.6 → 5.0.5：critical 的 advisory（vitest、tinypool、vite、esbuild）全部消失。`package.json` 加上 `engines.node`：`^22.13.0 || ^24.0.0 || >=26.0.0`（vitest 5 與 jsdom 29 兩者的需求：22.13 以上的 22.x、24.x，或 26 以上，不含 23、25）。
      - vitest 4 起移除 `environmentMatchGlobs`（vitest 3 已標為 deprecated）：原本列出的 18 個測試檔中 17 個在第一行加上 `// @vitest-environment jsdom`（`proofCapture.test.js` 原本就有），設定檔不再列。
      - vitest 4 起，arrow function 實作的 `vi.fn()` 不能以 `new` 呼叫：`ambientNoise.test.js` 的兩個 `AudioContext` mock 改為一般 function（獨立 review 發現第二個「建立失敗」的測試原本只因 V8 的 TypeError 訊息含有 arrow 的原始碼才通過）。
      - Unit 1493 全部通過，89 個檔案每個的測試數都與升級前相同（獨立 review 以 JSON reporter 逐檔比對）；e2e 80 通過；`npm ci` 從新的 lockfile 安裝成功。coverage 的數字改變（coverage-v8 4 起的量測方式不同，例如全部 Statements 96.7% → 91.9%，`utils.js` 82.4% → 65.9%），範圍與設定不變，也沒有門檻。
      - vitest 5 的預設 `clearMocks: true`：`appBootSequence.test.js` 一個 `toHaveBeenCalledWith` 以前會被前面測試留下的呼叫滿足，現在是真的檢查（獨立 review 發現，仍通過）。
    - eslint 相關的 moderate advisory（minimatch < 11.0.1，eslint 9 直接依賴，也經 `@eslint/config-array`、`@eslint/eslintrc`）**沒有修正**：最新的 eslint 10 仍用 minimatch 10，沒有可用的修正版；改用 eslint 10 還會帶來新的規則（`no-useless-assignment`、`preserve-caught-error`）要改 app 程式。只在開發與 CI 執行，glob 都是 repo 自己的設定，不受外部輸入影響。等 eslint 改用 minimatch ≥ 11.0.1 後再升級。
    - 文件：README 本地開發（Node 版本、測試指令、jsdom 的寫法）、`docs/test-plan.md` 的 `environmentMatchGlobs` 說明。

- [x] **INFRA-111** service worker 的圖片分支：下載時不用 HTTP cache 的舊檔（AUDIT-001 發現）
  - 問題：圖片走 cache-first，快取沒有時直接 `fetch(e.request)`。按需下載的素材（房間風格、裝飾、角色）若瀏覽器的 HTTP cache 還有上一版的同名檔（GitHub Pages `max-age=600`），會把舊圖存進這一版的快取，直到下一次 bump。JS／CSS 已改為 `cache: 'no-cache'`（INFRA-105／107）。
  - 方向：圖片快取沒有時也以 `cache: 'no-cache'` 取得（代價：每張圖第一次多一次 revalidation，304 時很小）。屬 service worker 的快取行為（部署行為），實作前附變更說明。
  - **2026-11-02 使用者核准**（AUDIT-001 後的 AskUserQuestion，INFRA-110～113 全部核准，各自一個 PR）。
  - In progress（2026-11-02）：AUDIT-001（#214）合併後開始（Backlog → In Progress）。
  - 完成（2026-11-02，v1.41.7）：變更說明 [`docs/infra-111-image-revalidate.md`](docs/infra-111-image-revalidate.md)。
    - `pwa/sw.js` 的圖片分支：快取中沒有時以 `fetch(e.request, { cache: 'no-cache' })` 取得（條件請求；GitHub Pages 的 ETag 每次部署都變，所以改版後通常重新下載一次），與 JS／CSS 相同；快取中有的照舊直接回傳。代價（變更說明 §3）：改版後 10 分鐘內、這一版還沒存過的圖，離線時改為顯示預設圖；poster 與 Pixi 同時要同一張圖時多一個請求。
    - 獨立 review：沒有 P1／P2；`<img>`、CSS 背景、`<img crossorigin>`、Pixi（blob worker 也受 service worker 控制）、`fetch()` 實測都正確，舊的 `sw.js` 上都拿到舊圖。P3（離線行為有改變、304 的說法、同時請求多一次）都寫進變更說明。
    - Unit：`serviceWorkerImageCache.test.js` 檢查 `{ cache: 'no-cache' }`。e2e：`infra111-sw-image.test.js`（這一版看過的圖在伺服器上換掉並部署下一版後，新的 service worker 存的是伺服器上的新圖；之後從快取回傳）。修改前兩項都失敗；e2e 連跑 3 次通過。

- [x] **PRO-014P** `server` source 下，換日處理只依權威的 entitlement 結果執行
  - 問題（PR #160 Codex review 指出，2026-10-18 對照 `dayCycle.js` 確認）：
    - 缺天時的連勝歸零本身與 Pro 無關。
    - 依賴 `isProUser()` 的是三件事：每月補滿保護卡、歸零後的保護卡 offer、SUB-16 解鎖（非 Pro 且連勝 ≥45 時發放並消耗一次性的 `streakUnlockUsed`）。
    - cached-user 啟動先跑 `bootWithLocalState()`，`db.refreshProEntitlement()` 在背景同步後才跑；`loadAndStart()` 在 `loadFromRemote()` 失敗時也會跳過 refresh 直接開機。
    - 結果：projection 過期的付費使用者會被當成非 Pro。他們拿不到保護卡、拿不到 offer，還可能把 `streakUnlockUsed` 用掉。同時 `lastStreakDate` 已推進，之後無法補救。
  - 影響：`legacy` source（目前 production）下不會發生；只影響已 opt-in `server` 的裝置。cutover 後會直接傷害付費使用者。
  - 現況（對照 `storage.refreshProEntitlement()` 與 `applyProStatusResponse()`）：所有非 Pro 的情況都回 `false`，目前的呼叫端也都忽略回傳值。各情況的 snapshot 處理：
    - **網路例外**（`supabase.rpc()` throw）：保留舊 snapshot
      - 2026-11-01 更正：repo 內的 Supabase client 遇到網路失敗或逾時不會 throw，而是回傳 `{ error, status: 0 }`，走下一條的「RPC 回傳 `error`」而**清除** snapshot（實測見提案 §3）。這條實際上只在 client 本身出錯時發生。
    - **RPC 回傳 `error`、資料格式不符、沒有 session 或 owner 不符**：清除 snapshot
    - **snapshot 寫入失敗**：`writeProEntitlementSnapshot()` 設定 lost-write latch 並立即 `removeItem()`，所以通常會**刪除**舊 snapshot；只有刪除也失敗時，舊 snapshot 才留在磁碟上（由 `SNAPSHOT_TTL_MS` 兜底）
    - **`FLAG_DEV_BACKUP` 存在**：直接略過，不呼叫 RPC
    - **明確非 Pro**：寫入非 Pro 的 snapshot
  - 方向（2026-11-01 使用者核准提案 [`docs/pro-014p-day-rollover-entitlement.md`](docs/pro-014p-day-rollover-entitlement.md) 方案 D；原本的方案 T 與改寫的逐條對照見提案 §7.1）：
    - `getProStatusFromSnapshot()` 由 snapshot 判斷 `pro`／`not-pro`／`unknown`；`isProFromSnapshot()` 改為它 `=== 'pro'`。`refreshProEntitlement()` 的回傳值不變。
    - `unknown`：沒有 owner、寫入 latch、snapshot 不存在或無法解析、owner 不符、超過 `SNAPSHOT_TTL_MS`、時鐘倒退、`isActive` 但取得後才到期。訪客（本機 `uid()`、沒有 snapshot）是 `unknown`，不新增訪客標記。`legacy` source 永遠已知。
    - 連勝計算與推進 `lastStreakDate` 一律照常。只有補卡、offer、SUB-16 依狀態：補卡與 offer 在 `unknown` 時寫入 owner-scoped 的待補做紀錄，取得權威結果後補做一次；SUB-16 只在 `not-pro` 時執行，`unknown` 略過、不消耗 `streakUnlockUsed`（`PRO-014L` 之後整段移出換日）。
    - 暫時性失敗（`status: 0`、408、429、5xx、PostgREST JWT 錯誤）不刪 snapshot。
  - 完成條件（提案 §7.2）：
    - `unknown` 的每種來源：連勝照常計算與歸零、`lastStreakDate` 照常推進；不補保護卡、不提供 offer，改寫入待補做紀錄，之後第一次取得權威結果時補做，最多一次；不做 SUB-16、不消耗 `streakUnlockUsed`
    - TTL 內的 snapshot 在離線時照常判定
    - 跨日：第一天 `unknown`、隔天才得到權威結果時，第一天的 Sessions 仍被評估（有效則延續連勝），第一天的待補做也被補上
    - `pro` 時補卡並提供保護 offer；`not-pro` 時照常重設，SUB-16 條件照舊
    - 每個情況各有測試；`refreshProEntitlement()` 的回傳值不變，三個呼叫端在 refresh 之後多呼叫一次補做，除此之外行為不變
    - 暫時性失敗與 throw 相同，保留 snapshot；權威的錯誤維持清除
    - `legacy` source 下永遠不寫待補做紀錄，換日行為與現在相同；以重構前寫好的特性測試證明
    - `unknown` 時按「使用保護卡」顯示「目前無法確認 Pro 狀態，連線後再試一次」
    - 併入 `BUG-115` 的完成條件（見下）
  - **擋 `PRO-014H`**
  - 依賴：`PRO-014O`；與 `PRO-014L`（草稿 PR #154）改的是同一段 SUB-16 路徑，需協調先後
  - In progress（2026-11-01）：使用者決定 PRO-014P 先於 PRO-014L（草稿 PR #154）。第一步是提案（只寫文件、不改程式碼）；屬 entitlement 啟動流程，核准前不實作。從 Backlog 移入 Next，再移入 In Progress。
  - 提案（2026-11-01，#220）：[`docs/pro-014p-day-rollover-entitlement.md`](docs/pro-014p-day-rollover-entitlement.md)。**使用者 2026-11-01 回覆「可以全部照建議」核准 §10**：方案 D、改寫方向與完成條件、暫時性失敗不刪 snapshot 併入、`BUG-115` 併入、提示文字照建議。實作一個 PR。
    - 實測：回訪使用者走 cached-user 路徑，漏一天時 snapshot 幾乎一定過期，付費使用者的保護卡 offer 永久遺失（不是邊界情況）。另外發現既有缺陷：Supabase client 的網路失敗回傳 `{ error, status: 0 }` 而不是 throw，`refreshProEntitlement()` 因此刪除 snapshot。
  - 完成（2026-11-01，#221，v1.41.5）：
    - 新模組 `pwa/js/proRollover.js`（INFRA-105：新的 export 都放在新模組，並加入 SHELL）：`getProStatusFromSnapshot()`、`getProRolloverStatus()`、待補做紀錄 `orbit_pro_rollover_pending`、`resolvePendingProRollover()`、owner-scoped 的 offer 讀寫。
    - `dayCycle.js` 的換日：狀態只算一次；`unknown` 時記錄待補做，否則由 `applyProOnlyRolloverEffects()` 補卡與給 offer；SUB-16 只在 `not-pro`。開頭先補做之前延後的部分。
    - `app.js`：`loadAndStart()`（`startTrial()` 之後、`hideLoading()` 之前）、cached-user 背景同步、`_syncAfterReconnect()` 在 refresh 之後補做。
    - `storage.refreshProEntitlement()`：`status: 0`、408、429、5xx、`PGRST301`／`PGRST303` 保留 snapshot。
    - 與提案的差異：提案寫「`isProFromSnapshot()` 改為 `getProStatusFromSnapshot() === 'pro'`」；為了不在既有 SHELL 模組新增 export，改為新函式的 `pro` 直接沿用 `isProFromSnapshot()`，保證相同且有測試逐案比對。
    - 驗證：先在未修改的程式碼上寫好 9 個 `legacy` 特性測試，重構後不改仍通過；`pro014pRollover.test.js` 共 50 個測試；`appBootSequence.test.js` 4 個呼叫點測試（移除呼叫即失敗）；lint、`npm test`（86 files／1481 tests）、e2e 79/79、`ps242:manifest`／`ps243:assets --check` 通過。

- [x] **BUG-115** 保護卡 offer（`orbit_shield_pending`）沒有 owner，登出也不刪除
  - 發現：寫 PRO-014P 提案時（2026-11-01），對照 `dayCycle.js`、`pages/home.js`、`pages/profile.js` 與 `storage.clearAll()`。
  - 問題：offer 只存 `{ prevStreak }`，`clearAll()` 不刪除。同一台裝置上 A 帳號留下的 offer 會出現在 B 帳號的首頁；B 若是 Pro（新帳號都有試用，`legacy` 下試用就是 Pro）按下使用，B 的連勝就變成 A 的 `prevStreak`。連勝會影響 SUB-16 的 45 天解鎖。production（`legacy`）現在就會發生，需要共用裝置。
  - 方向：
    - offer 加上 `ownerId`；首頁、個人頁與 `useStreakShield()` 在 owner 不符時忽略（不刪除，A 回來時仍可使用）。
    - 升級前留下、沒有 `ownerId` 的 offer 無法分辨屬於誰：登入中照常使用，登出時（`clearAll()`）刪除。這樣可以擋住「A 登出、B 登入」這條主要路徑。
    - offer 仍只有一格，B 寫入自己的 offer 會覆蓋 A 的。
  - 完成條件（各有測試）：
    - 升級後寫入的 A 的 offer 不出現在 B，B 也無法使用；
    - A 重新登入後仍看得到自己的 offer（期間 B 沒有寫入自己的 offer 時）；
    - 升級前留下的 offer 在登入中照常使用，登出後被刪除。
  - 使用者 2026-11-01 核准併入 PRO-014P 的實作 PR（提案 §10 第 4 點）。從 Backlog 移入 In Progress。
  - 完成（2026-11-01，併入 PRO-014P 的 #221，v1.41.5）：offer 寫入 `{ ownerId, prevStreak }`；`readShieldOffer()` 只回傳自己的或沒有 owner 的；首頁、個人頁與 `useStreakShield()` 都經由它；`storage.clearAll()` 刪除沒有 owner 或無法解析的 offer。**production（`legacy`）也適用。**

- [x] **PRO-014RA** 在 production 套用 014（`my_pro_status()` 的試用日期回報條件）
  - 目標：讓 production 的 `my_pro_status()` 在付費已涵蓋整段試用時不回報 `trial_ends_at`，`server` source 下終身付費不再被誤判為非 Pro。
  - 步驟（與 BUG-109A 相同，見 [`docs/pro-014r-my-pro-status-trial-cap.md`](docs/pro-014r-my-pro-status-trial-cap.md) §7）：以 `pg_get_functiondef` 比對 production 與 011 並保存回滾來源；在同一個 transaction 內套用 014、跑 `tests/database/pro014r.test.sql`、`ROLLBACK`（乾跑）；正式套用；檢查權限（anon 不可執行）、`SECURITY DEFINER`、`search_path`、owner；以本機覆寫改用 `server` source，確認 `+orbit-lifetime` 顯示終身付費 Pro、其餘 4 個測試帳號沒有回歸。
  - **需專案擁有者執行**：production 資料庫操作，Claude 不具權限。`legacy` source 下一般使用者不呼叫這個 RPC，套用時機不受 `PRO-014H` 限制。
  - 依賴：`PRO-014R`
  - 擋：`PRO-014H`
  - In progress（2026-11-01）：專案擁有者依提案 §7 在 production 套用。
  - 完成（2026-11-01，專案擁有者於 production 套用；紀錄 #219）：
    - 比對：production 的函式與 011 相同（只差 Postgres 輸出格式），owner `postgres`；輸出保存為回滾來源。
    - 乾跑：`begin;`＋014＋`pro014r.test.sql`＋`rollback;` 為 Success。
    - 套用後檢查：新規則生效、anon 不可執行、authenticated 可執行、`SECURITY DEFINER`、`search_path=""`、owner `postgres`。
    - 驗證：重設 5 個測試帳號後，以各帳號身份呼叫 `my_pro_status()` 並以 client 規則判讀：free 非 Pro、trial 試用、paid 付費、**lifetime 終身**、expired 非 Pro。

- [x] **PRO-014R** `server` source 下，終身付費但試用已過期的帳號被判定為非 Pro
  - 問題（2026-10-31，PR #216 的獨立 review 以 `+orbit-lifetime` 測試帳號發現）：`my_pro_status()` 對終身帳號回傳 `is_active = true`、`expires_at = NULL`，以及只要曾開始試用就有的 `trial_ends_at`（已過去）。client 的 `entitlementExpiryMs()`（`pwa/js/platform/proEntitlement.js`）取兩者中較晚的日期當上限，只剩過期的試用日，`isProFromSnapshot()` 因此回傳 false。
  - 影響：切到 `server` source 後，所有「先試用、後買終身方案」的使用者都會失去 Pro。目前 production 是 `legacy`，尚未受影響。
  - 方向：`PRO-014N`（RPC 回傳 `is_pro`）可從根本消除歧義；或 RPC 對付費帳號不回傳 `trial_ends_at`；或 client 忽略在取得 snapshot 時就已結束的試用。RPC 變更屬 AGENTS.md §3 高風險，需先核准。
  - 驗證：`docs/pro-test-accounts.md` 的 `+orbit-lifetime` 在 `server` source 下應顯示為付費 Pro。
  - 擋：`PRO-014H`
  - In progress（2026-10-31）：使用者要求把 PRO-014R 與 PRO-014N 合併成一份提案（只寫文件、不改程式碼、不動 production）。從 Backlog 移入 Next，再移入 In Progress；核准前不實作。
  - 提案：[`docs/pro-014r-my-pro-status-trial-cap.md`](docs/pro-014r-my-pro-status-trial-cap.md)（#217）。**2026-11-01 使用者核准方案 A**，開始實作。建議方案 A：`my_pro_status()` 在付費已涵蓋整段試用時不回報 `trial_ends_at`（`CREATE OR REPLACE`，回傳欄位不變、client 不需改邏輯）；12 個情境實測全部正確（獨立 review 另驗 19 個邊界情境）；建議以 A 結案 PRO-014N，但這代表重新定義它（推斷保留且精確，原本「不需推斷」改由可選的方案 B 承接），需使用者明確同意。
  - 完成（2026-11-01，repo 部分，#218）：新增 `pwa/db/014_my_pro_status_trial_cap.sql`（`CREATE OR REPLACE` 只改 `trial_ends_at` 的回報條件，重述 `REVOKE`／`GRANT`）；`tests/database/pro014r.test.sql`（純 SQL `ASSERT`，15 個情境＋`start_trial()` 補試用起點，失敗即中止，可與 014 一起乾跑後 rollback）；client 判讀測試 `pro014rClientDecisions.test.js` 與 SQL 契約測試；`proEntitlement.js` 只更新註解。已在 PostgreSQL 16 驗證：只套 011 時測試在第 4 個情境失敗；乾跑後函式仍是 011；套用 014 後通過、可重複套用、函式不存在時套用也不會讓 anon 取得執行權。
  - production 套用另立 `PRO-014RA`（專案擁有者執行）。

- [x] **PRO-014N** `my_pro_status()` 回傳 `is_pro`，消除 `expires_at` 的歧義
  - 問題（`PRO-014C` 實作時發現）：RPC 的 `CASE WHEN e.is_pro = true THEN e.pro_expires_at ELSE NULL END` 讓 `expires_at = null` 同時代表「沒有付費」與「終身付費」。client 因此無法在「終身付費」與「試用中」之間可靠區分。
  - 目前的處理：`getPaidProStateFromSnapshot()` 用「還有什麼能解釋這個 active」來推斷 —— 未到期的 `expires_at` ⇒ 付費；沒有 `expires_at` 且沒有生效中的試用 ⇒ 終身付費；沒有 `expires_at` 但試用生效中 ⇒ 算試用。最後一條是保守讀法：在試用期間購買終身方案的人會被顯示成試用中。
  - ~~範圍：`my_pro_status()` 增加 `is_pro boolean` 回傳欄位、client 改讀該欄位、移除推斷邏輯與其測試~~（2026-11-01 重新定義，見下方結案說明；原範圍移到 `PRO-014S`）
  - ~~完成條件：終身付費與試用可明確區分，不需推斷；試用期間購買終身方案顯示為付費~~（重新定義為：區分正確、推斷精確；「不需推斷」移到 `PRO-014S`）
  - **前置：屬 RPC contract 變更，依 AGENTS.md §3 需先取得核准**（`PRO-014I` 已於 2026-08-30 完成；改與 `PRO-014R` 合併提案）
  - 影響：~~純呈現層的正確性，不影響授權判定~~（2026-10-31 更正）：終身付費且試用已過期時，`isProUser()` 在 `server` source 下會是 **false**，見 `PRO-014R`。
  - 依賴：`PRO-014C`
  - In progress（2026-10-31）：與 PRO-014R 合併提案（改的是同一個 RPC），見 PRO-014R。核准前不實作。
  - 結案（2026-11-01，使用者核准，#218）：以 PRO-014R 的方案 A 結案並重新定義。014 之後 `trial_ends_at` 只在試用還能延長存取時回報，終身付費（含試用期間購買）與試用可正確區分，`getPaidProStateFromSnapshot()` 的推斷變得精確；原本「不需推斷、明確回傳 `is_pro`」改列可選的 `PRO-014S`。

- [x] **PRO-014Q** 開發者面板的 backup 不應擋住其他帳號或非 Pro 模擬的 entitlement refresh
  - 問題（PR #158 Codex review 指出，2026-10-18 確認）：`storage.refreshProEntitlement()` 只要 `FLAG_DEV_BACKUP` 存在就直接 return。這個 backup 也由等級模擬器建立，且 `storage.clearAll()` 登出時不會清除。開發者登出後換另一個帳號，該帳號的 refresh 會一直被跳過，在 `server` source 下 fail closed，直到手動重設。
  - 影響：只影響使用過開發者面板的裝置。
  - 同一個旗標也讓 `upsertProfile()` 對新帳號直接 return；`settings.js` 的 `_devReset()` 會把 backup 裡**前一個帳號**的 user 還原回去。
  - 方向：改用 owner-scoped、專屬 Pro 模擬的標記；或在 owner 改變時清除或驗證 backup。屬 entitlement 路徑，實作前附變更說明。
  - 依賴：`PRO-014M`
  - In progress（2026-10-18）：變更說明 [`docs/pro-014q-dev-backup-owner-scope.md`](docs/pro-014q-dev-backup-owner-scope.md) 已完成（經四輪獨立 review 後重寫），**等待使用者核准**。核准前不改程式碼。
    - review 發現 main 上已存在的兩個問題（只影響開發者模式的裝置）：模擬的 `totalXP`（`legacy` 下還有 `isPro`）可能被推到真實帳號；模擬中的帳號登出後在同一台裝置上無法再登入。
    - 結論：逐條修補 backup（Q2–Q4）與讀取時 overlay（Q5）都被找到新的外流路徑。overlay 會改變 `isProUser()`，而 `dayCycle.js` 依它寫入真實資料。
    - 建議：S0（「還原」改為完整清理：刪除 backup、所有 pending profile、本機 user、projection，以及這台裝置所有帳號的 V2 state〔保留 legacy-claim key〕後重新載入）＋ Q6（移除開發者面板的等級與 Pro 模擬，改用 preview 專案的測試帳號；舊 backup 照舊 fail closed，並提供同一套一次性清理）。
    - S0／Q6 清理的代價（只在開發者裝置、按下前有確認對話框）：模擬期間記錄真實 Session 所得的 XP 與連勝變動會被捨棄（Session 本身保留），因此重新遷移的個人空間開場 Gold 可能偏低；本機擺放微調與未播放的 reveal 會遺失。詳見變更說明 §4 S0。
    - 待使用者決定：S0、Q6（或 Q5 改良）、測試帳號由誰建立、高風險項目的變更說明是否也要先問再排程；並自行檢查自己帳號的 `profiles` 是否被模擬值覆寫。
  - **2026-10-18 使用者核准**：S0＋Q6。先做 S0（patch），再做 Q6（移除開發者面板的等級與 Pro 模擬；舊 backup fail closed 與一次性清理；`docs/` 寫測試帳號說明）。preview 專案的測試帳號需由專案擁有者建立，或授權給 agent。另提醒擁有者自行檢查自己帳號的 `profiles`。
  - S0 完成（2026-10-19，[#178](https://github.com/yoyoCadence/Orbit/pull/178)，v1.31.2）。獨立 review 找到 P1（多視窗外流，main 上原本就有）與 P2（遊客按「還原」會失去唯一的本機 profile）；**2026-10-19 使用者核准 A1＋B1**，同一個 PR 補上：其他視窗移除 backup 或清空 localStorage 時重新載入（A1）；沒有 session 且 backup 屬於本機 user 時視為遊客，把 backup 寫回本機 user（B1）。複查後再修：讀取 session 出錯時不當成遊客（避免舊備份蓋掉雲端資料）、重新載入前的重複點擊不再作用。仍未涵蓋：在別的帳號模擬後才建立的遊客等已知限制，見變更說明 §4 S0「review 後的補充」，Q6 前要決定。實作內容：「↩ 還原原始資料並重啟」先確認，再刪除備份、所有帳號的 pending profile（含無 owner 的舊 key）、本機 user、projection 與所有帳號的 V2 state（保留 legacy claim 與 legacy state）後重新載入。清理函式為 `storage.discardDevSimulation()` 與 `v2/store.removeAllPersonalSpaceV2States()`，Q6 的「清除殘留」沿用。
  - 剩下 Q6：**需先在 preview Supabase 專案建立測試帳號**（免費、試用中、付費、終身、不同等級），由專案擁有者建立或授權給 agent。
  - Q6（2026-10-31）：
    - 測試帳號：preview 專案並不存在（PRO-014D 用的是本機 Docker，app 連線寫死 production），使用者同意改在 production 建立 5 個專屬帳號（免費、試用中、付費、終身、付費已過期，Lv.1／5／10／20／30），2026-10-31 建立並以 SQL 設定完成，`server_pro_active` 與兩張表一致性皆經驗證。
    - 使用者決定（2026-10-31，AskUserQuestion）：在別的帳號模擬後才建立的遊客，「清除殘留」照舊刪除本機 user，`continueAsGuest` 在有任務、沒有 user 時導向設定頁，不再卡住。
  - 完成（2026-10-31，Q6，#216，v1.41.2）：
    - 移除開發者面板的「模擬等級」與「模擬 Pro」（`_devXpForLevel`、`_devBackupOnce`、`_devApplyLevel`、`_devProSnapshot`、`_devApplyPro`）；程式中已沒有任何地方寫入 `orbit_dev_backup`。面板只剩唯讀的會員狀態與 source、指向測試帳號文件，以及 backup 存在時的「清除殘留的模擬資料」（沿用 S0 清理與 B1）。
    - 舊 backup 照舊 fail closed，直到清除殘留。`continueAsGuest` 在有任務、沒有 user 時進入設定頁。
    - 新增 [`docs/pro-test-accounts.md`](docs/pro-test-accounts.md)：5 個測試帳號的角色、可重複執行的設定 SQL（只依完整 email 比對、剛好 5 個才寫入；已在 PostgreSQL 16 以真實 migration 驗證，含同後綴的外部帳號不受影響）、建立步驟與注意事項；不含 email 與密碼。
    - 獨立 review 的修正：設定 SQL 原本只比對後綴（公開 repo 下任何人註冊同後綴帳號就會被給 Pro）；遊客設定頁原本會沿用載入失敗帳號的 `_currentSession` id（`showSetup(ownerId)` 改為明確傳入）。終身帳號在 `server` source 被誤判為非 Pro 屬既有 bug，另立 `PRO-014R`。
    - 測試：面板沒有模擬、渲染不寫入；殘留時顯示清除，`upsertProfile`／`refreshProEntitlement` 照舊 fail closed，清除後回到非 Pro；S0／B1 的測試改為直接寫入舊版留下的殘留；`proGateCallSites` 的 client Pro 寫入點只剩 SUB-16，且沒有任何地方寫入 `orbit_dev_backup`；遊客有任務沒有 user 時進入設定頁，且不沿用載入失敗帳號的 id。

- [x] **BUG-109A** 在 production 套用 013 signup trigger migration
  - 目標：讓 production 的 `handle_new_user()` 截斷超過 30 字元的名稱來源，長 email local-part 與長 Google 顯示名稱都能註冊。
  - 步驟：依 [`docs/bug-109-signup-name-truncation.md`](docs/bug-109-signup-name-truncation.md) 的 runbook：先以 `pg_get_functiondef` 比對 production 函式與 004、記錄回滾來源，在非 production 環境跑 `tests/database/bug109.test.sql`，再套用並驗證。
  - **需專案擁有者執行**：production 資料庫操作，Claude 不具權限；依 AGENTS.md §3 屬 schema 變更的套用。
  - 依賴：`BUG-109`
  - In progress（2026-10-31）：專案擁有者依 runbook 在 production 套用。
  - 完成（2026-10-31，專案擁有者於 production 套用；紀錄見 PR #215）：
    - 套用前 `pg_get_functiondef` 的輸出與 `004_triggers.sql` 相同（只差空白與 Postgres 輸出時的格式），沒有未入庫的修改；原版定義保存為回滾來源，與 004 的函式定義等價。
    - 以 production 乾跑取代 runbook 第 3 步：在同一個 transaction 內套用 013、跑 `tests/database/bug109.test.sql` 的 6 項檢查，最後 ROLLBACK。乾跑通過（此做法事先在 PostgreSQL 16 驗證過：未套 013 會重現 `profiles_name_check`，乾跑後函式與資料都不變）。
    - 正式套用後重新查詢，函式已含 `left(…, 30)`，驗證成功。

- [x] **AUDIT-001** 整體性的完整檢查
  - 來源：使用者 2026-10-29 要求（「做整體性的完整檢查 token時間不限制」）。
  - 範圍：安全（XSS、外部 script、Supabase RLS 與 grant、service worker、開發用 server）、依賴套件、測試涵蓋、CI、部署內容、文件與實際程式是否一致。低風險的直接修正；需要核准的（schema／migration、CI、部署、auth）記為 Backlog，不在這裡改。
  - In progress（2026-10-29）：INFRA-108（#213）合併後開始。
  - 完成（2026-10-29，v1.41.6）：
    - XSS：`dayCycle.js` 的昨日報告（任務名稱與 emoji）與 `profile.js` 的稱號主題按鈕（自訂主題的 key、圖示、名稱）沒有 escape，改用 `escHtml`。獨立 review 再找到同類的：任務 emoji（首頁、設定的任務列表、回顧的待校準）、任務圖示 `iconImg`、自訂背景圖、頭像（個人頁、頁首）放進 HTML 前沒有 escape。這些在 UI 上是選單或 app 產生的 data URL，但 localStorage 與資料庫裡是任意文字（`profiles_update` 不限制欄位，使用者可把自己的 `avatar_url` 改成 `https://x" onerror="…`），一併改用 `escHtml`。都只影響使用者自己的帳號與裝置；其他使用者的資料（排行榜的名稱、頭像）原本就有 escape。
    - 外部 script：成長報告 PDF 從 cdnjs 載入的 jsPDF 2.5.1 與 html2canvas 1.4.1 加上 SRI（`integrity` sha512＋`crossorigin`；值與 npm 套件 dist 檔的 hash 相同，也與 cdnjs 公布的 SRI 相同）。載入失敗時移除 `<script>` 並忘掉這次載入，再按一次會重新下載（以前留下的 tag 讓第二次直接 resolve，函式庫卻不存在，要重新開啟 app）；同時進行的兩次只載入一次。
    - `pwa/server.cjs`（只在本機）：`path.join` 之後檢查仍在 `pwa/` 底下，`GET /../package.json`（curl `--path-as-is`）以前會回傳 repo 的檔案；補上 `.webp`、`.gif` 的 Content-Type（以前是 `text/plain`）。
    - Supabase：每張表都 `ENABLE ROW LEVEL SECURITY`，四種 policy 都只給 `authenticated`，INSERT 有 `WITH CHECK`、UPDATE 有 `USING`＋`WITH CHECK`；`pro_entitlements` 是 CLAUDE.md 的 server-owned 例外（REVOKE＋只有 SELECT，migration 有註解）；Storage 的 policy 都檢查 `storage.foldername(name)[1]`（排行榜頭像的公開讀取限 `is_public` 的使用者）；沒有 `FOR ALL`；client 只有 publishable key，沒有 `service_role`。發現的問題記為 INFRA-110（需核准）。
    - 依賴：`npm audit fix --package-lock-only`（不需 major 升級的部分）：@humanfs/node、@xmldom/xmldom、brace-expansion、js-yaml、nanoid、postcss、source-map-js、undici。除了 @xmldom/xmldom（`pixi.js` 的依賴）都是 devDependencies 的間接依賴；app 用的是 `pwa/vendor/` 裡打包好的 Pixi（沒有 xmldom，這次沒有改），所以部署的檔案都不變（`npm audit --omit=dev` 為 0）。剩下的：vitest 1.6 → 5（critical，只在開發與 CI）需要 Node ≥ 22，以及 eslint 相關的 moderate（minimatch、`@eslint/*`），記為 INFRA-112。
    - 文件：README（不再寫死版本號、`pwa/db/` 不再列到 009、排行榜「不暴露 `user_id`」不正確、基礎建設加上 E2E 與 INFRA-108）、ROADMAP（「近期（v1.23.x）」、已完成補上 v1.31–v1.41）、AGENTS.md §17 補上 V2 的模組表（原本只有 legacy）、兩份 V2 設計文件的檔案規劃加上「as built」說明。`scripts/bump.mjs` 開頭的說明改正（INFRA-108 review 的 P3）。
    - 測試：`dayCycle.test.js`、`profile.test.js`、`home.test.js`、`settings.test.js`、`review.test.js`、`headerAvatar.test.js`（名稱、emoji、圖示與頭像含 markup 時以文字顯示或留在 `src` 裡）、`exportPdf.test.js`（SRI 屬性、失敗後重試、產生 PDF）、`devServer.test.js`（不回傳 `pwa/` 以外的檔案、圖片類型）。修改前的程式上新的測試都失敗。Unit 1413、e2e 79 全部通過（e2e 會用修改後的 `server.cjs`）。
    - 其他觀察（沒有改）：unit 的 coverage 83.5%，較低的是 `header`、`proofSheet`、`tour`、`export`、`theme`、`authFlow`；延後載入的 JS 預算剩 2,223 B（這次的修改不在預算內）；測試輸出中的錯誤堆疊是刻意測試錯誤路徑的預期輸出。

- [x] **INFRA-108** CI 檢查改了 `pwa/` 的 PR 有沒有 bump
  - 問題（TEST-003 獨立 review 發現，2026-10-28）：INFRA-107 之後新的 `CACHE` 名稱是新的 HTML 與程式到達使用者的唯一方式。改了 `pwa/` 卻沒有 `npm run bump`，或兩個 PR 從同一個版本 bump 後在 CHANGELOG 衝突時併成同一個版本，已安裝的使用者都拿不到。`bumpLib.test.js` 只能檢查版本一致與 CHANGELOG 不重複，看不到「沒有 bump」。
  - 方向：CI 比對 PR 與 base：`pwa/` 有變更時 `sw.js` 的 `CACHE` 必須與 base 不同（純文件、測試的 PR 不受影響）。
  - **改 CI 設定，實作前需使用者核准**（AGENTS.md §3）。
  - **2026-10-29 使用者核准**（「INFRA-108 ok 請做」）。
  - In progress（2026-10-29）：TEST-003（#212）合併後開始（Backlog → In Progress）。
  - 完成（2026-10-29；CI 與工具，不 bump）：
    - `scripts/versionCheckLib.mjs`（規則）＋`scripts/check-version-bump.mjs`（讀 git）：PR 相對 base（`origin/<base>...HEAD`，不偵測 rename、以 `-z` 讀檔名）改到 app 會載入的 `pwa/` 檔案（開發用的 `pwa/server.cjs` 與手動套用的 migration `pwa/db/` 除外）時，`sw.js` 的 `CACHE` 必須與 base 不同、版本必須比 base 新、`CACHE` 必須是 `orbit-v<package.json 版本>`。沒有改到 `pwa/` 的 PR（文件、測試、CI）不受影響。失敗訊息列出改到的檔案與修正方法（`npm run bump`）。
    - `.github/workflows/ci.yml`：`build-check` job 以 `fetch-depth: 0`＋`filter: blob:none` checkout（只下載 tree，避免每次下載約 145 MB 的完整歷史），pull request 時執行檢查（base 分支名稱經由環境變數傳入，不直接嵌在指令裡）。仍是原本的四個 CI 項目。
    - 兩邊都從 git 讀（`HEAD`，不是工作目錄），本機與 CI 結果相同；失敗訊息以 Actions toolkit 的方式跳脫，檔名不能產生另一個 workflow command；版本不是 `x.y.z` 時以 `::error::` 回報。
    - 兩個 PR 從同一個版本 bump：先合併的一個讓 main 前進，另一個的 CI 重新執行時版本不比 main 新而失敗，要再 bump 一次（GitHub 在 base 改變時會重新計算 merge commit；沒有重新執行的舊結果仍可能是綠的，合併前確認 CI 是針對目前的 main）。
    - Unit：`versionCheck.test.js`（不需要 bump 的變更、沒有 bump 時失敗並列出檔案、patch／minor／major、版本倒退、`CACHE` 與 `package.json` 不一致、部署檔案的判斷、版本比較，以及在暫存的 git repo 中照 CI 的方式執行腳本）。
    - 獨立 review（Codex 額度用完）：沒有 P1；P2（rename 移出 `pwa/` 與非 ASCII 檔名會漏掉）以 `--no-renames -z` 修正並補 unit test；P3 都已處理（AGENTS.md 兩處不正確的敘述、訊息加上「先合併最新的 base」、prerelease 版本、測試不受開發者 git 設定影響、從 `HEAD` 讀、`blob:none`、migration 不需 bump）。
    - 第二輪獨立 review：沒有 P1；P2 兩項已修正並補 unit test：
      - 讀不到 base 的檔案時（CI 的 partial clone 下載失敗）原本當成「沒有這個檔案」，以版本 0.0.0 比對而讓沒有 bump 的 PR 通過；改為讀不到就以 `::error::` 失敗。
      - AGENTS.md 寫 bump 失敗時以 `git checkout -- .` 復原，會連同還沒 commit 的修改一起丟掉；改為 `scripts/bump.mjs` 先算出所有檔案的新內容、全部成功才寫入，失敗時什麼都不寫（`bumpLib.test.js` 在暫存目錄執行腳本確認）。
      - P3：`git diff` 加上 `--no-relative`，本機設定 `diff.relative` 並在 `pwa/` 底下執行時也讀到完整路徑。
    - 回測：對最近 40 個合併的 PR 執行（PR 的 commit 對合併前的 main），全部通過：改到 `pwa/` 的都有 bump，文件與 CI 的 PR 都不需要。
    - 文件：AGENTS.md §14（原本寫 `APP_VERSION` 在 `app.js`、只列三個檔案；改為 bump 的所有位置、什麼 PR 要 bump、CI 的檢查）、INFRA-107 變更說明。


- [x] **TEST-003** 檢視最近的 PR（#207–#211），補上遺漏的測試與測試文件
  - 來源：使用者 2026-10-28 要求檢視最近的 PR、檢查遺漏，必要時更新測試相關程式。
  - 範圍：對照 AI-202B2、INFRA-105、PS-251B、INFRA-107 的驗收條件與 review 的意見，補上沒有測試的行為；確認測試不受執行時段影響；更新過時的 `tests/e2e/README.md`。不改 app 的行為。
  - In progress（2026-10-28）：使用者要求後開始。
  - 完成（2026-10-28，只改測試與測試文件，不 bump）：
    - 檢查結果：
      - AI-202B2：提案 §8 的每一項 reveal 驗收都有對應的 unit test（`ai202b2MilestoneReveals.test.js`），沒有遺漏。
      - 時段：整套 unit test 在晨間、白天、傍晚、深夜四個時區都通過，整套 e2e 在晨間、傍晚、深夜也通過（白天是平常的 CI），沒有依賴執行時刻的測試。
      - main 上 #207–#211 的部署都成功；沒有 `skip`／`only` 的測試。
    - 獨立 review：沒有 P1／P2；依 P3 補上 CSS 不在快取時的測試、CHANGELOG 版本不重複、README 的檔案表與時區範例、`playwright.config.js` 指向不存在檔案的註解。
    - 補上的測試：
      - `serviceWorkerImageCache.test.js`（INFRA-107）：不是 `.html` 的開啟頁面（例如在分頁開啟 manifest）與 script 取得的 `.html` 都走快取的 HTML 分支；`cache.put` 失敗（儲存空間滿）時頁面與模組仍照常回傳。
      - `personalSpacePixiRuntime.test.js`（PS-251B）：窗外載入失敗時，選擇的房間風格照常畫出；房間風格在兩種畫風都共用預設房間的窗外（像素版為 nearest）。
      - `bumpLib.test.js`（INFRA-107）：`package.json`、`version.js`、`sw.js` 的 `CACHE`、`package-lock.json`、ROADMAP 與 CHANGELOG 最新一筆的版本一致。INFRA-107 之後新的 `CACHE` 是新版本到達使用者的唯一方式，只改了一部分的 bump 會讓使用者停在舊版。
    - CHANGELOG 每個版本只出現一次（`bumpLib.test.js`）：兩個 PR 從同一個版本 bump 時，只有 CHANGELOG 會衝突；把兩者併在同一個標題下會讓第二個 PR 的檔案用已安裝的 `CACHE` 名稱發佈，使用者拿不到。
    - 檔案不在快取中時，JS 與 CSS 都以 `cache: 'no-cache'` 向伺服器取得（`serviceWorkerImageCache.test.js` 對 `js/app.js` 與 `assets/style.css` 各一次）。
    - 仍然測不到的：改了 `pwa/` 卻完全沒有 bump。要在 CI 比對 PR 與 base 的差異，改 CI 設定需核准，記為 Backlog INFRA-108。
    - `tests/e2e/README.md` 重寫：原本寫「E2E 無法在此環境執行」、`node pwa/server.js` 等過時內容。改為執行方式、每個檔案涵蓋的範圍、`support/` 的工具，以及這幾個 PR 學到的注意事項（service worker 與 routing、HTTP cache、減少動態效果、開新分頁檢查程式版本、`page.clock`、在其他時段執行）。


- [x] **INFRA-107** service worker 的 HTML network-first 在 GitHub Pages 的根目錄不成立
  - 問題（INFRA-105 獨立 review 發現，2026-10-23；原本就有）：`sw.js` 以 `url.pathname.endsWith('.html') || url.pathname === '/'` 判斷 HTML。網站在 `/Orbit/` 底下，`https://yoyocadence.github.io/Orbit/` 的 pathname 是 `/Orbit/`，不符合，所以根目錄走圖片的 cache-first。
  - 影響：目前沒有可見的錯誤，因為 INFRA-105 起 install 時重新驗證 `./`，新版的快取裡是新版的根目錄頁面；但根目錄不會走 network-first（例如離線時的退回順序與註解所述不同）。
  - 方向：以 service worker 的 registration scope 判斷根目錄（`url.href === self.registration.scope`），或判斷 `e.request.mode === 'navigate'`；加 unit test。屬 service worker 的快取行為（部署行為），**實作前先說明並取得使用者核准**。
  - **2026-10-23 使用者決定**（AskUserQuestion）：根目錄與 `index.html` **都回傳 service worker 快取中的 HTML**（離線也一樣），新版本照現在的流程：安裝時重新驗證 → 「新版本已就緒」→ 重新整理，HTML 與程式永遠同一版。比對時忽略網址的查詢字串；不快取錯誤回應。先寫變更說明＋e2e，**PR 合併前給使用者看**。
  - In progress（2026-10-23）：PS-251B（#210）合併後開始（Backlog → In Progress）。
  - **2026-10-24 使用者決定**（AskUserQuestion，獨立 review 的 P2 之後）：JS／CSS 也固定同一版，背景不再更新快取中已有的檔案。
  - 完成（2026-10-24，#211，v1.41.1；使用者要求完成後合併）：
    - 變更說明 [`docs/infra-107-html-cache.md`](docs/infra-107-html-cache.md)。
    - `sw.js`：開啟頁面（`request.mode === 'navigate'`）或 `.html` 一律以 `ignoreSearch` 回傳這個版本快取中的 HTML，不問網路；快取中沒有的頁面向網路取得，只存成功且沒有經過 redirect 的回應，存在去掉查詢字串的網址下。修正「network-first 才能偵測新的 service worker」的錯誤註解（瀏覽器每次開啟頁面都會檢查 `sw.js`）。
    - Unit：`serviceWorkerImageCache.test.js` 加 5 項（修改前 5 項失敗）。e2e `infra107-sw-html.test.js`：伺服器把 `pwa/` 放在 `/Orbit/` 底下；只改 `index.html` 時兩個入口都還是這個版本的 HTML、不向伺服器要頁面；下一版的 service worker 接手、出現「新版本已就緒」後才是新的 HTML 與 `APP_VERSION`；帶查詢字串與斷線時照樣開啟（修改前兩項都失敗，修改後連跑 3 次通過）。HTML 以 `max-age=0` 回應，代表瀏覽器的那一份已超過 10 分鐘，否則修改前的 network-first 會從 HTTP cache 拿到舊的一份，看不出差別。
    - INFRA-105 的 e2e 伺服器抽成 `tests/e2e/support/pagesServer.js`（可設定 `base` 與每個路徑的 `Cache-Control`、記錄完整網址、模擬斷線），兩個 e2e 共用。
    - JS／CSS（2026-10-24）：快取中有的直接回傳、不在背景更新；沒有的以 `cache: 'no-cache'` 向伺服器取得，只存成功的回應。全部 109 個 JS／CSS 都在 SHELL，所以新程式只隨新的 service worker 出現。`sw.js` 開頭註解：bump 是新 HTML 與程式到達使用者的唯一方式。
    - e2e 補上：只開啟頁面就讓瀏覽器找到新的 service worker、按橫幅的「重新整理」；下一版的 service worker 裝不起來（一個 SHELL 檔案回 500）時新分頁連開三次都是這個版本的 HTML 與程式（只固定 HTML 的版本上失敗）。INFRA-105 的第二項 e2e 改為「快取中有的模組不向伺服器要，沒有的才從伺服器（不是 HTTP cache）取得」。
    - 文件：technical design §12.2、`refactor-handoff.md` 的快取策略、INFRA-105 變更說明的後續、README 本機開發（Shift＋重新整理或 DevTools 的「Update on reload」）。
    - 獨立 review：沒有 P1；P2（只固定 HTML 時，下一版裝不起來會變成舊 HTML 配新程式）依使用者決定以固定 JS／CSS 修正。P3 都已處理：沒有快取的頁面存入時等 `cache.put` 完成並吞掉錯誤；註解與文件改為「每次開啟頁面與任何 `.html`」；本機開發的說明；e2e 改以一般的開啟頁面觸發更新並按橫幅。
    - Codex：對 836e272 沒有 finding；對 0895247 額度用完，依規則以獨立 review 代替。
    - 獨立 review 複查 0895247：沒有 P1／P2（P2 已解決，移除背景更新沒有回歸，新測試在 836e272 上失敗）。依 P3 補上：`sw.js` 註解的決定日期、「每次開啟頁面」的措辭（已開著的頁面在新的 service worker 接手後仍可能延遲載入新版模組）、變更說明加上「安裝時存到錯的檔案會留到下一次 bump」、unit test 檢查 `pwa/` 裡每個 JS／CSS 都在 SHELL（新的保證依賴它）。

- [x] **PS-251B** 實作 PS-248A2：窗外依時段變化
  - 依據：[`docs/ps-251b-window-view-proposal.md`](docs/ps-251b-window-view-proposal.md)（#208），使用者 2026-10-23 決定 §8：S1（天際線不變，換建築的顏色、亮度與亮窗）、W2（只做晨間與傍晚的疊層）、T1（時段邊界準時重新 render）、其餘照建議（房間內的光不變；Q 版疊層預先快取、像素版第一次顯示時下載；更新 art bible 與 asset pipeline 的「一張 exterior」上限）。
  - 預覽（2026-10-23）：以提案 §4 的初稿配色渲染晨間、傍晚的疊層，合成五個房間 × 兩種畫風 × 兩個時段的預覽；**使用者確認配色可以**。
  - 範圍與驗收：提案 §4、§5、§9。
  - 依賴：`INFRA-105`（已合併）
  - In progress（2026-10-23）：INFRA-105（#209）合併、使用者確認預覽後開始。
  - 完成（2026-10-23，v1.41.0）：
    - 素材（`art-pipeline/ps251-window/`）：`render_window.py` 以 PS-244 場景渲染只有窗外的 RGBA 疊層（房間物件設 `is_holdout`，家具與裝飾隱藏，不用會被 Freestyle 描邊的 Holdout 材質），`process_window.py` 檢查只有窗戶範圍不透明並輸出：Q 版 `workspace/window/exterior-{morning,evening}.webp`（有 alpha 的 lossy WebP）、像素版 `workspace/pixel/window/exterior-{morning,evening}.png`（32 色、硬邊 alpha、4 倍放大），每張約 12–13 KB；`outputs.json` 記錄大小與 SHA-256。日式和風與夜貓工作室的疊層 alpha 與預設只差 3 個邊緣像素（8/255），五個房間共用。
    - `assetManifest.js`：`getWorkspaceSceneAssets()` 回傳多一個 `exterior`（只從 `timeBand` 選項讀，晨間與傍晚有、白天與深夜是 `null`，與房間風格無關）；Q 版疊層加入 `getWorkspaceAssetManifestPaths()`（52 個）與 PS-242 manifest（`build-manifest.mjs` 的 exterior 分支）。沒有新增 export（INFRA-105）。
    - 首頁 poster：背景之後、家具之前的 `<img class="orbit-window-exterior">`（自己的 class、inline 定位，舊的 `style.css` 也能放對位置）。疊層載入失敗就移除；背景退回 Q 版預設房間時，像素疊層換成 Q 版；夜晚房間退回白天房間時，傍晚仍畫傍晚的疊層。
    - Pixi：`orbit-exterior` sprite（`zIndex` 1，家具最小是 10），像素版用 nearest；疊層跟著實際畫出的房間，載入失敗就不畫，房間照常。
    - T1：`watchRemindWindow()` 也追蹤時段（邊界 05、10、12、14、17、21 時），首頁與個人空間頁準時重新 render，保留開著的詳細資訊面板與焦點（沿用 AI-203B）。
    - 快取：Q 版疊層加入 SHELL（PS-211A 推導 45 個，e2e 46 個含 Pixi），像素版第一次顯示時下載。開發者的素材總覽加上兩種畫風的疊層。
    - 文件：art bible §6.1、§7.2；asset pipeline 的素材上限；technical design §12.2 與時段的說明；`ps244-blender`、`ps250-rooms` README；`art-pipeline/ps251-window/README.md`；提案狀態。
    - 測試：`ps251bWindowView.test.js`（manifest、素材與 `outputs.json`、poster 疊層與退回、舊 manifest）、`personalSpacePixiRuntime.test.js`（疊層的位置、順序、退回、載入失敗）、`personalSpaceV2RemindWindow.test.js`（每個時段邊界、時段內不重新 render、睡眠跨時段）；e2e `ps251b-window-view.test.js`（晨間與傍晚的疊層與圖層順序；開著 app 跨過 17 時房間換夜晚、窗外換傍晚、只重新 render 一次、保留焦點；跨過 21 時保留詳細資訊面板與焦點；不改 `remindWindow.js` 時失敗）、`sw-precache.test.js` 加上晨間與傍晚的離線 poster。全部 e2e 也在晨間（America/Los_Angeles）與傍晚（Asia/Kolkata）的時區各跑一次，既有以 `.orbit-window-background` 找背景的測試都通過。
    - 延後載入的 JS gzip 304,977 / 307,200 B，只剩 2,223 B。
    - 獨立 review：沒有 P1／P2（逐項確認退回邏輯、新舊模組混用、時段邊界與 DST、Pixi 的順序與材質、測試在修改前會失敗、文件數字）。依 P3 修正：poster 上窗外的錯誤比背景先到時（離線、像素檔沒有快取），背景退回 Q 版房間時把 Q 版窗外放回去；開發者素材總覽搭配舊的 `assetManifest.js` 不再拋錯；technical design §12.2 的段落順序。刻意不處理的 P3：重新 render 恰好跨過時段邊界的幾毫秒內，watcher 讀到的時間比 model 晚，會等到下一個邊界才更新（AI-203B 的 12／14 時原本就如此）；疊層材質是整張畫面大小（約 6.3 MB GPU 記憶體，與房間背景相同），裁成窗戶範圍可省約 10 倍，留待之後需要時再做。

- [x] **PS-251** PS-248 提案 §9 中 PS-250 沒有涵蓋的項目
  - 來源：PS-248 結案時（#202 獨立 review 的 P2）。使用者的 PS-250 決定取代了 PS-248 §9 的範圍、擴充前提、順序、做法與快取，但沒有決定下面兩項。
  - **§9.3 PS-248A2 窗外依時段變化**（可選；超出 art bible §6.1「一張 exterior」的上限）：使用者 2026-10-23 決定**做**。第一步是實作提案（窗戶遮罩、圖層、素材預算與快取），核准後再渲染。
    - 實作提案（2026-10-23）：[`docs/ps-251b-window-view-proposal.md`](docs/ps-251b-window-view-proposal.md)。建議 E-A：晨間與傍晚各一張「只有窗外」的 RGBA 疊層（Blender holdout），疊在房間背景之上、家具之下，五個房間共用，兩種畫風共 4 張圖；不重新渲染房間、不改房間背景的格式；只在 `getWorkspaceSceneAssets()` 的回傳加一個屬性（INFRA-105）。窗內幾乎都是建築（天空約 0.1%），所以看得出差別的是建築的顏色、亮度與亮窗，或讓天際線低一點（§8.2）；實作第一步是預覽，確認後才產生正式素材。**等待使用者決定 §8**（時段、窗外的樣子與預覽、房間內的光、開著 app 跨過時段、快取、文件上限）。核准後實作為 PS-251B，驗收條件見提案 §9。
    - **2026-10-23 使用者決定 §8**：S1（天際線不變，換建築的顏色、亮度與亮窗）、W2（只做晨間與傍晚的疊層）、T1（時段邊界準時重新 render）、其餘照建議（房間內的光不變；Q 版疊層預先快取、像素版第一次顯示時下載；更新 art bible 與 asset pipeline 的「一張 exterior」上限）。下一步：PS-251B 的第一步是**預覽**（五個房間 × 兩種畫風 × 晨間與傍晚的合成圖），使用者確認配色後才產生正式素材與實作，驗收條件見提案 §9。使用者已確認預覽的配色，實作為 PS-251B（In Progress）。
  - **§9.8 順帶整理**：使用者 2026-10-23 核准三項都做，拆成 PS-251A。
  - 完成（2026-10-23）：§9.3 由 PS-251B（#210，v1.41.0）完成，§9.8 由 PS-251A（#204）完成。

- [x] **INFRA-105** service worker 安裝時，SHELL 的 JS／CSS／HTML 也要重新驗證，避免改版後先跑舊程式
  - 問題（PS-211A 獨立 review 發現，2026-10-20；修改前就存在）：`sw.js` 的 install 只對圖片與 `pixi.js` 使用 `cache: 'no-cache'`。JS、CSS、HTML 仍走瀏覽器的 HTTP cache。GitHub Pages 的 `max-age=600` 內，新版本的快取會存到**舊的** `version.js` 等模組。
  - 影響：
    - 「新版本已就緒」後的第一次載入，最多約 10 分鐘內仍執行舊程式。stale-while-revalidate 的背景更新也會讀到仍然有效的 HTTP cache。
    - 改版若改了素材檔名，舊的 `assetManifest.js` 會要求不在 SHELL 中的舊檔名：線上 404、離線缺圖。
    - 新模組使用舊模組沒有的 export 時，可能無法 link。
  - 方向：SHELL 的所有項目都以 `new Request(path, { cache: 'no-cache' })` 取得（沒變的檔案只需 304），並以 e2e 模擬改版驗證。
  - **改 service worker 的快取行為（部署行為），需使用者核准**。
  - 使用者 2026-10-23 核准：先寫一份短的變更說明（做法、風險、以 e2e 模擬改版的驗證），**PR 合併前讓使用者看過**，再實作。
  - In progress（2026-10-23）：PS-251B 的提案（#208）合併後開始（Next → In Progress）。
  - 完成（2026-10-23，#209，v1.40.1；使用者看過變更說明與結果後核准合併）：
    - 變更說明 [`docs/infra-105-shell-revalidate.md`](docs/infra-105-shell-revalidate.md)。
    - `sw.js`：install 時 SHELL 的每一項都以 `cache: 'no-cache'` 重新驗證（沒變的只回 304）；JS／CSS 的背景更新也是。導覽請求（HTML）的 network-first 不變（理由見變更說明 §2）。
    - e2e `infra105-sw-update.test.js`：自己的靜態伺服器回應 `max-age=600` 與 ETag，模擬「舊檔仍在 HTTP cache 有效期內就部署新版」。修改前兩項都失敗（新快取是舊的 `version.js`；背景更新仍是舊檔），修改後通過。
    - 「SHELL 模組不 import 既有 SHELL 模組的新 export」的規則**仍保留**：已開著的頁面在重新整理前、延遲載入的模組仍可能新舊混用。
    - 獨立 review（Codex 額度用完時的替代）：沒有 P1／P2；依 P3 補上背景更新不快取錯誤回應（unit test）、e2e 確認 HTTP cache 有作用、304 說明改為「伺服器保留 `ETag` 時」（GitHub Pages 部署後 `ETag` 是否不變未驗證，最差與現在相同）；根目錄 `isHtml` 的舊問題記為 INFRA-107。

- [x] **AI-202B2** 實作 AI-202：里程碑（專案完成與關係階段）的 reveal
  - 依據：[`docs/ai-202-companion-relationship-proposal.md`](docs/ai-202-companion-relationship-proposal.md) §3.4、§8（reveal 與 Companion 的驗收條件），使用者 2026-10-23 的決定。
  - 範圍：`presentedMilestones`（新的本機欄位）與淨變化的放置；第 12、30 天的階段提升是 `major`，標題與行「夥伴關係：合作夥伴」，Companion `congratulate`＋`companion.relationship.stage-up`；階段退回不是 `major`、`observe`；`queueReveal: false` 只移除或縮小；舊格式 reveal 的重新計算；消耗帶里程碑的 reveal 時前進基準。與 BUG-113 的專案完成判斷整合。
  - 依賴：`AI-202B1`
  - In progress（2026-10-23）：AI-202B1 合併後開始（Next → In Progress）。
  - 完成（2026-10-23，v1.40.0）：
    - `controller.js`：`presentedMilestones = { projectCompleted, relationshipStage, pending }`；淨變化＝目前狀態 − 基準，整個佇列最多一個 reveal 帶 `milestone: { project, stage }`。放置順序：錨點 Session（第 4／12／30 個 Main Quest 日；同一個 Session 有兩個 reveal 時用本次加入的）→ 本次 `main-focus` 有變化的 reveal → 最新一個不是只含撤銷的 reveal → 併入基準；完成與階段提升不放在只含撤銷的 reveal。
    - 記錄或撤銷 Session、第一次以新規則計算時放置；舊版分頁排入的 reveal 只在它就是錨點時接收；其他 reconcile 只縮小或移除（階段只在 `from` 與原本的 `to` 之間縮小，超過 `to` 或反向就移除，例如同步帶入第 12 天時第 4 天待播放的 reveal 只移除「熟悉夥伴」）。
    - 初始值：以目前規則從 reconcile 之前的 ledger 計算，扣掉仍有效的舊格式 reveal 中加入的 `world_unlock`（完成設為 `false`）與 `relationship`（階段不加推導的 milestone）。`pending` 指的 reveal 已不在佇列時（舊版分頁播放了它）基準設為 `pending.to`。
    - 每次 reconcile 由 reward 與里程碑重新計算 reveal 的 `lines`、`kind`、`title`、`projectCompleted`、`relationshipStage`、`worldChange`；解鎖行與「夥伴關係：<階段>」只來自里程碑；`major` 只來自完成或階段提升；只有階段提升時 `title` 是新階段；沒有行的 reveal 不排入。移除 BUG-113 的 `completedSourceId`。
    - `consumePersonalSpaceV2Reveal()`：消耗帶里程碑的 reveal 時把基準前進到它的 `to`。
    - `companionEngine.js`：完成 → `companion.relationship.stage-up`（新台詞「我們一起走過的日子，又多了一些。」，加入文案表與 telemetry allowlist）→ 階段退回 `observe`＋目前階段的台詞。主角在階段退回的 reveal 不慶祝。完整頁面使用 reveal 的 `lines` 與階段提升的標題。
    - 文件：vertical slice §4.3、§5.1、§7.2（Companion 優先順序）、`personal-space-state-flow.md`。
    - 測試：`ai202b2MilestoneReveals.test.js`（41 項，涵蓋提案 §8 reveal 的每一項，另加舊版分頁排入的 reveal、「最近的世界變化」跟著里程碑、重複套用相同）；e2e `ai202b2-stage-reveal.test.js`（341 px 記錄第 12 天：Major、標題與台詞、標題一行、重新載入不重播）。BUG-113／BUG-114 的測試不變並通過。
    - 獨立 review（P1、P2 已修）：
      - P1：之後記錄的 Session（包括沒有 ledger 變化的無效 Session）或重複套用同一次 reconcile，會把由放置第 2、3 步放上的里程碑搬走或未播放就併入基準。改為錨點之後先保留已帶著同方向里程碑的 reveal；第 2 步只看與淨變化同方向的 Main Quest 日變化（複查的 P2：退回的階段不會放到剛新增的 Main Quest 日）。
      - P2：第一次以新規則計算時若是同步，同步帶入的第 12 天會被放到不相干的舊 reveal。改為只放回 reconcile 之前就保留的部分，其餘照同步縮小。
      - P3：佇列中 `rewards` 不是陣列的 reveal 不再讓第一次計算拋錯；主角在階段提升的 reveal 上一律慶祝。
      - 提案 §3.4 加上兩條實作補充。
      - 已知、可接受（複查的 P3）：第一次以新規則計算的同步若也刪掉了保留中完成的錨點（另一台裝置刪除第 4 天、加入第 5 天），完成依第 3 步放到最新的 reveal（仍只顯示一次）。
    - 預算：延後載入的 JS gzip 303,269 / 307,200 B（剩 3,931 B）。

- [x] **AI-202B1** 實作 AI-202：關係階段的推導與顯示
  - 依據：[`docs/ai-202-companion-relationship-proposal.md`](docs/ai-202-companion-relationship-proposal.md) §3.2、§3.3、§5–§7，使用者 2026-10-23 的決定（N1、只算 Main Quest 日、K4＋R1、S1、H1、T0）。
  - 範圍：
    - 推導：點數＝`max(legacy 點數, ledger 的 relationship ＋ 推導的 milestone)`；第 12、30 個 Main Quest 日各加 1。新的本機欄位 `companion.legacyRelationshipPoints`（只寫一次）與 `companion.relationshipPolicyId`。`rulesetId` 與 ledger 不變。
    - 顯示：首頁 COMPANION 卡顯示階段（與完整頁面共用名稱表）；`companion.observe` 與 `companion.momentum.strong` 依階段（6 句新台詞）；撤銷的 reveal 用目前階段的 `observe` 台詞。
    - H1：首頁與完整頁面的 reward 行共用一份中文名稱表，不再顯示原始 key。
    - 文件：README 註明以 4 個階段為準；vertical slice §4.3、§5.1、§6.1、§7.2、§13.1 與 `docs/personal-space-state-flow.md`。
    - 不在範圍（AI-202B2）：階段變化的 reveal。本任務之後，第 12、30 天只改變卡片上的階段，沒有專屬的 reveal。
  - 驗收：提案 §8 的「推進」、「與舊版程式碼並存」、「顯示」各項（reveal 的項目在 AI-202B2）。
  - In progress（2026-10-23）。
  - 完成（2026-10-23，v1.39.0）：
    - `controller.js`：`countMainQuestDays()`（不同的 `main-focus:<date>` key）、`derivedRelationshipMilestones()`（12、30）、`legacyRelationshipPoints()`（欄位不存在時以 reconcile 之前的 ledger 算一次，之後只讀、無效值為 0）。點數＝`max(legacy, ledger 的 relationship ＋ milestone)`；寫入 `relationshipPolicyId`。
    - `content/worldLabels.js`（新模組，加入 SHELL）：階段名稱、hidden stats 名稱、`formatRewardLine()`、`formatWorldChange()`；首頁、完整頁面與 view model 共用。提案原本寫放在既有模組，但依 INFRA-105 的規則，SHELL 模組不能 import 既有 SHELL 模組的新 export，所以另立新模組。
    - `companionEngine.js`：`observe`（含撤銷的 reveal）與 `momentum.strong` 依階段；`companionDialogue.js` 與 telemetry allowlist 加 6 句。
    - `viewModels.js`：`resolveRelationshipStage()` 只讀儲存的階段（不再加上 ledger 的 relationship）。
    - 首頁卡片「COMPANION · <階段>」：這張卡的標籤字距 .06em、階段名稱不加字距、單行。實測 341 px 時最長的「陌生觀察者」從只剩 0.7 px 變成留 9.9 px。
    - 文件：README（以 4 個階段為準）、vertical slice §4.3（實際的 key）、§5.1（新欄位）、§6.1、§7.2、§13.1（`rulesetId` 只標示 ledger entry，推導的規則用 policy id）、`personal-space-state-flow.md`（新舊公式）。§7.2 的 Companion 優先順序（階段提升）留給 AI-202B2。
    - 階段清單與名稱表都只有一份（`content/worldLabels.js` 的 `RELATIONSHIP_STAGES`／`RELATIONSHIP_STAGE_LABELS`），`controller.js` 與 `viewModels.js` 改為 import（獨立 review 的 P2）。查表只看自身的 key（`constructor`、`toString` 不會查到 Object 的成員）。
    - 測試：`ai202b1RelationshipStage.test.js`（21 項，含以舊版的關係算法處理新版 state、非 authoritative 的部分快照、view model 不再把 ledger 的 relationship 加到儲存的階段）；e2e `companion-dialogue.test.js` 加上階段標籤（341–1024 px、200% 縮放，至少留 4 px）與儲存的階段。
    - 預算：延後載入的 JS gzip 298,589 / 307,200 B（剩 8,611 B）。

- [x] **AI-202** 定義 companion relationship stage 與 hidden stats 的最小映射規則
  - 目標：讓 companion 關係變化可由真實行為驅動，而不是聊天次數
  - 對應 roadmap：Phase 2 / Phase 4
  - 2026-10-20 排程（使用者指定為下一個）：第一步是提案（Mode A，只寫文件、不改程式碼），核准前不實作。不涉及 auth／schema；若映射需要新的持久化欄位，提案中列為需核准事項。
  - In progress（2026-10-20）：提案 [`docs/ai-202-companion-relationship-proposal.md`](docs/ai-202-companion-relationship-proposal.md)（Mode A，只寫文件）。建議：
    - 關係階段只由 Main Quest 天數推進：第 4 天 `familiar`（即現有的 Workspace Upgrade 完成，不改）、第 12 天 `partner`、第 30 天 `trusted-companion`。新的 milestone 由 active ledger 推導，**不寫成 ledger entry**：仍在執行舊版程式碼的分頁會撤銷它不認得的同 ruleset entry（Codex review 指出）。另存一個本機欄位 `companion.legacyRelationshipPoints`，讓舊版分頁寫入的過時點數不會汙染計算（需核准）；legacy 點數是下限而不是加分，門檻對所有使用者相同（Codex review 指出）。
      - 現況：唯一的來源是專案完成，所以階段最多到 `familiar`；`companionEngine` 完全不讀階段。
    - hidden stats 不決定階段：沒有每日上限、instant 也算，容易刷。AI-202B 只把它們的顯示改為中文名稱。
    - 不因缺席降級；只有 Main Quest 日被撤銷、數量跌破門檻時退回。
    - 階段變化的 reveal 由前後的階段決定：只有提升是 `major`；退回不恭喜；換一天承接時沒有關係的 reveal。第 4 天沿用已核准的專案完成台詞。
    - 首頁顯示階段；依階段改變最常看到的兩句預設台詞（`observe`、`momentum.strong`）。
    - `rulesetId` 與 ledger 都不變。換 ruleset 在現有程式碼下會讓 hidden stats 與關係重複計算（Gold 不會）。另存 `companion.relationshipPolicyId` 替推導的規則標版本；vertical slice §6.1、§13.1「改規則要換 `rulesetId`」需改為只適用於 ledger entry（Codex review 指出，需核准）。
  - **等待使用者決定**提案 §9：門檻、輸入、機制與既有歷史（需同意新增三個本機欄位並修改 vertical slice §6.1、§7.2、§13.1）、顯示、hidden stats 名稱、台詞、README、telemetry、BUG-113 的處理。核准後比照 AI-204：AI-202 移到 Done，另立 AI-202B 實作。
  - 完成（2026-10-23）：使用者決定 §9，全部採用建議（N1 第 4／12／30 個 Main Quest 日、只算 Main Quest 日、K4＋R1、S1、H1、T0、README 註明以 4 個階段為準；BUG-113 已在 #192 修正）。實作拆成 AI-202B1（推導與顯示）與 AI-202B2（里程碑的 reveal）。

- [x] **PS-249A** 實作 PS-249：Orbit Window 被 overlay 蓋住時暫停 reveal 與場景
  - 依據：[`docs/ps-249-overlay-scene-proposal.md`](docs/ps-249-overlay-scene-proposal.md)，使用者 2026-10-23 的 §6 決定（見上方核准紀錄）。
  - 範圍：
    - C1：`orbitWindow.js` 以 `MutationObserver` 判斷「被蓋住」：常駐的 `#focus-overlay`、`#levelup-overlay`、`#focus-duration-picker` 看 `hidden`；`body` 的直接子元素中不帶 `hidden` 的 `.modal-overlay`、`.pro-sheet-overlay`、`.shield-confirm-overlay`、`.tour-backdrop` 與佐證大圖（`proofSheet.js` 加 class）。「沒被蓋住」等兩個 animation frame 才生效。
    - R-A＋重播：reveal 用自己的 `rootMargin: 0` 可視判斷；held 時計時與 CSS 動畫（含 `::after`、`major` 橫幅）暫停，橫幅隱藏；被 overlay 蓋住後從頭重播。
    - P1：被蓋住時 `suspend()` 場景，沿用 INFRA-106。
    - 首頁與個人空間頁都套用。
  - 驗收：提案 §7（單元測試、e2e、`flows.test.js` 改成先關閉佐證 sheet 再等 reveal 結束、INFRA-105 新舊混用、reduced motion）。
  - 依賴：`PS-249`
  - In progress（2026-10-23）：PS-251A 合併後開始（Next → In Progress）。
  - 完成（2026-10-23，v1.38.3）：
    - `orbitWindow.js`：
      - 「被蓋住」：常駐的 `#focus-overlay`、`#levelup-overlay`、`#focus-duration-picker` 看 `hidden`；`body` 的直接子元素中不帶 `hidden` 的 `.modal-overlay`、`.pro-sheet-overlay`、`.shield-confirm-overlay`、`.tour-backdrop`、`.proof-lightbox`。一個 `MutationObserver` 觀察 `body` 的子元素與常駐三者的 class；「沒被蓋住」等兩個 animation frame 才生效。
      - Reveal 另建 `rootMargin: 0` 的 `IntersectionObserver`；被蓋住、不在畫面、分頁隱藏時 held（`is-reveal-held`），計時暫停。被蓋住過就在恢復時重設計時並把 reveal 的動畫（`getAnimations({ subtree: true })`）倒回 0。`reward_reveal_started` 仍只送一次。
      - 場景：被蓋住時 `suspend()`（取代 INFRA-106 只看 Focus overlay 的判斷）。
    - `style.css`：`is-reveal-held` 時以較高權重的選擇器（含 `::after`）暫停 reveal 的動畫，`major` 橫幅 `visibility: hidden`。
    - `proofSheet.js`：佐證大圖加 `proof-lightbox` class。
    - 測試：`ps249aOverlayCover.test.js`（27 項）；e2e `ps249a-overlay.test.js`（佐證 sheet 下的暫停與重播、reveal 後段才開的 modal、`major` 橫幅捲出畫面時隱藏）；`flows.test.js` 改成先關閉佐證 sheet 再等 reveal 結束。
    - 稽核：加在 `body` 底下的 overlay 關閉時都會移除，常駐的三個以 `hidden` 開關，不會留下「一直被蓋住」的情況。之後加在 `body` 底下的 overlay 也必須移除（原地加 `hidden` 不會被察覺）。
    - 獨立 review 的 P2：overlay 在 reveal 後段才開時，沒有 fill mode、已播完的動畫（慶祝、medium 外框的 `::after`）不在 `getAnimations()` 中，倒回 0 無效；改成移除再加回 reveal 的 class 重新開始，`major` 橫幅（fill both）仍倒回 0。
    - INFRA-105：沒有新增 import 或 export。舊 `style.css`＋新 JS：只有計時延後；舊 `proofSheet.js`：大圖不被偵測（與以前相同）。
    - 預算：延後載入的 JS gzip 296,893 / 307,200 B（剩 10,307 B）。

- [x] **PS-251A** PS-248 §9.8 的順帶整理
  - 使用者 2026-10-23 核准（見 Next 的核准紀錄）。三項都不改程式行為：
    - 刪除未被引用的 `pwa/assets/personal-space/v2/workspace/backgrounds/building-formal-workstation-room-v1.webp`（159,396 B）：只在 v1.22.0～PS-244 之間被引用、從未在 SHELL；原始檔 `art-pipeline/ps242/source/building-formal-workstation-room-v1.png` 保留。修正 `art-pipeline/ps242/companion-state-pack-metadata.json` 中指向不存在的 `…/room-v1.png`。
    - 更新 `docs/ps-243-production-acceptance.md` 的預算表為目前提交的 `docs/ps243/asset-baseline.json`，並保留 PS-242 時（v1.22.0）記錄的數字。
    - 根目錄 `README.md` 的專案階段改成實際的 `WORKSPACE_PROJECT_PHASES`。
  - In progress（2026-10-23）。
  - 完成（2026-10-23，v1.38.2）：
    - 刪除 `room-v1.webp`；`companion-state-pack-metadata.json` 的參考改為 `art-pipeline/ps242/source/building-formal-workstation-room-v1.png`。`npm run ps243:assets` 的結果不變（目前的場景不使用它）。
      - 舊版本：它是 v1.22.0～v1.28.2 的背景，當時的 service worker 會在第一次取用時快取圖片。很久沒開、仍是這些版本的裝置，部署後第一次開啟若舊快取中沒有它，會拿到 404：舊程式退回 poster（沒有背景圖，其他圖照常）並顯示「互動場景暫時無法載入」，只到下次重新載入（屬 INFRA-105 的範圍）。
    - PS-243 驗收紀錄的預算表改為 v1.38.2 的 baseline（數字與 v1.38.1 相同）：JS gzip 70,153＋225,428＝295,581 B（預算 307,200 B，剩 11,619 B，約 11.3 KB）、首屏 122,433 B、夜晚首屏 104,205 B、完整場景 50 個檔案 1,409,958 B；PS-242 時記錄的數字保留在表下的說明。
    - README：Active Project 每完成一次今日 Main Quest 推進 25%（`DAILY_PROJECT_PROGRESS`），階段為基本書桌 → 燈具與收納 → 單螢幕工作站 → 雙螢幕正式工作站；房間風格與角色可在 Edit Mode 選擇，已出現的裝飾可個別開關（書架、桌上的裝飾要到 50%、25% 才出現）。
    - 版本 v1.38.2：刪除的是已部署的檔案，依 AGENTS.md §14 每個 PR bump 一次（Codex 的 P1；原本打算比照純文件 PR 不 bump）。

- [x] **PS-249** Orbit Window 在其他蓋住畫面的 overlay 下仍重畫、reveal 計時照走
  - 背景（INFRA-106 獨立 review 發現，2026-10-20）：INFRA-106 只在 Focus overlay 開啟時暫停 Pixi 場景。其他 overlay 也會蓋住首頁：
    - `#levelup-overlay`：85% 黑，z 100（`feedback.js`），升級後顯示到使用者關閉；
    - `.modal-overlay`：65% 黑，用於早晨、每日報告、連勝解鎖、Focus 的結果選擇等 modal；
    - `.shield-confirm-overlay`、`.pro-sheet-overlay`：55% 黑。
  - 另外：reveal 的計時（`orbitWindow.js` 的 reveal clock）不看 Focus overlay，待播放的 reveal 可能在 overlay 底下播完；`.orbit-window-major-reveal`（fixed、z 1200）會畫在 Focus overlay（z 80）之上。
    - 更正（PS-249 提案量測）：`.orbit-window` 設了 `isolation: isolate`，橫幅的 z 1200 只在 Orbit Window 之內有效，不會畫在 overlay 之上；真正的問題是 Orbit Window 不在可視區時橫幅仍蓋滿畫面。
  - 方向：決定哪些 overlay 要暫停場景（半透明的 modal 底下仍看得到場景，不一定要暫停）、reveal 是否要等 overlay 關閉再播；可選的最佳化：overlay 開著時延後掛載、`app.init` 傳 `autoStart: false`。
  - 屬於效能與呈現的調整，先提案再實作。
  - In progress（2026-10-22，Backlog → Next → In Progress，見 Next 的排程記錄）：PS-250 完成後，Backlog 中不需核准就能開始的只剩本項的提案。第一步是提案（Mode A，只寫文件、不改程式碼），核准前不實作。
    - 提案：[`docs/ps-249-overlay-scene-proposal.md`](docs/ps-249-overlay-scene-proposal.md)。在實際 app 量到：
      - Session 結束後 reveal 立刻開始（此時還沒被蓋住），0.6 秒後升級畫面、0.7 秒後佐證 sheet 蓋上；4.2 秒的 reveal 約 3.6 秒在底下播完，接著被標記為已看過、不再重播。
      - Reveal 的 CSS 動畫不看計時：Orbit Window 不在可視區時照播，`major` 橫幅（fixed）在可視區外也蓋滿畫面。
      - 場景在 modal 與升級畫面底下照常重畫：量測環境中 CPU 與沒有 overlay 時相同，Focus overlay 底下暫停時少約 93%（軟體繪圖，只能比較相對值）。
    - 建議：C1（在 `orbitWindow.js` 以 `MutationObserver` 判斷被蓋住；`proofSheet.js` 的佐證大圖加一個 class）＋R-A（被蓋住、不在可視區、分頁隱藏時，reveal 的計時與 CSS 動畫都暫停，`major` 橫幅隱藏；overlay 關閉後從頭重播）＋P1（所有全螢幕 overlay 都暫停場景）。不建議延後第一次掛載 Pixi。核准後拆成 PS-249A，並調整 `flows.test.js` 中等 reveal 結束的順序。
  - 完成（2026-10-23）：提案 #203 合併；使用者決定 §6（R-A＋重播、P1、導覽算被蓋住、佐證大圖加 class、個人空間頁也套用、不延後掛載）。實作拆成 PS-249A（Next）。

- [x] **PS-250G** 選擇介面的房間縮圖改用小檔案，並在離線時退回
  - 來源：#200 獨立 review 的 P3。房間縮圖目前是完整的 1536×1024 背景：打開 Edit Mode 的「房間」會下載 4 張其他風格的背景（Q 版約 280 KB、像素約 350 KB），離線時沒下載過的縮圖是空白，但說明寫「離線時暫時以預設顯示」。
  - 做法候選：處理腳本另外輸出小的縮圖（例如 216×144 WebP）並列入 `outputs.json`；縮圖 `<img>` 加 `data-fallback-src`（預設房間的縮圖），沿用 poster 的退回機制。
  - PS-250F2（#201 獨立 review 的 P3）：「裝飾」開關的圖片是所選房間的裝飾，離線時沒下載過的房間同樣是空白；一併加上 `data-fallback-src`（預設房間、已預先快取的裝飾）。
  - 不影響場景本身與預先快取。
  - In progress（2026-10-22）：PS-250F 合併後，PS-250 只剩這一項後續。不涉及 auth／schema／部署（`sw.js` 只隨版本號換 CACHE 名稱），直接開始。
  - 完成（2026-10-22，v1.38.1）：
    - `art-pipeline/ps250-rooms/thumbnails.py`：由已提交的白天背景產生每個房間 216×144 的 WebP 縮圖（顯示大小的兩倍），Q 版與像素各 5 張，共 10 張、約 39.8 KB，大小與 SHA-256 記在 `thumbnails.json`。房間重新渲染後重跑。
    - 選擇介面的「房間」改用縮圖：打開時不再下載其他房間完整的背景（Q 版約 280 KB、像素約 350 KB）。
    - 選擇介面的每張圖都有預先快取的退回（`data-fallback-src`）：房間縮圖退回藍色工作室的背景、裝飾退回藍色工作室白天的裝飾、主角與 AI 夥伴退回上班族與 Orbit。`personalSpaceV2.js` 在容器上以 capture 監聽 `error`（不會冒泡），只處理選擇介面的圖；poster 的圖維持自己的退回步驟。退回的是 Q 版圖，去掉 `data-pixel-art`。已是預設的圖不加退回。
    - INFRA-105：沒有新增 import 或 export；舊頁面配新選擇介面時只是沒有退回（與以前相同），新頁面配舊選擇介面時監聽不到 `data-fallback-src`，不做事。
    - 測試：`ps250gPickerThumbnails.test.js`（檔案與雜湊、尺寸、縮圖路徑、每張圖的退回都在 SHELL）、`personalSpaceV2Page.test.js`（退回、不重複、不碰 poster、cleanup 後不再處理）、e2e（縮圖載入、不下載完整背景、擋下縮圖與風格裝飾時顯示預設）。

- [x] **PS-250** 以 Blender 大量擴充「空間」素材：全像素與全 Q 版兩套可切換（epic）
  - 使用者 2026-10-21 要求：「請用 blender 開始製作更多主角、場景、小家具、AI 形象的選擇等等，盡可能的豐富，並可製作一個開發者用的選項，打勾可以看全部 3D 資產」。
  - 使用者的決定（2026-10-21）：
    - 風格：Q 版（3D 卡通）與像素化兩種都要，可以切換；把缺的補齊，成為兩套完整的素材：「全像素」與「全 Q 版」。有其他推薦的風格也可以做。
    - 現有的像素主角與藍色球形 Orbit 夥伴：改為可切換的選項之一。
    - 快取：只預先快取預設的素材；其他選項第一次使用時下載並快取，離線缺圖時退回預設。這會修改 `sw.js` 的快取規則（部署行為），**使用者已核准**。
    - 順序：開發者總覽 → 角色 → 場景 → 小家具。
    - 預設風格：**全 Q 版**。房間與家具已是 Blender 卡通，主角與 AI 夥伴改為 Q 版；現有的像素角色在「全像素」中可選。
    - 外觀：原型的 Q 版主角 6 套（上班族、帽 T、毛衣長髮、運動馬尾、科學家、畫家）與 AI 夥伴 6 種（Orbit、貓型機器人、貓頭鷹、方塊無人機、果凍、狐狸），照這個方向做完。
  - 範圍與 PS-248 提案的關係：使用者的決定取代 PS-248 §9 的「範圍」（角色與 AI 形象在範圍內）、「擴充前提」（同意擴充）、「順序」三點。PS-248A（夜晚版本）與 PS-248B（房間風格）併入 PS-250E，PS-248C（裝飾小物）併入 PS-250F。
  - 子任務（每項一個 PR，核准的範圍內不再另行提案）：
    - **PS-250A 開發者選項「顯示全部 3D 資產」**：設定頁的開發者工具加一個勾選框，勾選後「空間」頁面列出全部素材（依類別、來源）。
    - **PS-250B 風格與選擇的基礎**：素材登錄表支援多種風格與多個角色／AI 形象；V2 state 新增本機欄位（風格、主角、AI 形象的選擇，不動 Supabase）；完整頁面的 Edit Mode 加上選擇介面；`sw.js` 只預先快取預設，其他按需快取並在離線時退回預設。
      - `getWorkspaceAssetManifestPaths()` 是預設素材的契約（PS-243 預算、`ps211aPrecache` 與數量測試都依賴它），其他風格與選項不要加進去，改由新的登錄表列出；開發者總覽也改讀登錄表。
      - 預設改為全 Q 版後，SHELL 換成 Q 版角色；現有的像素角色改為按需快取。
    - **PS-250C Q 版角色（Blender）**：以程式建模的 Q 版主角（多套外觀 × 6 個動作 × 左右兩個方向）與 AI 夥伴（Orbit 3D 版與其他形象 × 6 個狀態）。與房間共用卡通材質、描邊與光線方向。
    - **PS-250D 像素版素材**：把現有的 Blender 房間、家具與 Q 版角色像素化，補齊「全像素」；現有的像素主角與 Orbit 夥伴保留在像素組。PS-250E／F 新增的場景與小家具，像素版在各自的任務中一起做。
    - **PS-250E 場景**：夜晚版本（PS-248A 的做法）與房間風格（PS-248B），兩種風格各一套。
      - 使用者的決定（2026-10-21）：
        - 房間風格：除了現在的房間，新增**明亮北歐、日式和風、夜貓工作室、深木書房**四套。相機、家具造型與燈光不變，只換材質與色票。每套都做 Q 版＋像素、白天＋夜晚。
          - 深木書房的色票在 art bible §5 原本保留給 Mastery 階段；使用者明確選擇現在就提供，art bible 要一併更新。
        - 夜晚版本的時段：**傍晚也用**，即傍晚與深夜（17:00–05:00，`timeBand.js` 的 `evening`、`night`）。早晨與白天用白天版本。
        - 成就相框：夜晚版本時，以 JS 把相框與照片一起調暗。
        - 快取：預設組合（全 Q 版＋目前的房間）的夜晚版本**預先快取**（加入 SHELL，修改 `sw.js` 的 SHELL 清單，使用者已核准）；其他風格與像素版維持 PS-250B 的按需快取，離線缺圖時退回預設。
      - 拆成三個 PR：
        - **PS-250E1 夜晚版本**：目前房間的夜晚版本（Q 版＋像素）、時段參數、較弱的夜晚色層、相框調暗、SHELL。
        - **PS-250E2 房間風格的基礎＋明亮北歐**：風格登錄表、`world.appearance` 的房間欄位、Edit Mode 的選擇介面，與第一套風格（白天＋夜晚、Q 版＋像素）。
        - **PS-250E3 其他三套房間風格**：日式和風、夜貓工作室、深木書房。
    - **PS-250F 小家具**：裝飾小物（PS-248C），兩種風格各一套。
      - 使用者的決定（2026-10-22）：
        - 取得方式：**Edit Mode 自由開關**。完整頁面的「風格、房間與角色」新增「裝飾」，每件可以顯示或隱藏，免費、只存在本機，不碰獎勵、經濟與 ledger。
        - 項目（每組 2 件，共 6 件）：書架小物（獎盃＋地球儀）、地板（懶骨頭＋落地燈）、桌面（多肉盆栽＋咖啡杯組）。
        - 位置固定在 Blender 場景中，和現有家具一樣不能拖動；放在支撐物上的裝飾（書架 50%、書桌 25% 起）在支撐物出現前不顯示。
        - 每件都做全 Q 版＋全像素、白天＋夜晚、五種房間風格。
      - 設計：
        - 預設全部顯示；本機只記錄隱藏的（`world.hiddenDecorations`），之後新增的裝飾預設會出現。
        - 預設組合（全 Q 版＋藍色工作室）的裝飾白天與夜晚都預先快取（依已核准的「只預先快取預設」）；其他風格按需下載。
      - 拆成兩個 PR：
        - **PS-250F1**：6 件裝飾在預設的藍色工作室（Q 版＋像素、白天＋夜晚）、Edit Mode 的「裝飾」開關、預先快取。
        - **PS-250F2**：同樣 6 件在其他四套房間風格。
      - 順帶（#200 獨立 review 的 P3）：
        - `room_styles.py` 與 `ps250-rooms/README.md` 的「只有淺色房間」用詞改為「每個非預設風格都設」（淺色 56、深色 40），README 補上最多 107（夜貓工作室）。
        - handoff 的渲染時間改為每套 Q 版房間（白天＋夜晚）約 90 分鐘。
        - 選擇介面的房間縮圖用的是完整的 1536×1024 背景，而且沒有離線退回：打開「房間」會下載 4 張背景（約 280–350 KB），離線時沒下載過的縮圖是空白。另立 **PS-250G**（Backlog）處理。PS-250F2 之後「裝飾」開關的圖片也是所選房間的裝飾，離線時沒下載過的房間同樣是空白，一併在 PS-250G 處理。
    - 文件：art bible §6.1 與 asset pipeline 的 vertical slice 上限，在各子任務中依實際新增的素材更新。
  - 已確認可行（2026-10-21 原型）：Q 版主角 6 個動作、Orbit 3D 版 6 個狀態、像素化流程，都以 `bpy 5.2.2` 在 CPU 上每張約 5–10 秒。
  - 原型（Blender 腳本）在 PS-250C 提交到 `art-pipeline/ps250-characters/`；在那之前只存在於做原型的 session，接手時依上述外觀重新建立即可。
  - In progress（2026-10-21）：
    - PS-250A 完成（v1.32.0）：`pwa/js/personalSpace/v2/ui/assetGallery.js`（新模組，只讀取 asset manifest 既有的 export）；設定頁開發者工具的勾選框寫入 `localStorage` 的 `orbit_dev_asset_gallery`；設定頁直接用這個 key，不 import 新模組（設定頁在啟動路徑上，INFRA-105）；「空間」頁面在勾選且為開發者模式時列出全部素材。
    - PS-250C 完成（2026-10-21）：先做 Q 版角色，PS-250B 再接，因為 PS-250B 要把預設改成全 Q 版，需要先有素材。
      - 管線與預覽圖在 `art-pipeline/ps250-characters/`；108 張 WebP（品質 90、alpha 無損）在 `pwa/assets/personal-space/v2/characters/toon/`：主角 6 套 × 6 個動作 × 左右，AI 夥伴 6 種 × 6 個狀態。
      - 主角畫布 512×512，地面點在 241/256，與像素主角相同；AI 夥伴畫布 256×256，置中。所以 placement 不用改。
      - `content/characterCatalog.js`（新模組）列出全部路徑，開發者總覽讀它。場景還不使用，也不預先快取。
    - PS-250B 完成（2026-10-21，v1.33.0）：
      - `assetManifest.js` 依 `{ style, protagonistId, companionId }` 解析角色路徑（自己寫，不 import `characterCatalog.js`，以測試確保一致）；不認得的風格或角色退回預設。
      - 預設是全 Q 版的上班族與 Orbit：`getWorkspaceAssetManifestPaths()`、`manifest.json`、SHELL 與 PS-243 都改為 Q 版；像素角色只在選擇時下載。
      - V2 state 新增 `world.appearance`（只存在本機）；view model 帶到 Orbit Window 與 Pixi。
      - 離線：poster 的 `<img>` 載入失敗時換成預設（`data-fallback-src`），Pixi 的 `Assets.load` 失敗時改載入預設。
      - 完整頁面的 Edit Mode 新增「風格與角色」（新模組 `ui/appearancePicker.js`，只讀既有 export；還沒有 V2 state 時不寫入，避免跳過遷移）。
      - 開發者總覽改以場景解析列出像素角色。
      - 使用者選擇前 `world.appearance` 是 `null`，以預設顯示；預設以後若改變，沒選過的人會跟著改。
      - 已知限制：
        - 新舊版本混用時選擇可能遺失：舊版 `stateSchema.js` 會丟掉 `world.appearance`。見 `docs/personal-space-state-flow.md` §7。
        - 離線時，沒下載過的角色縮圖在選擇介面中是空白。
        - 離線退回預設只有單元測試與 e2e 的「圖片載入失敗」模擬，沒有真正的 service worker 離線測試。
    - 給 PS-250B 的備註（已處理）：
      - `sw.js` 的圖片本來就是 cache-first，第一次 fetch 時存入快取，所以「其他選項按需快取」已經成立。PS-250B 要改的是：把 SHELL 的預設角色換成 Q 版；在 JS 端處理離線缺圖時退回預設（Pixi `Assets.load` 失敗、poster 的 `<img>` 載入失敗）。
      - 每次改版 activate 時會刪除舊的快取，所以按需快取的選項在改版後要重新下載；離線時會退回預設。
      - 預設改成 Q 版時，`build-manifest.mjs`、`ps211aPrecache` 與 PS-243 預算都會讀到 Q 版的 WebP：要確認 lossy＋alpha 的 WebP 能被 `build-manifest.mjs` 解析（提案記錄 lossless 會拋錯）。
      - `ps211aPrecache.test.js` 的「只讀取 facing」名單整個放行了 `characterCatalog.js`；若 PS-250B 在那裡加入設定 facing 的邏輯，要重新檢查這個名單。
      - INFRA-105：`app.js`、`router.js` 直接 import `pixiSceneRuntime.js`（它再 import `assetManifest.js`），`home.js` import `controller.js` 與 `viewModels.js`，都在啟動路徑上。這些模組不能新增對其他模組的 import：跳過版本的使用者，舊快取中可能沒有那個模組（連 PS-250C 的 `characterCatalog.js` 也可能沒有），離線時整個 app 無法啟動。角色路徑的解析要寫在 `assetManifest.js` 自己裡面，以測試確保與 `characterCatalog.js` 一致；或由不在啟動路徑上的模組算好，當資料放進 model。
    - PS-250D 完成（2026-10-21，v1.34.0）：
      - **管線**：`art-pipeline/ps250-pixel/`，共 117 張 PNG，約 637 KB。
        - 房間與 8 件家具以 PS-244 的場景在 384×256 渲染（不反鋸齒、1 px 描邊），每張圖各自的色盤，×4 放大。
        - 家具裁成與 Q 版相同的框，所以共用同一個 placement。
        - 角色由 PS-250C 的圖縮成房間的像素大小（主角 92、夥伴 50 像素），加對比、銳利化與 1 px 深色描邊，再 ×4 放大。直接以小尺寸渲染會讓臉糊掉。
      - **全像素的範圍**：風格現在也包括房間與家具。像素版的 6 套主角與 6 種夥伴與 Q 版共用 id，切換風格時角色不變。
      - **經典角色**：PS-242 的像素角色成為「經典像素主角」「經典 Orbit」。在 Q 版中，它們對應上班族與 Orbit。
      - **離線**：
        - poster 的房間與家具也帶 `data-fallback-src`。
        - Pixi 把房間（含家具）、主角、夥伴分成三部分載入，只把載入失敗的部分換成 Q 版。
      - **預先快取**：全像素都不預先快取。
    - PS-250E2 完成（2026-10-22，v1.36.0）：
      - **風格表**：`art-pipeline/ps244-blender/room_styles.py`。每個房間風格是同一個場景、相機、家具造型與燈光，只換材質（顏色、粗糙度、金屬、光澤或發光）、地板、描邊色、白天的環境光與背景色。`default` 不變。
      - **管線**：`render_pack.py`／`process_pack.py`／`render_pixel.py`／`process_pixel.py` 新增 `--style`；路徑與 `outputs.json` 在 `art-pipeline/ps250-rooms/`。
        - 家具裁成預設房間同一時段的框，所以所有風格共用 `PROP_DEFINITIONS`。
        - 淺色房間的家具在亮的環境光與牆面反光下，周圍會有一大片很淡的陰影（alpha 30–55），在共用的框邊緣變成灰色的長方形。`shadow_floor`（北歐 56）去掉這層，接觸陰影保留；沒有它，夜晚會裁掉約 13.5 萬個像素。
        - 淺色房間的像素陰影用較淡的暖灰（`pixel_shadow`）；夜晚用深色的背景色（`backdrop_night`）。
      - **明亮北歐**：Q 版＋像素、白天＋夜晚，36 個檔案，約 1.04 MB。
      - **執行時**：
        - `getWorkspaceSceneAssets()` 的第四個參數加上 `roomStyle`，回傳 `roomStyle`；不認得的值（包括 legacy 的 `night`）畫預設房間。
        - poster 與 Pixi 從 model 的 `selectedThemeId`（view model 本來就有）傳入；退回對象是預設房間。
        - 沒有新增 import；開發者總覽自己列出風格 id，不 import 選擇介面的新 export（INFRA-105）。
      - **選擇**：Edit Mode 的「風格、房間與角色」新增「房間」（3:2 縮圖），寫入既有的 `world.selectedThemeId`。這個欄位舊版本也保留，所以混用時不會遺失。
      - **快取**：房間風格不預先快取，第一次顯示時下載。
    - PS-250E3 完成（2026-10-22，v1.37.0）：
      - 日式和風、夜貓工作室、深木書房，各有 Q 版＋像素、白天＋夜晚。四套房間風格共 144 個檔案，約 4.2 MB。
      - 深色房間也設 `shadow_floor`（40）：沒有它，夜貓工作室的夜晚會被共用的框裁掉約 2.8 萬個像素。淺色房間是 56。最多 107 個貼著家具邊緣的淡像素被裁掉。
      - 深木書房使用 Mastery 的色票，使用者明確選擇現在提供；art bible 註明未來的 Mastery 階段要以密度、輪廓、材質與房間功能區隔，不能只靠這組色票。
      - 已知限制：渲染中容器重新啟動過一次，日式和風的夜晚是分兩次渲染的（`--only` 補上 3 件）。每件家具本來就是同一個場景、同樣設定下各自渲染的，所以分兩次不影響結果。
    - PS-250F1 完成（2026-10-22，v1.38.0）：
      - **模型**：`ps244-blender/scene.py` 的 6 件裝飾（`DECOR_IDS`），與家具共用場景、相機、燈光與卡通材質。獎盃與地球儀在書架頂（時鐘兩側），懶骨頭在左前方的地板，落地燈在左後角，多肉盆栽與咖啡杯組（胡桃木托盤、手沖壺、兩個杯子）在書桌上。落地燈的燈罩夜晚發光，但不照亮房間：房間是共用的一張渲染，裝飾關掉時也不能改變它。
      - **管線**：`render_pack.py --only decor` 逐件渲染，支撐的家具當 shadow catcher，其他家具隱藏；房間與家具的渲染隱藏所有裝飾，所以既有檔案不變。`art-pipeline/ps250-decor/process_decor.py` 依家具的方式裁切，寫入 placement（`placements.json`，夜晚各有自己的框）、`DECOR_DEFINITIONS`、`outputs.json` 與預覽圖；像素版裁成 Q 版的框。24 個檔案，約 131 KB。
      - **draw order**：只有支撐的家具與裝飾重疊，所以各放在支撐物上一層：書架上 23、書桌上 25、落地燈 21、懶骨頭 31（椅子前、角色下）。
      - **執行時**：`getWorkspaceSceneAssets()` 回傳獨立的 `decorations`（舊的呼叫端不畫），第四個參數加上 `hiddenDecorations`。書架、書桌上的裝飾在支撐物出現時才顯示，也跟著支撐物的 placement 移動。poster 用家具的 class 與同樣的退回步驟；Pixi 每件各自載入，載入失敗的略過，房間不會因此退回預設。
      - **開關**：Edit Mode 的「風格、房間與角色」新增「裝飾」，每件一個開關（以裝飾本身當縮圖）。本機只記錄關掉的（`world.hiddenDecorations`），預設全部顯示；疊在最新已存的 state 上加入或移除一個 id，不認得的 id 保留。不碰獎勵、經濟與 ledger。舊頁面（不傳 `hiddenDecorations`）或舊 `assetManifest.js` 時不顯示開關（INFRA-105）。
      - **快取**：預設（全 Q 版＋藍色工作室）的 6 件裝飾白天與夜晚在 SHELL（+12 個檔案，約 119 KB）；manifest 38 → 50 個檔案；PS-243 完整場景 1,288,625 → 1,409,958 B。像素版按需下載。
    - PS-250F2 完成（2026-10-22，與 F1 同一個 PR #201、v1.38.0）：Codex 指出 F1 單獨合併時，選了房間風格又離線時 poster 退回預設房間卻沒有裝飾（Pixi 有），F2 讓每個房間都有自己的裝飾才是正解，所以兩者合併為一個 PR。
      - 四套房間風格各 6 件裝飾（Q 版＋像素、白天＋夜晚），換成該風格的材質；像房間風格的家具一樣，在 `shadow_floor` 之後裁成預設裝飾同一時段的框，所以共用 `DECOR_DEFINITIONS`。被裁掉的像素記在 `ps250-decor/outputs.json` 的 `clipped`（多半是很淡的陰影尾端，最多 366；夜貓工作室的落地燈夜晚 729，大多是霓虹燈條投在近乎全黑牆上的燈桿影子，並排比較看不出差別，其餘是燈座的接觸陰影超出框的下緣幾個像素，執行時約 1 px 的硬邊。只計算渲染的範圍（框加 48 px），影子碰到那一圈邊緣時管線會提示，目前沒有）。檔案在 `workspace/[pixel/]decor/styles/<style>/`，開發者總覽列在「裝飾」「像素裝飾」。不預先快取。
      - `render_pack.py --decor-boxes`：只渲染預設的框加 48 px（render border），每個時段約 5 分鐘（整個畫面約 35 分鐘）；與整個畫面的渲染只差取樣雜訊。`render_pack.py` 只在 `--only` 指名時渲染裝飾，完整的渲染仍只有房間與家具。
      - 獨立 review（F1 無 P1／P2）的 P3 一併處理：Pixi 的裝飾改為與 poster 相同的退回步驟（預設房間的 Q 版、白天），都無法載入才略過；補上測試（退回時保留收起的裝飾、舊 manifest 沒有 `decorations`、三處的支撐物一致）；標題改為「風格、房間、裝飾與角色」，開關以 `aria-describedby` 連到說明。
      - Codex 對 F2 的 P2：「裝飾」開關的圖片原本固定是藍色工作室的裝飾，改為所選房間的。複查（無 P1／P2）的 P3：Pixi 測試加上位置與「夜晚房間載入、夜晚裝飾失敗」；e2e 的房間退回也擋下風格裝飾，確認退回預設；`clipped` 只計算渲染的範圍並在影子碰到邊緣時提示。曾試過在框的邊緣淡出陰影，但最明顯的是緊貼物件的接觸陰影（為了保護描邊不能淡出），19 個檔案改變卻幾乎沒有效果，所以不採用，改為如實記錄。書架內原本就有一個小獎盃（PS-244），與書架頂的獎盃裝飾並存，視為一櫃獎盃，不改。
    - PS-250E1 完成（2026-10-21，v1.35.0）：
      - **渲染**：`scene.py` 的 `lighting='night'`：同一個場景與相機，沒有太陽，4 盞壁燈是主要光源、燈罩發光，補光與 world 調暗，窗外是深藍夜空與一半亮著的窗戶。白天的檔案、placement 與預覽圖不變。
      - **家具**：夜晚的影子朝畫面下方，每件夜晚家具有自己的裁切框與 placement（`placements.json` 的 `night`，`PROP_DEFINITIONS` 的第四個參數），draw order 與白天相同。書架在夜晚會遮住後牆的燈光，裁切框較大（218 KB）。
      - **像素**：同樣的夜晚燈光以 1/4 解析度渲染，裁成 Q 版夜晚的框。
      - **執行時**：`getWorkspaceSceneAssets()` 的第四個參數 `{ timeBand }`，傍晚與深夜回傳夜晚版本與 `lighting: 'night'`。夜晚房間上的色層改弱（Pixi alpha 0.1、poster opacity 0.5），相框與照片以 `brightness(0.65)` 調暗。不讀 `visualState.timeBand`（舊 poster 配新 manifest 會變暗兩次）；舊 manifest 不回傳 `lighting`，新的呼叫端維持原本的色層。
      - **預先快取**：預設的夜晚背景與 8 件家具在 SHELL（+9 個檔案，約 537 KB）；manifest 29 → 38 個檔案；PS-243 新增夜晚的首次繪製（104,205 B）。
      - **驗收**：在實際 app、兩種 UI 主題（深紫、Liquid Glass）下，以 22:00、18:00、12:00 截圖 Pixi 與 poster；離線 e2e 以固定時間檢查日、夜的 poster 都完整。
      - 離線：夜晚的圖片也無法載入時（改版中斷又離線），poster 與 Pixi 最後退回白天的房間與家具（家具用白天的 placement），不會空白（獨立 review 的 P2）。這時色層與相框仍是夜晚的設定（poster）。
      - 已知限制：
        - 檯燈與螢幕只在自己的輪廓內發光，不照亮桌面與牆（shadow catcher 只記錄陰影）。要光暈需另做疊加圖層。
        - 時段在每次 render 時計算，跨過 17:00 或 05:00 時下一次 render 才換版本（不新增計時器）。
        - `Pixi.Assets.load` 不釋放：同一次使用跨過時段時兩套都留在記憶體（解碼後白天約 8.1 MB、夜晚約 9.3 MB），仍在首頁 64 MB 預算內；與切換角色相同，不另外釋放。
        - 改版時 poster 與 Pixi 可能一新一舊，最多約 10 分鐘內一日一夜（INFRA-105）。
  - 完成（2026-10-22）：A（#194）、C（#195）、B（#196）、D（#197）、E1（#198）、E2（#199）、E3（#200）、F1＋F2（#201）、G（#202）都已合併。全 Q 版與全像素兩套可切換：主角 6 套、AI 夥伴 6 種（另有經典像素主角與 Orbit）、5 個房間（白天＋夜晚）、6 件可開關的裝飾；開發者總覽可看全部素材。只預先快取預設組合。

- [x] **PS-248** 以 Blender 擴充「空間」的主題與素材（提案）
  - 使用者 2026-10-20 要求：「需要更新更多 blender 做的主題與素材等，讓本工具更豐富」。
  - 現況：
    - V2 只有一套素材（`building-formal-workstation-v2`）與一個主題（`selectedThemeId: 'default'`，只儲存、沒有程式讀取）。V2 的 `selectedSceneId` 預設是 `rough-room`（`stateSchema.js`），`office-corner` 只是兩個 UI 的 fallback；兩者都只用於 telemetry，不影響畫面。`rough-room`、`upgraded-rental`、`office-corner` 是 legacy 頁面依等級切換的場景。
    - 由 Blender 渲染的只有房間 1 張與家具 8 件（`art-pipeline/ps244-blender`，PS-244～PS-247，同一個相機）。主角 12 個姿勢、Companion 6 個狀態、天氣 2 種是 PS-242 以影像生成製作再去背的 sprite／overlay（`art-pipeline/ps242/model-manifest.json`：`openai-built-in-imagegen`），不是 Blender 產出。
    - 角色是否改為 3D（Blender）仍是 handoff 中的開放決策；提案要說明角色與天氣是否在範圍內。
  - 範圍：標題把「本工具」解讀為「空間」分頁（目前只有這裡使用 Blender 素材）；提案要向使用者確認。
  - 第一步是提案（Mode A，只寫文件、不改程式碼），內容包括：
    - 新主題或場景的候選（例如不同房間風格、季節、時段）；
    - 每個主題需要的素材清單與渲染方式；
    - 與 unlock、經濟、專案進度的關係（主題怎麼取得）；
    - PS-243 預算與 PS-211A 預先快取的影響（新素材要不要進 SHELL）；
    - Blender 管線的工作量與驗收方式。
  - 核准前不渲染、不改程式碼。
  - 依賴：`PS-247`、`PS-211A`
  - In progress（2026-10-20）：提案見 [`docs/ps-248-blender-themes-proposal.md`](docs/ps-248-blender-themes-proposal.md)，等待使用者決定 §9。
    - 建議三個階段：PS-248A 夜晚版本的工作站（房間與家具的陽光是烘在圖裡的，夜晚只疊深藍色層仍看得到陽光；同場景、同相機重新渲染一套夜晚版本，夜晚家具有自己的 placement，夜晚色層改弱但保留）→ PS-248B 一套「房間風格」（同相機、同造型與燈光，換材質與色票）→ PS-248C 2–4 件裝飾小物（由 AI-202B 推導的資料解鎖）。窗外依時段變化（PS-248A2）可選。
    - A、B 超出 art bible §6.1 與 asset pipeline 的 vertical slice 上限「一張房間背景＋日夜疊層」，A2 超出「一張 exterior」，要使用者明確同意並更新這兩份文件。
    - 風格與裝飾不寫入 reward ledger、不新增 `world_unlock`。新房間、新相機、3D runtime、角色與天氣不在範圍內。
    - 使用者決定後，把核准的階段拆成 PS-248A／B／C 任務並寫入驗收條件（PS-248A 的草稿在提案 §8）。
  - 2026-10-21：使用者的 PS-250 決定取代 §9 的範圍（角色與 AI 形象在範圍內，上面「角色與天氣不在範圍內」不再適用）、擴充前提（同意擴充；art bible §6.1 與 asset pipeline 的上限要一併更新）、順序，以及快取（只預先快取預設，即 §6 的 S2）。PS-248A／B 併入 PS-250E，PS-248C 併入 PS-250F，不再另外拆成 PS-248A／B／C 任務。
  - 結案（2026-10-22）：由 PS-250 取代。PS-248A（夜晚版本）在 PS-250E1、PS-248B（房間風格）在 PS-250E2／E3、PS-248C（裝飾小物）在 PS-250F 完成；裝飾依使用者的 PS-250F 決定改為 Edit Mode 自由開關，不由 AI-202B 的資料解鎖。§9 中 PS-250 沒有涵蓋的兩項（A2 窗外依時段變化、§9.8 順帶整理）移到 **PS-251**（Backlog），沒有遺失。

- [x] **BUG-114** 專案已到 100% 後，reveal 仍顯示專案進度的增減
  - 問題（BUG-113 發現，2026-10-21）：工作站完成後，每個 Main Quest 日仍得到 `project_progress +25`，reveal 顯示 `workspace-upgrade +25`，但進度停在 100%（`projectEngine.js` 把總和截在 100）。撤銷完成那一天、由下一天接手時，reveal 顯示 `workspace-upgrade -25`，進度也仍是 100%。
  - 方向：與 BUG-113 的解鎖與關係相同，只顯示真的改變進度的專案進度行（比較前後的 `activeProject.progress`），或在完成後不再給專案進度。後者會改變 reward 規則與 ledger，要先提案。
  - 同樣地，完成後撤銷任何一天（仍有至少 4 個 Main Quest 日）都顯示 `-25`，進度仍是 100%。完成後 Companion 的「工作空間改變了…」與主角的慶祝也來自這些 reward。
  - 只是顯示問題：Gold、Main Quest 與 hidden stats 的增減都正確。
  - In progress（2026-10-21）：採用第一個方向（只顯示真的改變進度的專案進度行，不改 reward 規則）；Companion 的「工作空間改變了…」只在 reveal 顯示專案進度時出現。
  - 完成（2026-10-21，v1.31.9）：
    - `controller.js`：`getRevealContext()` 以 ledger 比較 reconcile 前後的 `activeProject.progress`；沒有改變時，專案進度的 reward 不顯示、不用來比對 ledger（與 BUG-113 的承接相同）。例外：接手使用者沒看過的專案進度（BUG-113 的 unseen）仍顯示。reward 規則與 ledger 不變。
    - `companionEngine.js`：「工作空間改變了…」只在 reveal 顯示（加入的）專案進度時出現；Main Quest 的 reveal 沒有顯示專案進度時，直接用 AI-204 已核准的「這次行動在空間裡留下了痕跡。」，不依當天的 Session。
    - 測試：`tests/unit/bug114ProjectProgressLines.test.js`；`bug113RevealReactions.test.js` 中完成後的第 5 天改為 Session 的台詞。
    - 未處理（少見）：同一次 reconcile 中多個 Main Quest 日一起讓進度改變時，每一筆都會顯示。例如 75% 時第 4、5 天一起加入，顯示兩筆 `+25`，進度只增加 25；100% 時一起撤銷第 4–6 天，顯示三筆 `-25`，進度只減少 25。目前只有 Session 流程會排 reveal（一次一個 Session），同步都是 `queueReveal: false`。
    - 清理已儲存的資料（Codex P2）：每次 reconcile 都把保留的 reveal 與最近變化中、不計入進度的 Session（依日期不在前 4 個 Main Quest 日）的 `+25` 移除，連同 reveal 的 id 清單；主要是清掉舊版本留下的。接手沒看過的進度也只在接手的 Session 計入進度時顯示。舊版本留下、未播放的撤銷 `-25` 無法判斷當時進度是否改變，不處理。
    - 已知限制：「計入進度」以清理當下的日期順序判斷，不是 reveal 排入時。若另一台裝置之後補上更早日期的 Main Quest，還沒播放的 `+25` 可能被移除（例如 50% 時第 5 天的 `+25` 未播放，之後同步到第 3、4 天）。同一台裝置的 Session 一律記在今天，不會發生。
    - 獨立 review 的 P1：第一版讓「未看過的 Main Quest 由當天較晚的 Session 接手」時的 `+25` 也被隱藏（BUG-113 已修好的情況），已補上例外與測試。

- [x] **BUG-113** 專案完成與撤銷的 reveal 讓 Companion 重複恭喜
  - 問題（AI-202 提案與其獨立 review 發現，2026-10-20；以 `reconcileRewardLedger` ＋ `applyReconciliationToV2State` ＋ `getCompanionReaction` 重現）：「專案完成」與 `major` 的判斷不看 reward 是加入還是撤銷，也不看專案原本是否已完成。
    - 專案完成後，每個 Main Quest 日的 reveal 都讓 Companion 再說「工作站完成了」：`revealSelectors.js` `isProjectCompletionReveal()` 的第二個條件是「進度 ≥ 100 且 reveal 含 `project_progress:workspace-upgrade`」，而 winner 每天都會得到 `project_progress +25`。
    - 專案完成後撤銷任何一個 Main Quest 日，reversal reveal 也讓 Companion 恭喜。
    - 撤銷完成那一天時，`hasCompletionReward` 不看方向，Companion 在撤銷時說「工作站完成了」。
    - 撤銷第 4 天、由第 5 天承接時，兩個 reveal 都是 `major` 並恭喜（`revealKind()` 對加入或撤銷的 `relationship`／`world_unlock` 都回傳 `major`）。
    - `selectProtagonistState()` 在 reversal 時也做慶祝動作。
  - 來源：第二個條件是 068af89 的文字判斷（`progress >= 100` 且文字含 `workspace-upgrade`），在 4aefa27 改寫時保留；沒有單元測試涵蓋它。`buildRevealEvents()` 產生的 reveal 都帶有型別化的 rewards。
  - 方向：
    - 「專案完成」由 `applyReconciliationToV2State()` 比較前後的 `activeProject.completed`（false → true）決定，記在 reveal 上；selector 不再從 reward 內容推測；
    - `revealKind()` 只把**加入**的、且真的改變狀態的解鎖與關係算成 `major`；
    - 只含被撤銷 reward 的 reveal → Companion 為 `observe`，並在此結束，排在專案完成、進度與「最新 Session」分支之前（現在 `isQuestOrProjectProgressReveal()` 不看方向，撤銷時會說「工作空間改變了…」；就算忽略撤銷，當天另有 Session 時也會變成 `approach`）；主角不慶祝；
    - 只是換一天承接時，不顯示解鎖或關係的行。
  - 回歸測試（在修正前會失敗）：第 5 天的 reveal；專案完成後撤銷第 6 天；撤銷第 4 天（有與沒有第 5 天）。撤銷時（包括當天另有有效 Session）Companion 是 `observe`＋`companion.observe`，既不是 `congratulate` 也不是 `approach`；主角不慶祝。
  - 影響 AI-202B：階段變化的 reveal 依賴這個修正（提案 §3.4、§9 第 9 點）。
  - In progress（2026-10-21）：實作修正與回歸測試。
  - 完成（2026-10-21，v1.31.8）：
    - `controller.js`：
      - 以 ledger 推導 reconcile 前的專案是否完成（儲存的 `activeProject` 可能不一致），由未完成變成完成時，在完成那一天的 reveal 記上 `projectCompleted: true`。完成的 reveal 還沒播放（包括舊版本排入、沒有這個欄位但加入完成 reward 的 reveal），而完成在這次 reconcile 改由另一個 Session 接手、使原本的 reveal 不再成立時，視為使用者還沒看過完成，接手的 reveal 也會標記。
      - 同一次 reconcile 中，加入與撤銷的同一個 reward（同 type、key、amount；當天的 Main Quest 再加上同一天，沒有日期就不配對）成對視為「換一個 Session 承接」：撤銷當天的 Main Quest 由當天較晚的 Session 接手，或完成由另一天接手。這些 reward 不顯示、不算 `major`，也不用來比對 ledger；只剩這些的 reveal 不排入；`direction` 依顯示的 reward 決定。被撤銷的 reward 若還在未播放的 reveal 中（使用者沒看過），接手的一方照常顯示為獲得，被撤銷的一方不顯示為失去。
      - `revealKind()` 只把加入的解鎖與關係算成 `major`。
    - `revealSelectors.js`：完成只看 `projectCompleted`；沒有這個欄位的舊 reveal 改用原本的判斷（解鎖、`formal-workstation` 或 `project-completion` tier），但只看加入的 reward。進度與世界進度只看加入的 reward。
    - `companionEngine.js`：只含撤銷的 reveal（`direction: 'reversal'`）→ `observe`＋`companion.observe`，排在所有分支之前。
    - `runtime/pixiSceneRuntime.js`：主角只在 view model 的狀態是 `celebrate` 時跳動（原本任何 reveal 都跳）。
    - `ui/orbitWindow.js`：舊版本留下、`kind: 'major'` 的撤銷 reveal 以 `medium` 顯示。
    - 為了 INFRA-105，沒有在既有 SHELL 模組之間新增 import／export：判斷寫在各自的模組內。
    - 測試：`tests/unit/bug113RevealReactions.test.js`（以真實的 reconcile 重現 tasks 列出的情境，加上當天由較晚的 Session 接手、被接手的 reveal 還沒播放、儲存的專案狀態與 ledger 不一致、舊 reveal 相容）與 Pixi 的跳動測試。以修正前的程式碼執行時都會失敗；其中四個只因為缺少 `projectCompleted` 欄位，其他都是因為行為。
    - 已知限制：
      - 完成那一天在另一台裝置被刪除、本機以不排 reveal 的同步（`queueReveal: false`）收到時，未播放的完成 reveal 被移除，接手的那天也不恭喜。
      - 沒看過的獲得被撤銷、而沒有其他 Session 接手時，仍顯示為失去（與修正前相同，`undo` 的既有測試也這樣要求）。AI-202B 的 `presentedMilestones` 以使用者看過的狀態為基準，可以一併檢討。
    - 未處理（極少見）：舊版本留下、`direction: 'mixed'` 且唯一的解鎖或關係是撤銷的 reveal，仍以 `major` 顯示。
    - 另外發現：專案已到 100% 後，進度 reward 的行仍顯示 `workspace-upgrade +25`／`-25`，見 BUG-114。

- [x] **INFRA-106** 查明 Focus 提前結束 e2e 的間歇性逾時
  - 問題：`tests/e2e/flows.test.js` 的「Focus 計時流程」提前結束兩個測試（:175、:189）在 CI 上偶發 `Test timeout of 15000ms exceeded`，與 PR 內容無關；本機較快，先前沒有重現。
  - 紀錄：
    - 2026-10-19：3 次（只改版本號的 commit 也失敗，重跑通過）；
    - 2026-10-20：#190 的 f62434c（純文件 PR）在 :189 失敗，第一次與 retry 都逾時。這次有 INFRA-102 上傳的 artifact：run 39412397253 的 `playwright-test-results`，保留到 2026-10-27。
  - 方向：
    - 先看 artifact 的 `error-context.md` 與截圖，確認卡在哪一步（`#early-end-confirm-btn`、overlay 關閉或 `.log-item`）。目前 agent 的 GitHub 工具不能下載 artifact，需要使用者下載，或改用其他方式取得；
    - 依原因讓測試穩定，例如等待正確的狀態而不是固定逾時；或修正 app 本身的競態。
  - 不可跳過、停用或隔離這兩個測試。
  - In progress（2026-10-20）：#190 的 e2e 連續 4 次失敗（含一次重跑），依規則把修正併入 #190。
  - 完成（2026-10-20，v1.31.7）：原因是 Orbit Window 的 Pixi 場景一直在重畫。Focus overlay（92% 黑）蓋住整個 app 時沒有暫停；減少動態效果時場景不動，也每一幀重畫。CI 的軟體 WebGL 下每幀約 117–133 ms，Playwright 每次點擊都要等元素穩定，較慢的 runner 上就超過 15 秒（失敗的 run 都是 4.1–4.3 分鐘，通過的約 2.5 分鐘）。
    - `ui/orbitWindow.js`：以 MutationObserver 觀察 `#focus-overlay` 的 class，overlay 開啟時暫停 runtime、關閉時恢復；卸載時解除。
    - `runtime/pixiSceneRuntime.js`：減少動態效果時只畫一次、不啟動 ticker；`resume()` 與 context 恢復也遵守。
    - 結果：overlay 下每幀回到 16.7 ms；這個測試在本機由 7.7 秒降到 4.5 秒。
    - 依獨立 review 補強：`render()` 在減少動態效果且已 ready 時重畫一次；WebGL context 恢復期間收到的暫停或恢復以最後一次為準（原本就有的競態）。
    - 測試：單元測試五項、e2e 一項（Focus 開始後 runtime 為 `suspended`，縮小成 PiP 時同一個場景恢復為 `ready`，展開後再次 `suspended`），刪掉修正中的任何一行都有測試會失敗。
  - 不需要下載 artifact：在本機以軟體 WebGL 量測每幀時間即可找到原因。

- [x] **INFRA-104** 讓 `pwa/sw.js` 與 Node 端的腳本也被 lint
  - 問題（INFRA-103 獨立 review 發現，2026-10-20）：`npm run lint` 只涵蓋 `pwa/js/**/*.js` 與 `tests/**/*.js`。`pwa/sw.js`（PS-211A 要改）、`pwa/server.cjs`、`scripts/*.mjs`、設定檔都沒有被 lint；`eslint.config.js` 中給設定檔的區塊因此從未生效。以目前的設定直接 lint `sw.js` 會因 service worker 的 globals（`self`、`caches` 等）報 17 個 `no-undef`。
  - 方向：在 `eslint.config.js` 為 `pwa/sw.js` 加上 service worker globals、為 Node 腳本加上 Node globals，並把它們加入 `lint` script。
  - **修改既有設定（eslint 設定與 CI 執行的 script），需使用者核准**。
  - **2026-10-20 使用者核准。** In progress（2026-10-20）。
  - 完成（2026-10-20）：
    - `lint` script 改為 `eslint .`（不需要 glob，Windows 也適用）。`eslint.config.js` 加上：
      - 全域 ignores：`pwa/vendor` 與輸出目錄，以及 `.gitignore` 中只存在於本機的資料夾（venv、`.claude/worktrees` 等；flat config 不讀 `.gitignore`）；
      - `pwa/sw.js`（classic script，service worker globals）；
      - Node 腳本與設定檔（`scripts/`、`art-pipeline/`、`skills/` 的 `.mjs`、`tests/perf/*.mjs`、三個 config）；
      - `pwa/server.cjs`（CommonJS）。
    - 檢查的檔案由 178 個（INFRA-103 的 176 個加上 PS-211A 的兩個測試）增加到 195 個，全部通過。只需要小幅調整：`ps243-perf-baseline.mjs` 在瀏覽器端改用 `globalThis.navigate`，`tests/perf` 兩個檔案移除已由設定提供的 globals。
    - globals 只列出檔案實際用到的；`pwa/server.cjs` 的 `require`／`module` 由 `sourceType: 'commonjs'` 提供（保持 `module` 唯讀）。
    - 在 `sw.js` 加入未定義的呼叫時，`npm run lint` 會失敗。

- [x] **PS-211A** service worker 預先快取 V2 poster 素材與 Pixi（A3 ＋P）
  - 規格：同上提案 §4.1、§4.3、§5 A。使用者 2026-10-20 核准 A3 ＋P（部署行為）。
  - 驗收條件：
    - SHELL 不含 `assets/personal-space/idle-window/` 下的任何檔案。
    - SHELL 含 A3 的 22 個 V2 檔案（背景、主角 idle／celebrate／inspect／rest／work 朝左、Companion 6 個狀態、晴天與雨天特效、8 件家具）與 `./vendor/pixi.js`。單元測試從 `assetManifest.js` 推導這組路徑，檢查都在 SHELL 字面值中。
    - 這些圖片與 `pixi.js` 在 install 時以 `cache: 'no-cache'` 的 Request 取得；路徑仍寫在 `const SHELL = [...]` 字面值裡。
    - e2e：service worker 安裝後，快取中有這些檔案。離線重新整理時：首頁 poster 在程式碼會產生或 state 可能帶有的狀態下都完整顯示（至少一個非預設的主角／Companion 狀態與雨天）；runtime 以快取的 `pixi.js` 進入 ready（＋P 的效果）。
    - 新增測試，確認頁面本身仍不在初始載入時取得 Pixi（技術設計 §12.1；目前沒有這樣的測試）：`index.html` 與 `app.js` 的靜態 import 圖不引用 `vendor/pixi.js`；e2e 中頁面發出的請求（排除 service worker 自己的請求，`request.serviceWorker()`）在 runtime mount 之前不含 `pixi.js`。
    - legacy 在線上仍可正常顯示。
    - 注意：`pwa/sw.js` 不在 `npm run lint` 範圍內（INFRA-104），改 `sw.js` 時要手動檢查。
    - 技術設計 §12.1 與 §12.2 更新：service worker precache 的 poster 素材與 Pixi 不算首頁載入。
    - lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。
  - 版本：`npm run bump -- patch`。
  - 依賴：`PS-211`、`PS-211B`
  - In progress（2026-10-20）。
  - 完成（2026-10-20，v1.31.6）：
    - `sw.js`：SHELL 移除 legacy 圖片，加入 22 個 V2 poster 檔案與 `./vendor/pixi.js`。install 時以 `REVALIDATE_ON_INSTALL` 篩出圖片與 Pixi，改用 `new Request(path, { cache: 'no-cache' })`。
    - 技術設計 §12.1、§12.2 更新。
    - 測試：
      - `tests/unit/ps211aPrecache.test.js`（5 項）：從程式碼推導 22 個檔案、排除 legacy、加入 Pixi、install 時重新驗證、§12.1 的靜態 import 圖；以舊的 `sw.js` 執行時其中 3 項失敗。
      - `tests/e2e/sw-precache.test.js`（4 項）：
        - 離線且素材／Pixi 網路請求被擋下時，雨天＋rest 的 poster 完整、runtime ready（以舊的 `sw.js` 執行時，雨天特效載入失敗）；
        - 首頁上頁面請求 `pixi.js` 的時間晚於 DOMContentLoaded，且不早於 runtime 進入 loading（在 `app.js` 加上提早的 import 時會失敗）；
        - legacy 在線上照常顯示 idle-window 背景；
        - 沒有 Orbit Window 的頁面不由頁面請求 Pixi。
    - e2e 注意：`context.setOffline(true)` 擋不到 service worker 自己的請求，要另外以 `context.route` 擋下，才能證明檔案來自預先快取。
    - `pwa/sw.js` 不在 `npm run lint` 範圍內（INFRA-104），以 `node --check` 與加上 service worker globals 的 eslint 手動檢查過。
    - 獨立 review（396f9c5）：所有驗收條件達成；模擬改版（v1 → v2，關掉伺服器後重新整理）確認首頁與完整世界在 100%、rest、雨天下都完整、runtime ready。依其 P3 補強：e2e 改為 100% 進度（7 件家具都實際顯示）、legacy 測試改在 service worker 控制下執行、單元測試釘住「狀態都是字面值、沒有程式碼設定 facing」的前提、文件用詞。Safari／iOS 未驗證（環境沒有 WebKit）：若 Safari 忽略 `Request.cache`，只是退回原本的行為。
    - 範圍外的既有問題記為 INFRA-105（需核准）。

- [x] **PS-211B** 新場景畫完前隱藏 canvas；首頁 → 空間沿用 Pixi app
  - 規格：[`docs/ps-211-asset-preload-cache-proposal.md`](docs/ps-211-asset-preload-cache-proposal.md) §4.2、§4.4、§5 B。使用者 2026-10-20 核准，包含沿用 Pixi app 的最佳化。
  - 驗收條件：
    - `.orbit-window:not(.is-runtime-ready) .orbit-window-canvas` 為 `visibility: hidden`：新場景畫完、`is-runtime-ready` 加上之前，canvas 不可見，畫面顯示新狀態的 DOM poster（技術設計 §9.2）；有測試。
    - 首頁 → 空間 → 首頁的過程中，Pixi `Application` 只建立一次（以假的 Pixi 計數）；任何時刻最多一個 Application，離開時仍會正確 release／destroy。
    - 既有的 runtime lifecycle、context lost／restored、e2e 的 canvas 數量與尺寸檢查通過。
    - lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。
  - 版本：`npm run bump -- patch`。
  - 依賴：`PS-211`
  - In progress（2026-10-20）。
  - 完成（2026-10-20，v1.31.5）：
    - `style.css`：`.orbit-window:not(.is-runtime-ready) .orbit-window-canvas { visibility: hidden; }`。
    - `pixiSceneRuntime.js`：`createDeferredRuntimeDestroyer()` 新增 `hold()`。`router.js` 載入 lazy 路由期間持有 hold，排程中的銷毀會等到路由畫完；沒有頁面 `retain()` 時，最後一個 hold 釋放即銷毀。延遲仍是 0 ms，登出仍用 `destroyNow()`。`mount()` 與 context 恢復時，先 `app.render()` 畫出新場景，再加上 `is-runtime-ready`。
    - Codex review（b9e56fa）的兩個 P2 據此修正：原本的 2 秒交接在 lazy import 超過 2 秒時仍會重建；`is-runtime-ready` 加上時，沿用的 canvas 在下一個 tick 前仍是舊畫面。
    - 測試：`personalSpacePixiRuntime.test.js` 三項（hold 期間保留、無人接手時銷毀一次；假 Pixi 只建立一個 Application；加上 `is-runtime-ready` 前先畫）；`flows.test.js` 的 runtime 路由 e2e 加上 Application 相同與 canvas `visibility` 的檢查（拿掉 CSS 規則或 router 的 hold 時都會失敗）。
    - 注意：reduced motion 的樣式讓每個元素都有極短的 transition，`visibility` 的計算值會延後一個 frame 才改變；e2e 讀取時暫時關掉 canvas 的 transition。

- [x] **INFRA-103** `lint` script 的 glob 加上引號，讓 eslint 檢查所有檔案
  - 問題（AI-204B 獨立 review 發現，2026-10-19 確認）：`package.json` 的 `"lint": "eslint pwa/js/**/*.js tests/**/*.js"` 沒有引號。npm 用 `sh` 執行，`**` 等同 `*`，所以 `npm run lint`（含 CI）只檢查 `pwa/js` 下剛好兩層的 37 個檔案與 `tests/*/*.js`；`pwa/js` 第一層的 22 個檔案（`app.js`、`storage.js` 等）與更深的 V2 模組都沒有被 lint。
  - 方向：改成 `eslint 'pwa/js/**/*.js' 'tests/**/*.js'`，由 eslint 自己展開。2026-10-19 以加引號的 glob 執行，目前所有檔案都通過，不需要另外修程式碼。
  - **修改既有設定（CI 執行的 script），需使用者核准**。
  - **2026-10-20 使用者核准。** In progress（2026-10-20）。
  - 完成（2026-10-20）：`"lint": "eslint \"pwa/js/**/*.js\" \"tests/**/*.js\""`。用雙引號而不是單引號，Windows 的 `cmd` 也能由 eslint 自己展開。`npm run lint` 檢查的檔案由 110 個增加到 176 個，全部通過，不需要修改程式碼。範圍是 `pwa/js` 與 `tests` 下的 `.js`；`pwa/sw.js`、`pwa/server.cjs`、`scripts/*.mjs`、`tests/perf/*.mjs` 與設定檔仍不在範圍內（見 INFRA-104）。

- [x] **PS-211** 為 personal space 新增常用資產 preload / cache 策略
  - 目標：降低切換頁面或切回 personal space 時重新顯示圖片的等待感
  - 範圍：`pwa/js/personalSpace/`、service worker / asset loading 相關模組、相關測試或文件
  - 完成條件：目前常用場景素材可預載或快取，window view 與主要家具切頁後不再明顯延遲出現
  - 備註：應在主要場景與資產集合較穩定後再做，避免過早優化 placeholder 階段的載入策略
  - In progress（2026-10-19）：提案（Mode A：文件與手動量測腳本，不改 app 程式碼）。本任務寫於 Personal Space V2 之前，先在真實瀏覽器量測 V2 目前切頁、首次載入與改版後的等待，再決定範圍；可能涉及 service worker 快取方式（部署行為），核准前不實作。
  - 提案（2026-10-20）：[`docs/ps-211-asset-preload-cache-proposal.md`](docs/ps-211-asset-preload-cache-proposal.md)（經 Codex 四輪與獨立 review 後改寫）。量測結果：
    - 同一次使用中切頁已沒有等待（V2 與 legacy 都是 0 網路請求）。
    - 仍會等的：改版後第一次載入時，若 HTTP cache 沒有素材的副本（限速下 poster 晚 2–4 秒；是否發生取決於 GitHub Pages 的 ETag 是否隨部署改變，尚未驗證）；狀態第一次改變時（新圖片 0.4–1.0 秒，期間 canvas 顯示舊房間）；SHELL precache 1.99 MB V2 用不到的 legacy 圖片。
    - 建議改寫範圍並拆成 PS-211A（SHELL 改放 poster 會用到的 22 個 V2 檔案，建議 A3，屬部署行為需核准）、PS-211B（新場景畫完前隱藏 canvas）、PS-211C（只在選 A2 時需要）；跨版本長期快取暫緩（提案 §7）。
  - 完成（2026-10-20）：提案 #185 合併；使用者核准 A3 ＋P、PS-211B（含沿用 Pixi app）；實作移到 `PS-211A`、`PS-211B`，長期快取記為 `PS-211D`。

- [x] **AI-204B** 實作共用的 Companion 文案表（AI-204 核准的規格）
  - 規格：[`docs/ai-204-companion-dialogue-proposal.md`](docs/ai-204-companion-dialogue-proposal.md) §5。使用者 2026-10-19 核准：文字 W-A（首頁小卡目前的 8 句），COMPANION 小卡最多兩行（L2，只套用在 `[data-orbit-companion]`），夥伴名稱統一為「Orbit 夥伴」。
  - 驗收條件（提案 §7）：
    - 程式碼中只有一份 Companion 文案表；首頁小卡、toast、完整頁面的小卡、dock 與詳細資訊面板都從它取字；
    - 8 個 key 的文字與 W-A 完全相同；
    - 同一份 snapshot，各位置顯示相同的台詞，夥伴名稱都是「Orbit 夥伴」；
    - 320、360、390、414、1024 px 寬度與 200% 縮放下，8 句在小卡上完整顯示，不被截斷；專案小卡的階段文字維持單行；PS-243 的 e2e 通過；
    - lint、test、e2e、`ps242:manifest -- --check`、`ps243:assets -- --check` 通過。
  - 版本：`npm run bump -- patch`。
  - 依賴：`AI-204`
  - In progress（2026-10-19）。
  - 完成（2026-10-19，v1.31.4）：新增 `pwa/js/personalSpace/v2/content/companionDialogue.js`（`COMPANION_NAME`、凍結的 `COMPANION_DIALOGUE`、`getCompanionDialogue()`，未知 key 回到 `companion.observe`）；`ui/orbitWindow.js` 與 `pages/personalSpaceV2.js` 刪除各自的文案表與名稱，改從共用模組取字；telemetry 的 `interactionKey` 允許清單改用 `COMPANION_DIALOGUE_INTERACTION_KEYS`；L2 只套用在 `[data-orbit-companion]` 的台詞；`sw.js` 的 `SHELL` 加入新模組。
    - 測試：`tests/unit/ai204CompanionDialogue.test.js`（8 項；只加入共用模組、不改呼叫端時，telemetry 清單、唯一來源與各畫面一致的測試會失敗）；`tests/e2e/companion-dialogue.test.js`（6 種寬度／縮放，首頁與「空間」頁；拿掉 L2 規則或句子超過兩行時會失敗）。
    - 獨立 review（Codex 無 finding）：P2 跨畫面測試原本沒有從同一份輸入建立首頁、也沒有檢查提示文字，已補上；P3 e2e 的行數改為量不截斷時的自然行數、`空間` 頁也量、文件用詞修正。另發現 `lint` script 的 glob 沒有加引號，CI 只檢查 `pwa/js` 下剛好兩層的檔案，見 `INFRA-103`。

- [x] **AI-204** 統一 Companion 台詞文案（提案）
  - 問題（AI-203 盤點時發現）：8 個 Companion 台詞 key 在 `pwa/js/personalSpace/v2/ui/orbitWindow.js` 與 `pwa/js/pages/personalSpaceV2.js` 各有一份文字，其中 7 個不同（`companion.goal.gentle-reminder` 已在 AI-203B 統一）。
  - 方向：收斂成一份文案表，兩處共用；文字由使用者選定。`companion.goal.gentle-reminder` 已在 AI-203B 決定。
  - In progress（2026-10-19）：提案 [`docs/ai-204-companion-dialogue-proposal.md`](docs/ai-204-companion-dialogue-proposal.md)（Mode A，只寫文件，經 Codex 與獨立 review 後改寫）。建議新增共用文案模組，文字採首頁小卡版（W-A），COMPANION 小卡改為最多兩行（L2）：目前小卡是單行截斷，常見寬度下兩版文字幾乎都只顯示半句，點擊後的 toast 在窄手機上也會超出畫面。順帶發現夥伴名稱也不一致（首頁一律 `Orbit Guide`，完整頁面「Orbit 夥伴」）。
  - **2026-10-19 使用者核准**：W-A（首頁小卡版文字）＋L2（COMPANION 小卡最多兩行），夥伴名稱一併統一為「Orbit 夥伴」。提案 §5 的共用模組就是本任務原本的方向（一份文案表、兩處共用）。下一步：比照 AI-203，AI-204（提案）移到 Done，另立 AI-204B 依提案 §5、§7 實作。
  - 完成（2026-10-19）：提案 #181 合併，使用者核准 W-A＋L2＋夥伴名稱；實作移到 `AI-204B`。

- [x] **INFRA-102** e2e 失敗時上傳 Playwright 的 test-results
  - 問題：2026-10-19 CI 上 `tests/e2e/flows.test.js` 的 Focus 提前結束測試（:175、:189）偶發 `Test timeout of 15000ms exceeded`，與 PR 內容無關，本機無法重現；CI 沒有上傳 artifact，看不到卡在哪一步。
  - 範圍（使用者 2026-10-19 核准）：`.github/workflows/ci.yml` 的 e2e job 在失敗時以 `actions/upload-artifact` 上傳 `test-results/`（截圖與 error-context）；不改測試、Playwright 設定與部署流程。保留 7 天是實作時的選擇（預設 90 天）。
  - 完成條件：e2e 失敗時，該次 workflow run 有可下載的 artifact；成功時不上傳；其他 job 不變。
  - 完成（2026-10-19）：e2e job 新增 `if: failure()` 的 `actions/upload-artifact@v4` 步驟（`playwright-test-results`，`test-results/`，保留 7 天，沒有檔案時略過）。未改 Playwright 設定（`screenshot: 'only-on-failure'` 與 error-context 是既有輸出）。失敗路徑尚未實際觸發，下一次 e2e 失敗時確認 artifact 存在。限制：沒有 trace（要加需改 Playwright 設定，另行核准）；CI `retries: 1` 下第一次失敗、重試通過的 run 是綠的，不會上傳。

- [x] **PS-247** 椅子右扶手與一個腳輪畫在書桌邊櫃之上
  - 問題（PS-245 誠實評估記錄）：3D 中椅子的右扶手與一個腳輪位於書桌邊櫃後方，但椅子的 PNG（z 30）疊在書桌（z 24）之上，所以這兩部分畫在邊櫃前面，約 10 px。PS-244 起既有。
  - 方向：渲染椅子時把書桌設為 holdout（只擋住相機、不投影、不出現、不描邊），讓被擋住的部分在椅子 PNG 中透明；書桌與椅子都在 25% 階段出現且位置固定（PS-246），所以兩者總是同時存在。
  - 範圍：`art-pipeline/ps244-blender/scene.py`（`PROP_OCCLUDERS`）、`render_pack.py`、重新渲染並處理素材（`process_pack.py --write-runtime`）、`ps242`／`ps243` gate、`ps243AssetBudget.test.js` 的位元組數。
  - 完成條件：五階段預覽中椅子的右扶手與腳輪不再畫在邊櫃之上；被擋住的部分沒有殘留的描邊；其他家具不變；`ps242:manifest -- --check`、`ps243:assets -- --check`、placement 與預算測試通過。
  - 完成（2026-10-19，v1.31.3）：`scene.py` 新增 `PROP_OCCLUDERS`（`office-chair` ← `corner-desk`）；`render_pack.py` 在椅子的渲染中把書桌換成 Holdout 材質並關掉陰影、彈射與描邊。用材質而不是物件層級的 `is_holdout`，是因為 Freestyle 不把 holdout 物件納入可見性判斷，被擋住的邊仍會被描線（第一版實測出現殘影）。只重新渲染椅子；其他家具的重新渲染只有取樣雜訊差異，保留原本的素材。椅子寬度 8.854% → 6.25%。

- [x] **HW-113** 今日計畫的日期與 effective date 對齊
  - 問題（AI-203 盤點時發現）：今日計畫存成 `{ date, taskIds }`，`date` 是日曆日；Sessions 與 V2 快照用 `newDayHour` 切日。`saveDailyPlan()` 在午夜後儲存會把整份舊計畫蓋上新日期。vertical slice §7.1 要求兩者對齊。
  - 影響：Main Quest 的行動目標、首頁今日計畫、AI-203B 的提醒（目前以「00:00 到 `newDayHour` 不提醒」迴避）。
  - 完成（2026-10-19，[#180](https://github.com/yoyoCadence/Orbit/pull/180)，v1.31.1）：`getDailyPlan()`／`saveDailyPlan()` 改用 `effectiveToday(newDayHour)`（預設 5 點，與 `dayCycle.eToday()` 相同）；新增 `storage.currentDailyPlan()`，app 開著跨過 `newDayHour`、day watcher 尚未重設時，`addToDailyPlan`／`removeFromDailyPlan` 與首頁拖曳排序從空的計畫開始；`dayCycle` 的換日改為重新讀取計畫，不再寫入空的計畫，避免清掉換日前一分鐘內加入的任務。AI-203B 的「00:00 到 `newDayHour` 不提醒」是已核准的驗收條件，未修改（設定頁只提供 0–8 點，不會與 12:00–14:00 重疊）。
  - 已知限制：舊版在 00:00 到 `newDayHour` 之間存下的計畫帶的是隔天的日曆日。升級後到 `newDayHour` 之前它不會顯示，這段時間的編輯會從空的計畫開始；若都沒有編輯，`newDayHour` 之後會顯示一次。舊紀錄沒有時間，無法精確轉換。
  - 另外發現（未處理）：Tour 把教學任務加入計畫後只從記憶體移除，儲存中仍留著 `tour-task`。

- [x] **AI-203B** 實作 Companion `remind`（AI-203 核准的規格）
  - 規格：[`docs/ai-203-companion-remind-proposal.md`](docs/ai-203-companion-remind-proposal.md)。使用者核准的選項：目標來源 A（今日計畫中符合 `isMainQuestTaskEligible()` 的任務）、G1（有 Session 的日期少於 3 天不提醒）、M1（Momentum 不變）、F4（只在本地時間 `[12:00, 14:00)` 提醒）、D2（靜態 fallback 的 `remind` 動畫只播一次）。
  - 台詞：`companion.goal.gentle-reminder` 在 `ui/orbitWindow.js` 與 `pages/personalSpaceV2.js` 都改為「你選擇的目標還在這裡，準備好時再開始。」
  - 驗收條件：提案 §8 中適用於 A、G1、F4、D2 的各條（不含「選 F3 時」）。
  - 範圍：`pwa/js/personalSpace/v2/viewModels.js`（推導 `missedPatterns`，取代 `coreState.missedPatterns`）、首頁小卡與完整頁面的時段計時器與 `visibilitychange`、`pwa/assets/style.css`（D2）、相關測試；`companionEngine.js` 不改。
  - 版本：`npm run bump -- minor`（新行為）。
  - 依賴：`AI-203`
  - 完成（2026-10-19，#177，v1.31.0）：`viewModels.selectRemindGoals()` 從今日計畫推導 `missedPatterns`（A、G1、F4、日曆日等於 effective date、今天尚未推進）；新增 `remindWindow.js`，首頁小卡與完整頁面在 12:00／14:00（過夜則隔天 12:00）與回到前景時重新判斷，unmount 時取消；重新判斷時保留打開的詳細資訊面板與鍵盤焦點（不捲動頁面）；D2 的 CSS；`companionEngine.js` 與 Momentum 不變，不寫入 state。

- [x] **PS-246** V2 家具不應套用舊 16:9 相機的位置覆寫
  - 問題（PS-244 審查時發現）：V2 直接採用遷移自 legacy idle window 的 `idleWindowLayouts[*].placements` 與 `placedItems`。它們的 id 與 V2 家具相同，但座標屬於舊的 16:9 left／center／right 相機，家具因此離開房間中對應的位置。
  - 提案與決定：[`docs/ps-246-v2-placement-overrides.md`](docs/ps-246-v2-placement-overrides.md)（#171）；使用者 2026-10-18 核准方案 A、A1、不建立 PS-246B、S1。
  - 驗收條件（提案 §8）：
    - V2 state 中有 legacy 覆寫時，8 件家具的 placement 與 `PROP_DEFINITIONS` 完全相同，小卡與完整頁面都一樣；
    - `world.idleWindowLayouts`、`world.placedItems` 與 legacy 的 `personal-space-state` 在載入、儲存、Edit Mode 進出之後不變；
    - Edit Mode 不列出、不調整、也不清除 legacy 項目；空狀態顯示說明文字；
    - 切回 legacy runtime 時，legacy 場景仍顯示原本的擺放；
    - lint、test、e2e 通過。
  - 完成（2026-10-19，#176，v1.30.1）：V2 的 `placements` 固定為 `{}`；Edit Mode 只顯示說明；移除不再使用的編輯程式碼與樣式；technical design §7.2 改為 S1；回歸測試涵蓋 view model、store 儲存與載入、Edit Mode 進出。

- [x] **AI-203** Companion `remind` 的資料來源與頻率提案（Mode A，只產出規格）
  - 現況（AI-201 盤點時發現）：`companionEngine.js` 只有在 Low Momentum 且 `missedPatterns` 含使用者選定目標時才回傳 `remind`，但 `viewModels.js` 讀取的 `coreState.missedPatterns` 沒有任何寫入點，所以這個狀態在 production 永遠不會出現。
  - 交付物：一份提案，決定「使用者選定目標」的資料來源（Goals 頁的目標或 V2 state 的新欄位）、`missedPatterns` 的計算方式，以及 bounded remind 的頻率上限與冷卻規則
  - 完成條件：提案經使用者核准；核准後才建立實作任務 `AI-203B`，並把核准的規則寫成它的驗收條件
  - 對應 roadmap：Phase 2
  - In progress（2026-10-18）：提案 [`docs/ai-203-companion-remind-proposal.md`](docs/ai-203-companion-remind-proposal.md) 已完成（依獨立 review 改寫），**等待使用者核准**。
    - 盤點結果：沒有「目標」資料模型（`goals` 已由 `tasks` 取代，Goals 頁是完成紀錄）。建議以今日計畫中符合 Main Quest 資格的任務作為使用者選定的目標。
    - review 修正：沒有 Session 的新使用者 Momentum 是 `low`，所以需要「歷史不足不提醒」；今日計畫用日曆日、Sessions 用 `newDayHour`，且午夜後儲存會把舊計畫改成新日期，所以只用首頁顯示的計畫，並在 00:00 到 `newDayHour` 之間不提醒。
    - 待另立：今日計畫的日期模型與 effective date 對齊（影響 Main Quest 與首頁）；8 個 Companion 台詞在兩個檔案的文字統一。
    - 待使用者決定：目標來源（A／B）、歷史不足（G1／G0）、Momentum（M1／M2）、頻率（F4 每日固定時段，建議／F3／F1／F2）、靜態 fallback 動畫（D2／D1）、台詞，以及是否另立上面兩個任務。
  - 完成（2026-10-18）：提案 #172 合併，使用者核准全部建議；實作移到 `AI-203B`。

- [x] **PS-245** Blender 工作站精細化（使用者要求「精細模型」）
  - 目標：在 PS-244 的同一管線上提高模型與房間細節，讓小卡尺寸也看得出材質與結構。
  - 範圍：家具真實結構（倒角、桌腳與走線槽、五爪腳與扶手、螢幕外殼與支架、鍵帽、滑鼠、桌面小物）；房間細節（吸頂燈或燈具、門、百葉窗、踢腳板、地毯、插座、牆面掛畫、程序化木紋）；檢討相機取景讓家具在 Orbit Window 小卡上更大。
  - 不含：主角與 Companion 的 3D 化（範圍大、會推翻 PS-242 已核准的像素角色，需使用者另行決定）。
  - 完成條件：五階段預覽在 100% 與小卡尺寸都通過目視 QA；`ps242`／`ps243` gate 與預算通過；placement 測試通過。
  - 依據：使用者 2026-10-17 的原始需求「用 blender 的精細模型去完善『空間』分頁」，PS-244 交付一致性後接續處理。本任務由 Backlog 直接進入 In Progress，沒有經過 Next。
  - 完成（2026-10-18，v1.30.0）：
    - `scene.py` 新增 `Builder.tube`／`panel`／`screen`、numpy 繪製的螢幕 UI，以及木紋與軟木材質。
    - 8 件家具都已補上真實結構：倒角、桌腳與走線槽、五爪腳與扶手、螢幕外殼與支架、鍵帽、滑鼠、桌面小物。
    - 房間加入：壁燈（取代吸頂燈：天花板是切掉的，吸頂燈會懸空）、捲簾與窗簾、地毯、插座、時鐘、護牆框線板、木紋。
    - 壁燈不投影，避免在自己的光暈裡留下暗影。
    - 相機與角色寬度不變。
  - 範圍內刻意不做：
    - **門**：左牆在畫面上只占約 6% 寬，看不到。
    - **牆面掛畫**：後牆空白處保留給 HW-105 成就相框（DOM 疊層），掛畫會與它搶位置。
    - **重新取景**：改相機必須重新校準角色比例並更新所有 placement，也會讓 PS-246 的舊座標問題更複雜。改用地毯讓前景有落點。
  - 驗證：
    - `ps242:manifest -- --check`、`ps243:assets -- --check` 通過。
    - 素材大小：首屏與完整場景的位元組數見 CHANGELOG。
    - 目視 QA：五階段預覽在 100% 與小卡尺寸（360 px 寬）都看過。
  - 誠實評估：
    - 地板留白仍偏多。
    - 角色仍是像素 sprite，是畫面中最粗糙的部分；是否 3D 化需使用者決定。
    - 椅子右扶手與一個腳輪在 3D 中位於邊櫃後方，卻畫在書桌之上。這是 PS-244 起既有的深度誤差，面積約 10 px；已由 PS-247（v1.31.3）修正。

- [x] **PS-244** 以 Blender 預渲染 Formal Workstation 環境素材（房間＋8 件家具×5 階段）
  - 目標：用同一個 Blender 場景與固定相機重做「空間」分頁的房間背景與 8 件 Workspace Upgrade 家具，修正目前繪製房間＋舊像素家具混用造成的風格、透視、比例與接觸陰影不一致。
  - 範圍（2026-10-17 使用者核准方向）：Blender 預渲染、插畫感 toon 風格、一次交付完整工作站一套；runtime 仍為 Pixi，不新增 3D runtime、不變更 JS 預算；主角與 Companion 手繪 sprite 不重做，以 1.7 m 比例假人校準相機讓角色比例一致。
  - 產出：`art-pipeline/ps244-blender/` 可重現的 bpy 腳本、provenance 與 placement 紀錄；`pwa/assets/personal-space/v2/workspace/` 新背景與透明家具；`assetManifest.js` 改用由 3D 投影計算的 placement；legacy idle-window 素材保留不刪。
  - 完成條件：五個專案階段的合成預覽通過目視 QA；`npm run ps242:manifest -- --check`、`npm run ps243:assets -- --check` 與資產預算測試通過；e2e 通過。
  - 完成（2026-10-18，v1.29.0）：`art-pipeline/ps244-blender/`（`scene.py`、`render_pack.py`、`process_pack.py`、`model-manifest.json`、`placements.json`、五階段預覽）；新背景 `building-formal-workstation-room-v2.webp` 與 `workspace/props/*.png`；相機 `building-workspace-v2`；角色寬度 24／13；成就相框移到 `top:20% left:47%`。
  - 驗證：`ps244WorkspacePlacements.test.js`；`ps242:manifest -- --check`、`ps243:assets -- --check` 通過；首屏 −34%、完整場景 −29%；五階段預覽目視 QA 通過。
  - 誠實評估：這版解決的是一致性（同一相機、同一材質、陰影正確），模型本身仍是低面數的乾淨幾何，房間地板留白偏多。精細化另立 `PS-245`。

- [x] **BUG-112** HW-106／HW-107／HW-110 的 review 後續修正（隱私競態與同步狀態）
  - 問題（PR #162–#164 Codex review）：位置定位進行中按「清除」或關閉，晚到的座標仍被寫回；麥克風權限請求進行中再按按鈕會再要求一次麥克風、無法取消；連線恢復同步在 Session 補傳仍在佇列時就顯示「✓ 已更新」，且可能與啟動同步同時執行而重複補傳。
  - 修正方向：以 request 序號讓清除／關閉作廢進行中的定位；權限請求期間再按即取消；遠端載入回傳補傳完成的 promise，只有佇列清空才顯示已同步；所有遠端載入經同一入口序列化。
  - 完成（2026-10-18，v1.28.2）：`settings.js` 以 `_placeRequestSeq` 作廢被清除／關閉的定位；`focusTimer.js` 新增 `ambientPending`；`app.js` 以 `_loadRemote()` 序列化遠端載入並以 `_reportSyncResult()` 依實際佇列回報；`storage.loadFromRemote()` 回傳 `{ backfilled }`。新增 7 項回歸測試，修正前 6 項失敗。

- [x] **BUG-111** Service worker 預快取漏列模組，更新後離線無法啟動
  - 問題：`sw.js` 的 `SHELL` 漏了 5 個啟動必載模組（含 v1.26–v1.28 新增的 `network.js`、`ambientNoise.js`、`placeContext.js`、`placeHint.js`）與 5 個舊版 Personal Space 延遲模組；更新後第一次離線開啟時模組圖無法執行（PR #163、#164 Codex review 指出）。
  - 修正：補齊 `SHELL`，並新增走訪實際 import 圖的測試，讓日後漏列直接讓 CI 失敗。
  - 完成（2026-10-18，v1.28.1）：`SHELL` 補上 10 個模組；`serviceWorkerShell.test.js` 從 `app.js` 走訪 static／dynamic import，要求全部預快取且每個 `SHELL` 項目都存在。修正前測試列出 10 個遺漏。

- [x] **HW-107** Location context mode
  - Goal: support optional coarse context labels such as home / work / outside for task suggestions.
  - Scope: privacy-first local-only geolocation prompt, coarse saved labels, no precise coordinate sync.
  - Acceptance: user can opt in, assign current place to a label, and see context-aware task hints.
  - 完成（2026-10-17，v1.28.0）：設定頁新增 opt-in 的「位置情境（實驗）」：可把目前位置設為「家」或「公司」並清除；首頁在啟用且有保存位置時顯示「📍 在家／在公司／在外面 · 適合：…」，依既有任務欄位（taskNature、impactType、category）挑最多 3 個任務，永不建議娛樂。新增 `platform/placeContext.js` 與 `ui/placeHint.js`。
  - 隱私：只在本機依 owner 保存使用者指定的粗略座標（3 位小數，約 110 公尺），不上傳、不同步；即時位置只用於比對、不保存；未啟用或沒有保存位置時完全不呼叫定位；首頁 10 分鐘內只定位一次。
  - 驗證：`placeContext.test.js`（15 項）、`placeContextSettings.test.js`（6 項）；e2e 41/41。位置與任務的對應規則是第一版假設，需實際使用後調整。

- [x] **HW-106** Ambient noise focus signal
  - Goal: use microphone volume level as an optional focus-environment signal, not as recording.
  - Scope: permission-gated Web Audio volume meter, no audio persistence, UI states for quiet / normal / noisy.
  - Acceptance: focus mode can show a live ambient state and stops microphone tracks when leaving the view.
  - 完成（2026-10-17，v1.27.0）：Focus 畫面新增使用者主動開啟的「偵測環境音」，即時顯示安靜／一般／吵雜；新增 `platform/ambientNoise.js`（只讀 RMS 音量，無 MediaRecorder、不保存不上傳）。結束、略過、倒數完成、縮小與 App 進入背景都會停止所有麥克風 track，權限對話框期間離開畫面也會在取得後立即關閉。
  - 驗證：`ambientNoise.test.js`（7 項）與 `focusAmbient.test.js`（9 項），移除縮小／背景停止呼叫時對應測試失敗；e2e 41/41。門檻為未校正的相對值，真機上不同麥克風的分界需再觀察。

- [x] **HW-110** Offline action queue and sync hints
  - Goal: make offline task completion feel intentional and visible.
  - Scope: local pending-action queue UI, sync status messaging, reuse existing storage bridge patterns; no schema migration.
  - Acceptance: user can complete tasks offline and see a clear pending-sync state when connection returns.
  - 完成（2026-10-17）：沿用既有 owner-scoped pending sidecar（Sessions、Session 刪除、tasks、profile、Energy），新增唯讀的 `storage.getPendingSyncSummary()` 與 `platform/network.js`。離線時同步列顯示「📴 離線中 · N 筆待同步」並在每次本機寫入後更新數量；啟動同步因離線失敗時改顯示離線狀態而非一般錯誤；連線恢復後立即推送並重新整理，不必等下次開啟 App。遊客模式不顯示同步提示。
  - 驗證：`offlineSyncHints.test.js`（9 項）與 `appBootSequence.test.js` 新增 6 項；v1.26.0。
  - 設計：連線恢復的同步刻意不呼叫 `authOperationGuard.begin()`（會取消進行中的 `loadAndStart()`），改在每個 await 後確認 session 未變；只有在同步曾失敗或曾離線時才重試；有輸入框聚焦時不重新 render 頁面。未修改 schema 或同步協定。

- [x] **BUG-109** Email local-part 超過 30 字元時 Supabase signup 失敗
  - 目標：讓合法但 `@` 前綴超過 30 字元的 email 能完成註冊，同時維持 profile `name` 的 30 字元限制。
  - 根因：production 的 `handle_new_user()` 以 `split_part(NEW.email, '@', 1)` 建立 profile 名稱，未截斷即寫入受 `profiles_name_check` 約束的欄位，Auth 因 trigger exception 回傳 `500 Database error saving new user`。
  - 範圍：提出並核准 migration 後修正 signup trigger，補長 email 整合測試；此項涉及 Auth／schema，不納入 BUG-108 的 Service Worker hotfix。
  - 完成（2026-10-17，repo 部分，經使用者核准；production 套用另列 `BUG-109A`）：新增 `pwa/db/013_signup_profile_name.sql`，只把 `handle_new_user()` 的名稱來源包進 `left(..., 30)`，其餘與 004 相同。實際範圍比原記錄大：Google OAuth 顯示名稱超過 30 字元也走同一條失敗路徑。
  - 驗證：本機 PostgreSQL 16.15（stub `auth.users`＋001＋004）以 `tests/database/bug109.test.sql` 重現 `profiles_name_check` 失敗；套用 013 後 6 項檢查全過且 rollback 後 0 列。`tests/unit/signupTriggerSql.test.js` 鎖住 migration 與 004 只差 `left(..., 30)`。套用步驟與回滾見 [`docs/bug-109-signup-name-truncation.md`](docs/bug-109-signup-name-truncation.md)。

- [x] **PRO-014O** Cached-user 啟動路徑不保證 refresh Pro entitlement projection
  - 現況（`PRO-014M` 實作時發現）：`pwa/js/app.js` 的 `init()` 有本機 user 快取時走背景同步 `getSession()` → `db.loadFromRemote()` → `loadStateFromStorage()`，這條路徑**沒有**呼叫 `db.refreshProEntitlement()`。refresh 只在 `loadAndStart()` 內執行，而回訪使用者是否進入 `loadAndStart()` 取決於 `SIGNED_IN` 事件是否搶在 `getSession()` resolve 之前（BUG-106 記錄的同一個 race），沒有保證。
  - 影響：`legacy` source 下無影響（refresh 直接 no-op）。切到 `server` 後，回訪使用者的 projection 可能長期不更新；超過 `SNAPSHOT_TTL_MS`（24 小時）即 fail closed，付費／試用使用者會失去 Pro，直到某次啟動剛好走到 `loadAndStart()` 或重新登入。
  - 範圍：cached-user 背景同步成功後，以同一個 `authOperationGuard` owner 檢查補上 refresh；在 `tests/unit/appBootSequence.test.js` 鎖住兩條啟動路徑都會 refresh。不涉及 RPC／schema，但屬 entitlement 啟動流程，實作前先附上變更說明
  - **擋 `PRO-014H`**：cutover 前必須完成
  - 依賴：`PRO-014B`
  - 完成（2026-10-17，v1.25.5，經使用者核准）：cached-user 背景同步成功後，以同一個 `authOperationGuard` owner 檢查呼叫 `db.refreshProEntitlement()`，順序與 `loadAndStart()` 相同（拉遠端 → refresh → 更新畫面）；離線時不 refresh，保留 grace window。legacy source 下為 no-op，production 行為不變。
  - 驗證：`tests/unit/appBootSequence.test.js` 新增 4 項（快取分支 refresh 與順序、離線不 refresh、SIGNED_IN 先到只 refresh 一次、refresh 期間登出不宣告同步），移除修正時對應 2 項失敗。`PRO-014H` 的這項前置已解除。

- [x] **BUG-110** 註冊成功後直接登出，登入按鈕維持 disabled
  - 目標：同一個 App session 內完成註冊後直接登出，切回登入 tab 並填妥帳密時可以立即登入，不需重新載入頁面。
  - 根因初判：`authFlow.js` 的成功 signup 路徑把 `#auth-submit` 設為 disabled／「註冊中…」後交由 auth state change 啟動 App，但登出回到登入畫面時沒有重設 disabled 狀態；切換 tab 只更新文字。
  - 範圍：另案補 auth flow 回歸測試並重設表單 UI 狀態；不影響 BUG-108／PRO-014J 的「重新開 App 後第二次登入」production 驗收，也不修改 Supabase Auth 或 schema。
  - 完成（2026-10-17，v1.25.4，經使用者核准）：`showLoginScreen()` 在 listener 早退前重設 `#auth-submit` 的 disabled 與文字。實際範圍比初判大：任何一次成功的密碼登入後在同一頁面 session 登出都會卡住，不只註冊路徑。
  - 驗證：新增 `tests/unit/authFlow.test.js`（4 項），移除修正時登入／註冊後登出兩項失敗；未修改 `auth.js`、Supabase Auth 或 schema。

- [x] **PRO-014M** 開發者面板的 Pro 狀態切換支援 `server` source
  - 目標：`_devApplyPro()` 在 `server` source 下也能切換 Pro／試用／免費狀態
  - 現況（`PRO-014C` 實作時發現）：`pwa/js/pages/settings.js` 的開發者面板直接寫 `u.isPro` / `u.proExpiresAt` / `u.trialStartedAt`。`server` source 下這些欄位不再被讀，面板變成無效。
  - 範圍：改為寫入 owner-scoped projection（`writeProEntitlementSnapshot()`），或依當前 source 分派；僅開發者面板，不影響 production 路徑
  - 完成條件：兩種 source 下都能切換出付費／試用／免費三種狀態並被 `isProUser()` 正確反映
  - 備註：純開發工具、低風險，但缺了它就無法在裝置上人工驗證 `server` source 的行為 —— `PRO-014H` 的實機驗證會需要
  - 依賴：`PRO-014C`
  - 完成（2026-10-17，v1.25.3）：`_devApplyPro()` 依 entitlement source 分派。`server` 寫入與 legacy 覆蓋同形狀的 owner-scoped projection（付費＝終身、試用＝剩 14 天、免費＝非 active），`legacy` 行為不變；面板顯示目前 source。dev backup 存在時 `refreshProEntitlement()` 不覆寫模擬的 projection（與既有暫停 profile 上雲同一開關），「還原」一併清除 projection。
  - 驗證：新增 `tests/unit/proDevPanel.test.js`（12 項，真實 storage／proEntitlement）與 `proEntitlementGate.test.js` 的 refresh guard 回歸測試；移除實作時對應測試失敗。
  - 發現：(1) cached-user 啟動路徑不保證 refresh projection，cutover 後會讓回訪付費使用者在 24 小時後失去 Pro，已立 `PRO-014O` 並列為 `PRO-014H` 前置；(2) legacy 覆蓋在登入且連線時撐不過重新整理（`loadFromRemote()` 以遠端 profile 覆寫），屬既有行為，未變更。

- [x] **PLAT-201** 定義 `platform` adapters 在 PWA 與 future hybrid shell 的行為差異表
  - 目標：讓未來包成 native 時有清楚替換點
  - 對應 roadmap：Phase 5 準備
  - 完成條件：`pwa/js/platform/` 每個 adapter 一列，記錄 PWA 現況、未來 hybrid shell 的預期替換點、降級行為與相關高風險邊界；純文件，不修改 adapter 程式碼
  - 完成（2026-10-17）：新增 [`docs/platform-adapters.md`](docs/platform-adapters.md)，`pwa/js/platform/` 12 個模組各一列（8 個裝置能力 adapter＋4 個平台無關邏輯模組），記錄呼叫端、PWA 現況、不支援時的降級、hybrid 替換點與高風險邊界；另列出 9 類仍散落在 `platform/` 之外的平台能力與建議收斂順序（僅提案）。
  - 發現：`notifications.js`、`purchases.js` 與 `badge.js` 的 `scheduleLocalReminder()` 沒有呼叫端；`proofCapture.js` 的 `supportsProofCapture()` 未被使用（`sessionFlow.js` 以 inline 檢查取代）；`storageBridge` 為同步介面，是 hybrid 替換的最大決策點；`pages/home.js` 直接呼叫 `navigator.vibrate(50)` 繞過 `haptics.js`。

- [x] **DOC-201** 補一份 personal space state 流程說明文件
  - 目標：說明 `user.totalXP -> level -> unlock -> gold -> ownedItems -> scene` 的資料流
  - 對應 roadmap：Phase 2
  - 完成條件：新文件涵蓋 legacy 與 V2 兩條路徑的資料來源、計算位置（檔案／函式）、持久化 key 與同步邊界；內容以目前 `main` 的程式碼為準並可逐項對照
  - 完成（2026-10-17）：新增 [`docs/personal-space-state-flow.md`](docs/personal-space-state-flow.md)，逐項列出 runtime 選擇、共用 XP／level 上游、legacy 與 V2 的計算位置與寫入點、6 個實際 localStorage key 與 Supabase 同步邊界，並附 DevTools 對照指令。
  - 發現：兩個 runtime 都沒有寫入 `spentGold`／`ownedItems` 的程式碼（shop 只派送無 listener 的 purchase request，符合 V2 slice 的刻意延後）；V2 不依 `level` 解鎖場景；AGENTS.md §17 的重置指令使用了不存在的 key `orbit_personal-space-state`，已更正為實際的 storageBridge key 並補上 V2 key。

- [x] **AI-201** 建立 AI companion behavior layer 的 rule-based 狀態模型
  - 完成（2026-10-17，由 PS-236 涵蓋，未另建模組）：`pwa/js/personalSpace/v2/companionEngine.js` 的 `getCompanionReaction()` 已是 deterministic、presentation-only 的 rule-based 狀態模型，定義 `observe / approach / remind / congratulate / rest / work` 六個狀態，觸發優先序與 [`docs/personal-space-v2-vertical-slice.md`](docs/personal-space-v2-vertical-slice.md) 的 Companion 規格一致（project 完成 → progress reveal → recovery → 一般 Session → Strong／Peak Momentum → Low Momentum＋使用者選定目標 → observe），由 `tests/unit/personalSpaceV2ViewModel.test.js` 覆蓋。
  - 為什麼不另做：再建立一套平行的 behavior model 會讓 Companion 有兩個互相競爭的狀態來源，違反 AGENTS.md §6。
  - 發現：`remind` 分支依賴 `coreState.missedPatterns`，但目前沒有任何程式碼寫入該欄位，production 中 `remind` 不會被觸發；已另立 `AI-203` 追蹤。

- [x] **BUG-108** Service Worker 快取 Supabase Data API 舊回應
  - 完成（v1.25.2，PR [#152](https://github.com/yoyoCadence/Orbit/pull/152)，merge `55edfaf`）：Service Worker 只攔截同來源 GET；跨來源 Supabase Data API 不再呼叫 `respondWith()` 或進入 app cache，activate 會清除含舊 REST snapshot 的 `orbit-v1.25.1`。
  - Production 覆驗（2026-08-31）：全新帳號完成 trial 與 setup 後建立 13 個預設任務；重新開 App 第二次登入直接載入既有設定頁，未回到 setup。實際 network 記錄顯示 profile／tasks／sessions／energy GET 皆向 Supabase 回 HTTP 200。
  - Cache 證據：受 `sw.js` 控制的 production 頁面只有 `orbit-v1.25.2`；第二次登入後 104 筆 cache request 的跨來源數為 0，無 Supabase REST URL。
  - 範圍確認：未修改 Auth、Supabase schema／migration 或 entitlement source；測試帳號、auth session 與所有關聯列已刪除並逐表確認 0 殘留。完整證據見 [`docs/pro-014j-production-validation.md`](docs/pro-014j-production-validation.md)。

- [x] **PRO-014J** 合併並部署 `PRO-014C` 的 client
  - 完成（2026-08-31）：PR #150、#151、#152 已依序合併部署；最終 production commit `55edfaf` 的 GitHub Pages deployment 成功，PR #152 的 lint／test／E2E／build-check 四項 CI 全綠。
  - Trial／profile：首次註冊只呼叫一次 `start_trial()`；setup 只更新輸入欄位，名稱為 `Smoke152`，profile／entitlement 的 trial 起點未被重設。設定頁顯示「免費試用中」、15 天與版本 v1.25.2。
  - RPC 冪等：v1.25.0 的第一輪 production smoke 已對同帳號重複呼叫 `start_trial()` 並確認回傳同一時間；最終 v1.25.2 smoke 的第二次登入沒有再次呼叫 RPC，試用期限也未延長。
  - 第二次登入：重新開 App 後直接讀回 13 個任務與既有 profile，沒有 loading 卡死或誤進 setup；network 證明四組 owner-scoped Supabase GET 皆重新走網路，且沒有再次呼叫 `start_trial()`。
  - 清理／後續：測試帳號與資料 0 殘留；`REPO_PRO_ENTITLEMENT_SOURCE` 仍為 `legacy`，沒有執行 `PRO-014H` cutover。驗收另發現 BUG-110，已獨立列入 Backlog，不影響本任務完成。完整證據見 [`docs/pro-014j-production-validation.md`](docs/pro-014j-production-validation.md)。
  - 依賴：`PRO-014C`、`PRO-014D`、`PRO-014I`（皆已完成）

- [x] **PRO-014I** 在 production 套用 011 migration
  - 完成（2026-08-30）：經明確核准後，將未修改的 `pwa/db/011_leaderboard_pro.sql` 套用至 Orbit production `oenuhbjadvpspppaelnz`；migration history 為 `20260830001920_pro_014i_apply_011_leaderboard_pro`。
  - Seed：production 的 3 筆 legacy profile Pro／trial 欄位皆屬 client 可寫資料，不作為可信授權來源；本次核准名單為 0 筆，未回填、未新增測試 entitlement。
  - 覆驗：RLS、owner-only SELECT policy、最小 table／function grants、兩支 RPC 的空 `search_path` 均正確；以兩個既有 auth role 在 rollback transaction 中驗證 trial 冪等、owner isolation 與 status，結束後 row count 仍為 0；anon 對兩支 RPC 與 table Data API 都回 HTTP 401。
  - Advisors／rollback：Security／Performance Advisors 已執行；011 新增物件只有兩則預期的 authenticated `SECURITY DEFINER` 提醒，另記錄既有 `leaderboard_view`／`handle_new_user`／Auth 與舊 RLS performance findings。production 未執行 rollback，六步 runbook readiness 已確認。
  - 證據：[`docs/pro-014i-production-validation.md`](docs/pro-014i-production-validation.md)。未合併 PR、未部署 client、未切換 entitlement source；下一步仍是另行核准 `PRO-014J`。
  - 依賴：`PRO-014D`（已完成）

- [x] **PRO-014D** 在非 production 環境驗證 011 migration 與 cutover 邊界
  - 完成（2026-08-30）：以隔離的本機 Supabase（Postgres 17／Auth／PostgREST／Kong）實際套用未修改的 011，未建立付費 branch、未連結或變更 production。
  - 覆驗：pgTAP 34/34；真實 Data API 的雙帳號 owner isolation、trial 冪等、anon 401、authenticated 直接寫入 403 全數通過；database lint 與 Security／Performance Advisors 均為 0 issue。
  - Seed／rollback：兩筆不含 legacy profile 欄位的合成核准名單完成 2:2 對帳；六步 rollback 實際執行且無殘留，重新套用 011 後 pgTAP 再次 34/34。
  - Repo regression：lint、54 files／975 tests、E2E 41/41、`git diff --check` 通過。完整環境、命令、證據與 production Data API preflight 邊界見 [`docs/pro-014d-local-validation.md`](docs/pro-014d-local-validation.md)。
  - 安全閘門仍有效：本項不代表已核准 `PRO-014I` 的 production migration、`PRO-014J` 的合併部署或 `PRO-014H` 的 cutover；三者仍須依既定順序與明確核准執行。
  - 依賴：`PRO-014A`、`PRO-014B`、`PRO-014C` 分支實作（皆完成）

- [x] **PRO-014C** 在分支實作 trial 受控 RPC 與 server-source gate 路徑（**不得合併**）
  - 完成（v1.25.0，commit `cd977e3`，分支 `feat/pro-014c-trial-rpc`，[PR #150](https://github.com/yoyoCadence/Orbit/pull/150) Draft）：核心 RPC、boot 失敗語意與 server-source gate 路徑已完成並通過覆驗。
  - 第一輪驗收修正：`isPaidProUser()`／`getProExpiry()` 原本仍讀 legacy profile 欄位，導致「projection 有效付費、profile 沒有 `isPro`」時付費使用者被顯示成尚未訂閱；設定頁的試用進度條寫死 15 天，server 的 `pro_trial_duration()` 若改變會算出負值。兩者都已改為由 server contract 推導，並新增真實 storage → settings DOM 整合測試。
  - 覆驗：關聯測試 87/87、完整 unit／integration 54 files／975 tests、GitHub CI 四項全綠（E2E 41/41）；lint 與 `git diff --check` 通過。
  - Done 的定義依規格：分支實作完成、CI 全綠、PR 開為 Draft 等待閘門，**不含合併**。合併與部署是 `PRO-014J`，前置 `PRO-014I`。
  - 實作時發現三處範圍外問題，已立案：`PRO-014L`（SUB-16 連勝解鎖，**擋 cutover**）、`PRO-014M`（開發者面板）、`PRO-014N`（`expires_at` 歧義）。
  - 依賴：`PRO-014B`（已完成）

- [x] **PRO-014B** 將前端 Pro 判定改為 server-derived 的 UI entitlement projection
  - 完成（v1.24.0）：新增 `pwa/js/platform/proEntitlement.js`，由 `my_pro_status()` 的回應推導 owner-scoped、有 TTL、fail-closed 的本機 UI projection，保留 `storage.isProUser()` 的同步呼叫介面。`db.refreshProEntitlement()` 在登入載入遠端資料後刷新；`storage.clearAll()` 一併清除。
  - **定位（PR #146 覆驗定案）**：這是 **UI 呈現用的投影，不是安全邊界**。Orbit 是純前端 PWA，裝置擁有者可直接改 JS，因此任何 client-local 機制（包含簽章）都擋不住本機竄改。本任務達成的是「不再讓 client 可寫的授權狀態同步到其他裝置或外溢到 read model」，而非「client 端不可繞過」。安全控制在 server —— 見 `PRO-014F` 的完成條件與 [`docs/pro-014-entitlement-integrity.md`](docs/pro-014-entitlement-integrity.md) 第 0 節。
  - 完成條件對應：PostgREST 單列陣列以明確斷言 normalize（空陣列／非陣列／多列／缺欄位／壞時間戳皆 fail closed）；RPC 錯誤、無 entitlement row、未登入、切換帳號、cache 過期、entitlement 到期、trial 結束、時鐘倒轉、projection 被竄改、localStorage 寫入／清除失敗（含**重新載入後**）皆 fail closed；判定來源由 repo 常數控制且裝置端無法降級。
  - 設計決定：回應帶 `error` 是權威訊號（function 不存在／權限不足），直接清除 projection；fetch 本身 throw（離線）則保留，讓 24 小時 grace window 生效。寫入失敗時 best-effort 移除舊 projection，使 fail-closed 撐得過重新載入。
  - 範圍界線：本任務**不做 production cutover** —— `REPO_PRO_ENTITLEMENT_SOURCE` 維持 `legacy`，切換是 `PRO-014H`。未動 auth 流程、token 處理或 schema；`startTrial()` 維持舊行為（屬 `PRO-014C`）。
  - 測試：`tests/unit/proEntitlement.test.js`（59 項）、`tests/unit/proEntitlementGate.test.js`（11 項）。三項反向驗證：server 分支改回讀 legacy 欄位 → gate 測試紅 4 項；拿掉 best-effort 移除 → 「寫入失敗後重新載入」紅；`resolveProEntitlementSource()` 以兩種 repo source 各跑四組。`npm run lint`、`npm run test`（51 files／937 tests，`TZ=UTC` 同樣全過）、`npm run test:e2e -- --workers=1`（41/41）通過。
  - PR：[#146](https://github.com/yoyoCadence/Orbit/pull/146)

- [x] **BUG-107** `supabase.js` 從 esm.sh 載入未鎖版本的 client
  - 完成（v1.23.4）：採可行做法 (2)。新增 `scripts/vendor-supabase.mjs`（`npm run vendor:supabase`）由 `node_modules` 產生 `pwa/vendor/supabase.js`，`@supabase/supabase-js` 以精確版本 `2.112.4` 進 `dependencies`；`pwa/js/supabase.js` 改為同源相對匯入，該檔並加入 `pwa/sw.js` 的 `SHELL`。
  - 三項完成條件對應：版本由 repo 決定且可稽核（鎖版本 + vendored 產物已 commit + 腳本版本不符即失敗）；首次／離線啟動不再依賴 esm.sh 的即時可用性（同源且進 `SHELL` 精快取）；`SHELL` 與版本流程同步更新（`npm run bump -- patch` → `npm run ps243:assets`）。
  - 實作備註：來源是套件自帶的 UMD browser bundle，不是 `dist/index.mjs` —— 後者仍帶 `@supabase/auth-js` 等 bare specifier，瀏覽器無法解析。UMD 以 ES module 載入時頂層 `var supabase` 只存在於模組作用域，不外洩全域；vendor 腳本的 footer 只 re-export `createClient`（目前唯一用到的介面），要擴充需明確修改腳本。
  - 範圍界線：只改 client 的載入路徑，未動 auth 流程、token 處理或 schema。
  - 測試：新增 `tests/unit/vendoredSupabaseClient.test.js`（5 項）；把匯入改回 esm.sh 後該檔紅 1 項。E2E 的 Supabase stub 改攔截 `**/vendor/supabase.js`，並以「讓 stub 直接 throw」反向驗證攔截生效。`npm run lint`、`npm run test`（49 files／867 tests）、`npm run test:e2e -- --workers=1`（41/41）通過。
  - 分支：`fix/bug-107-vendor-supabase`
  - 詳細調查：[`docs/bug-105-morning-modal-lockup.md`](docs/bug-105-morning-modal-lockup.md)（第八節 D-4 與其後續結果）

- [x] **BUG-106** 單次啟動重複執行 `bootWithLocalState()` 造成 modal 疊層
  - 完成（v1.23.3）：新增 `pwa/js/platform/bootSequenceGuard.js`，以「本次啟動 + owner id」為範圍的一次性 claim 收斂 boot 序列；`bootWithLocalState()` 重複呼叫只會再次顯示主畫面後返回，`handleSignOut()` 釋放 claim，因此登出後重新登入與直接切換帳號都仍會正常重跑 boot。新模組一併加入 `pwa/sw.js` 的 `SHELL` 精快取清單。
  - 另修：疊層之外，第二次 boot 發生在 `db.loadFromRemote()` 之後，遠端 profile 可能還沒帶到第一次 boot 剛寫進本機的 `lastStreakDate` / `lastWeeklyBonusDate`，`processYesterdayStreak()` 與 `checkWeeklyBonus()` 的「今天已處理」防護會失效 —— 連勝與週一致性獎勵因此可能被重複結算。
  - 範圍界線：只收斂 boot 序列，不收斂遠端同步。早到的 `SIGNED_IN` 仍會完成 `loadFromRemote()`，後到的 `getSession()` 會因 `_currentSession` 已被賦值而短路，遠端只拉一次。`showStreakUnlockModal()` 的 CTA 已於 v1.23.1 隨 BUG-105 改為 scope 綁定，本次確認無須再改。
  - 測試：`tests/unit/bootSequenceGuard.test.js`（4 項）與 `tests/unit/appBootSequence.test.js`（4 項，jsdom，直接在「`SIGNED_IN` 早於 `getSession()` resolve」的時序下驅動 `app.js`）；移除修正後該檔紅 3 項。`npm run lint`、`npm run test`（48 files／862 tests）、`npm run test:e2e -- --workers=1`（41/41）通過。
  - D-4：`supabase.js` 未鎖版本的風險已評估但維持現狀，另立 `BUG-107` 追蹤。
  - 分支：`fix/bug-106-duplicate-boot`
  - 詳細調查：[`docs/bug-105-morning-modal-lockup.md`](docs/bug-105-morning-modal-lockup.md)（第八節）

- [x] **PRO-014A** 將 PR #132 收斂為 server-owned Pro entitlement foundation
  - Completed: PR 範圍只保留 `pro_entitlements`、`is_pro_active`、`start_trial`、`my_pro_status`、owner-only RLS／最小 grants、migration／rollback 文件與 SQL contract tests；`display_name`、排行榜 glow、Personal Space 投影與 client cutover 已移至後續任務。
  - Security: 不 backfill 不可信的 legacy Pro 欄位；`SECURITY DEFINER` RPC 使用空 `search_path`、fully qualified objects 與 calling-user predicate；authenticated 沒有直接寫入權限。
  - Validation: `npm run lint`、`npm run test`（46 files／854 tests）、focused Focus E2E 與 GitHub CI 通過；migration 尚未套用至任何 Supabase 環境，非 production 權限矩陣留給 `PRO-014D`。

- [x] **TEST-002** 穩定 Focus 暫停／繼續 E2E 的 CI 時序
  - 完成：將共用 setup 改為由個別案例呼叫，讓 25 秒局部測試預算涵蓋啟動流程；以條件式 timer 斷言取代開始與繼續階段的固定等待，並保留一個 1.2 秒暫停穩定性觀察。
  - 驗證：ESLint 通過；目標案例連跑 3 次全數通過，且在完整 2-worker E2E 中通過；PR #132 head 的 GitHub CI run #248（lint／test／e2e／build-check）全數通過。

- [x] **BUG-105** 跨日晨間 modal 卡死，無法點擊且重開無效
  - 完成（v1.23.1）：晨間 modal 的 click handler 改為先 `modal.remove()` 再寫入並包 `try/catch`；`storage.js` 的 `set()` 改為回報寫入結果而非 throw，`saveUser` / `saveEnergy` 回傳本機寫入是否成功，失敗時以 toast 告知「已套用但無法存到這台裝置」；日報與連勝解鎖 modal 改用 scope 過的 `modal.querySelector()` 綁定 CTA；兩個 modal 掛載前先移除同 id 殘留節點；`handleSignOut()` 透過新的 `clearDayCycleModals()` 清除殘留在 `<body>` 的 overlay
  - 另修：選擇今日狀態後補呼叫 `updateHeader()` — 原本 header 精力值會停在前一天的數字（同一流程內的既有缺陷，由新的 E2E 斷言揭露）
  - 測試：新增 `tests/unit/dayCycle.test.js`（10 項）與 `tests/e2e/day-cycle-boot.test.js`（3 項），補上先前完全沒有覆蓋的跨日啟動流程
  - 分支：`fix/bug-105-morning-modal-lockup`
  - 詳細調查：[`docs/bug-105-morning-modal-lockup.md`](docs/bug-105-morning-modal-lockup.md)

- [x] **HW-105** Personal Space achievement photo wall
  - Completed: users can mark one owner-scoped local proof from Home or History, see it immediately in the shared poster／Pixi Personal Space frame, and get a safe placeholder when the Session or image is unavailable; selection stays device-local and introduces no auth／schema changes.

- [x] **PS-242** Promote the fallback-proof Personal Space scene pack to final production action art
  - Completed: shipped the authored 3:2 Formal Workstation background, 12 protagonist state／facing poses, six Companion states, clear／rain overlays, shared poster／Pixi manifest resolution, reproducible provenance／QC evidence, and passing 259,133-byte first-paint／1,766,935-byte full-pack budgets in v1.22.0.

- [x] **PS-240** Validate and harden the Personal Space V2 vertical slice
  - Completed: PR #129 merged authenticated-owner sync guards, one-time legacy Session cutover, same-route Pixi reuse, structured Reveal selectors, placement sanitization, honest sync failure feedback, responsive canvas correction, 792 passing unit／integration tests, Chromium E2E 26/26, and Playwright mobile visual QA.

- [x] **PS-239** Add Personal Space runtime teardown, asset cache, and mobile fallback contracts
  - Completed: added route and viewport lifecycle ownership, visibility/context loss recovery, idempotent cleanup, successful-response asset caching, poster fallback, and focused regression coverage.

- [x] **PS-238** Add Personal Space V2 World Mode and minimal Edit Mode shell
  - Completed: added the scene-first 3:2 Full World, compact HUD/dock, shared Project/Quest/Companion interactions, and a revision-safe editor limited to existing placements.

- [x] **PS-237** Integrate the home Orbit Window with lazy runtime and static fallback
  - Completed: placed the mandatory 3:2 Orbit Window after Home stats and before Daily Plan, with poster-first lazy Pixi mounting, accessible actions, reveal acknowledgement, and non-blocking fallback.

- [x] **PS-236** Build the shared Personal Space V2 world and Orbit Window view models
  - Completed: Home, Full World, and Edit derive immutable models from one owner-scoped state and active ledger, including Momentum, Main Quest, Project, Companion, protagonist, wallet, and reveal state.

- [x] **PS-235** Add reversible session reward ledger and Workspace Upgrade project engine
  - Completed: added immutable deterministic reward entries, source fingerprints, dated Main Quest ownership, explicit deletion tombstones, winner reassignment, four-phase contributions, milestone rewards, and complete undo reconciliation.

- [x] **PS-234** Add Personal Space V2 feature flag and idempotent local state migration
  - Completed: made V2 the default with explicit legacy fallback, owner-scoped idempotent migration, fixed reward epoch and Gold cutover, persistence failure/revision guards, and no auth or schema changes.

- [x] **PS-233** Audit and specify the corrected Personal Space V2 vertical slice
  - Completed: audited v1.20.6 code, state, sync, tests, home, Personal Space runtime, assets, cache, and documentation; added product, art, technical, asset-pipeline, and vertical-slice specifications with the corrected mandatory home Orbit Window carried through all acceptance and non-goal clauses.

- [x] **HW-111** Time-of-day atmosphere layer
  - Completed: `timeBand.js` maps local hour to morning/day/evening/night; `applyTimeBand()` sets `data-time-band` on `<html>` and is called on init + every hour; CSS `--time-tint` token applies a subtle hue overlay via `body::after` pseudo-element; Liquid Glass and Personal Space inherit the tint automatically.

- [x] **HW-109** App badge and notification shell
  - Completed: new `platform/badge.js` with `supportsBadge()`, `setBadge(count)`, `clearBadge()`, and `scheduleLocalReminder()` placeholder; badge updates to today's valid session count on each task completion; badge clears when the PWA returns to foreground via `visibilitychange`.

- [x] **HW-108** Web Share achievement cards
  - Completed: `share.js` extended with `buildGrowthShareText()` and `shareGrowthCard()`; profile page shows a 「分享成長卡 / 複製成長卡」button that uses Web Share API on supported devices and falls back to clipboard copy; toast confirms clipboard copy.

- [x] **HW-104** Camera proof capture for task deliverables
  - Completed: after completing any non-invalid task, an optional bottom sheet appears offering camera or file-picker input; selected images are compressed to ≤320px JPEG and stored locally under `orbit_proof_{sessionId}`; a 36×36 thumbnail badge appears in the session log row; deleting a session also removes its proof; clearing localStorage removes all proofs naturally.

- [x] **PS-232** Prove reference-to-angle-pack generation for idle backgrounds
  - Completed: generated `office-angle-overhead-proof` from the approved building office center background, registered it as a non-runtime `angle-proof`, and documented the overhead/top-down background workflow in the idle-window asset skill.

- [x] **PS-231** Validate first skill-generated furniture variant loop
  - Completed: generated sofa side variants from the approved front prop, split and cleaned the chroma-key sheet with skill tooling, registered `left-wall-flush` / `front` / `right-wall-flush` variants, and wired sofa camera preferences into the idle layout.

- [x] **PS-230** Add reusable idle variant audit script to the asset skill
  - Completed: added `audit_idle_window_variants.mjs` to the project and installed `orbit-idle-window-assets` skill, documented the command, and verified Markdown/JSON output from the Orbit repo root.

- [x] **PS-229** Add controlled idle furniture variant generation queue
  - Completed: added a tested `variantReadiness` manifest for large furniture direction variants, documented the controlled generation queue, and kept PS-227 focused on actual authored image generation instead of uncontrolled prompt batching.

- [x] **PS-228** Refine mobile idle editor controls and grouped furniture library
  - Completed: changed layer controls to instant back/front with separate fine nudges, grouped the furniture visibility library by unlock tier with per-group all/none controls, limited camera drag to expanded non-edit mode, prevented image drag thumbnails, and added touch feedback animations for idle editor controls.

- [x] **PS-226** Mature idle editor placement controls and consistency generation workflow
  - Completed: added selected-item layer up/down controls, blank-stage drag camera switching without Camera +/- buttons, item visibility toggles with show-all/hide-all controls, and a reference-image workflow in the idle-window skill for consistent future room angles and furniture variants.

- [x] **PS-225** Generate stage-wide idle-window background sets
  - Completed: generated and registered strict 16:9 `left / center / right` background sets for survival rental, building office, and mastery estate, then wired stage-aware background selection into the idle-window layout without replacing the existing Personal Space scene layer.

- [x] **PS-224** Replace proof office camera backgrounds with strict 16:9 assets
  - Completed: replaced the office proof camera backgrounds with strict 16:9 v2 production background assets, preserved the proof assets, and verified idle-window asset resolution with focused tests.

- [x] **PS-223** Add idle-window character furniture anchors
  - Completed: added furniture-defined character anchors and wired the protagonist to follow `corner-desk.desk-work`, including live editor updates when the desk is dragged while keeping the existing idle sprite contract.

- [x] **PS-222** Add idle editor depth sorting and collision feasibility
  - Completed: added footprint-based overlap warnings, editor invalid-placement styling, z-depth hints from placement depth, and unit coverage for overlap detection without persisting invalid state separately.

- [x] **PS-221** Add free movement and support-surface snapping
  - Completed: expanded desk and shelf support surfaces, added eligible-surface metadata for small props, and verified dragged props can move freely then snap to valid parent surfaces such as shelf tiers.

- [x] **PS-220** Add real idle-window camera profiles
  - Completed: generated and registered true `left / center / right` office background assets, tied them to camera profiles, and verified camera switching changes the actual background image.

- [x] **PS-219** Add perspective-correct desk variants
  - Completed: generated `office-corner-desk-v3` with true `front`, `left-wall-flush`, and `right-wall-flush` transparent variants, registered them, and tied desk variants to camera profile switching instead of CSS rotation or mirror-only art.

- [x] **PS-218** Add idle window production art and placement specs
  - Completed: added `docs/idle-window-art-direction-spec.md` and `docs/idle-window-furniture-variant-spec.md` with camera, support-surface, footprint, variant, anchor, scale, and acceptance rules for expansion before generating more assets.

- [x] **HW-103** Focus desk mode by phone posture
  - Completed: added a calmer focus desk presentation with a manual fallback button, optional device-orientation permission flow, stable flat-phone detection, and cleanup when minimizing or ending focus.

- [x] **HW-102** Personal Space motion parallax
  - Completed: added throttled device-orientation/pointer parallax for Personal Space scenes, with CSS tilt variables, layered background/furniture movement, and cleanup on rerender.

- [x] **HW-101** Haptics feedback adapter
  - Completed: expanded the platform haptics adapter with named vibration patterns and wired task completion, focus start/milestone, warnings, level-up, unlock, purchase, and scene tap feedback.

- [x] **UI-202** Add Liquid Galss glass theme with device-angle highlights
  - Completed: added the `liquid-galss` app theme to settings and daily random theme selection; introduced glass tokens/surfaces in CSS; wired `deviceorientation` plus pointer fallback to update reflection CSS variables; bumped to v1.18.0 and documented the change.

- [x] **PRO-013** 資料匯出 CSV + PDF 成長報告
  - 完成：新增 `export.js`；CSV 匯出將所有 sessions 依日期排序，帶 UTF-8 BOM；PDF 報告透過 html2canvas + jsPDF（CDN 懶載入）產生 A4 PDF，含統計摘要、每週 XP 長條圖、Top 5 任務、打卡明細表（>150 筆改顯示提示）；設定頁「📤 資料匯出」card 新增兩個按鈕；月份選擇器支援本月、上個月、任意月份、全部時間四種範圍

- [x] **AUTH-103** 忘記密碼 / 密碼重設流程
  - 完成：`auth.js` 新增 `resetPasswordForEmail` / `updatePassword`；登入頁密碼欄位下加「忘記密碼？」連結，點擊彈出 modal 輸入 Email 寄送重設信；`onAuthStateChange` 攔截 `PASSWORD_RECOVERY` 事件顯示設定新密碼 modal；切到「註冊」tab 時自動隱藏忘記密碼連結

- [x] **UI-201** 本日計劃區塊新增說明視窗
  - 完成：本日計劃標題改為 `section-title-row`，右側新增 `plan-info-btn`（？圓形按鈕）；點擊彈出 modal 說明「起床先規劃本日任務」的三個心理學原理（實行意圖、決策疲勞、心理對比）

- [x] **AUTH-102** 密碼欄位新增顯示 / 隱藏切換按鈕
  - 完成：密碼 input 包入 `.password-input-wrap`，右側加 `.password-toggle-btn`，以 SVG 眼睛 icon 切換 `type=password/text`；app.js 在登入頁初始化時綁定事件

- [x] **AUTH-101** Google OAuth 登入流程 UX 確認與優化
  - 完成：Google 按鈕移至 email/password 表單之前，分隔線文字改為「或用電子郵件」，讓用 Google 註冊的使用者第一眼就看到正確入口，避免誤填密碼

- [x] **BUG-103** 任務小卡移動後意外停止編輯模式
  - 完成：`_endDrag` 在呼叫 `renderHome` 前先記錄所有 `.task-grid.edit-mode` 的 section；重繪後逐一恢復 `edit-mode` class 並把對應「編輯」按鈕改回「完成」，拖曳排序不再退出編輯模式

- [x] **BUG-102** 設定頁帳號區塊帳號名稱下方持續顯示「載入中」
  - 完成：`settings.js` 新增 module-level `_cachedEmail` 變數；首次非同步取得 email 後存入 cache；後續所有 `_renderView` 呼叫直接從 cache render，不再還原成「載入中…」

- [x] **BUG-104** 改使用者名稱 / 上傳大頭貼靜默失敗
  - 完成：`upsertProfile` 改為回傳 `boolean`（true = 已同步，false = 無 session 跳過）；`saveUserAndSync` 傳遞此值，未同步時在 localStorage 標記 `_syncPending: true`；`loadFromRemote` 執行前若發現 `_syncPending`，先把本地資料推上 Supabase 再拉遠端，避免重開後舊資料蓋掉本地變更；改名與頭像上傳的 UI 訊息改為依實際同步結果顯示（已同步 / 已儲存在此裝置，登入後可同步），不再顯示假的「✓ 同步完成」

- [x] **BUG-101** 覆蓋稱號清除後隔天重置回覆蓋值
  - 完成：根因與 BUG-104 相同 — `_syncUserPreference` 呼叫 `saveUserAndSync` 時若無 session，`upsertProfile` 靜默跳過，Supabase 未更新；下次登入 `loadFromRemote` 用舊 cloud 資料蓋掉本地清除結果。BUG-104 的 `_syncPending` 機制同時修正此問題：未同步時標記 pending，`loadFromRemote` 執行前先推本地資料（含已清除的 `customTitle: ''`）再拉遠端

- [x] **SKIN-101** Modern skin 修正：繼承 theme 主色 / accent 而非硬覆蓋
  - 完成：移除 Modern skin 對 `--primary` / `--accent` 的硬覆蓋（Apple-blue #0a84ff），改為讓 `--modern-primary` / `--modern-accent` 直接 `var(--primary)` / `var(--accent)`；`--modern-focus-ring` 改用 `color-mix()` 動態跟隨主色；Modern skin 切換後主色仍由使用者選定的 theme 決定，不再強制換色
  - 分支：`fix/modern-skin-theme-compat`

- [x] **LB-201** 排行榜顯示公開使用者大頭貼
  - 完成：新增 `010_leaderboard_avatars.sql`，讓 `leaderboard_view` 提供 `avatar_url`，並新增 authenticated users 可讀取公開排行榜使用者 avatar object 的 Storage SELECT policy；排行榜每日刷新時會為 avatar path 產生 signed URL 並存入本機快取，row 顯示圖片頭像，失敗或無頭像時維持名字首字 fallback

- [x] **USER-201** 修正使用者名稱 / 大頭貼同步與排行榜快取
  - 完成：個人頁名稱與等級稱號偏好改為本機優先保存並進行雲端同步；大頭貼改為先本機預覽，登入使用者上傳 `avatars` Storage 並把 Storage path 寫回 `profiles.avatar_url`，遊客則保留為本機頭像；排行榜新增每日有效日快取與快取 fallback，頁面顯示每日更新時間與上次更新時間；頂部狀態條新增使用者名稱並與個人頁共用同一頭像來源；555 tests passing

- [x] **PS-212** 地圖視窗支援點選房間切換場景
  - 完成：地圖房間可點擊切換場景；鎖定樓層漸進揭露（只顯示已解鎖樓層 + 下一個 teaser + 其餘收合）；鎖定房間顯示「Lv.XX」但不洩漏名稱；公司辦公室標示「上班中」/「回顧」badge；走廊/景觀等無 sceneId 房間移除；切換場景觸發進場動畫；`getSceneMinLevel` helper 新增；550 tests passing（PR #95 #96 #97）

- [x] **PS-208** 修正住處場景切換邏輯
  - 完成：mastery 階段「住處」tab 改為顯示所有已解鎖豪宅場景（`getUnlockedEstateScenes`）；`rough-room` / `upgraded-rental` 在 Lv.40 透過 `MEMORY_PROPERTY_RULES` 正式畢業進「回顧」；`resolveActiveScene` 跳過 stale memory scene，自動 fallback 到豪宅預設；移除 estate SCENE_OPTIONS 的 maxLevel 誤差；540 tests passing

- [x] **PS-207** 將舊辦公樓層與租屋處正式納入 memory property 規則
  - 完成：新增 `MEMORY_PROPERTY_KIND` 與 `MEMORY_PROPERTY_RULES`（`unlockRules.js`），作為 memory property 的資料層唯一來源；新增 `getGraduatedMemoryScenes`、`isMemoryScene`、`getMemoryPropertyRule` 三個 helper；`gameState.js` 加入 `memorySceneLog` 追蹤欄位與 `recordMemorySceneVisit` API；`world/floorMap.js` 為四個畢業辦公室房間加上 `graduatesAtLevel`，並新增 `getMemoryRooms(level)` query helper；補 26 個測試（523 tests passing）

- [x] **PS-206** 為 personal space 新增地圖視窗入口
  - 完成：新增 `ui/floorMapPanel.js`，personal space 場景列會依目前可用場景顯示公司 / 豪宅地圖圖示；點擊後開啟樓層圖視窗，使用 `world/floorMap.js` 顯示樓層、房間、房間類型與目前所在場景位置

- [x] **PS-205** 定義公司大樓與豪宅的樓層圖 / 房間拓樸資料
  - 完成：新增 `world/floorMap.js`，為公司與豪宅定義 `building / floor / room / scene / adjacency` schema 與查詢 helper；後續地圖視窗與房間拓樸變更可直接讀資料層，不需要重寫 scene runtime

- [x] **PS-202** 為 personal space 建立 furniture ownership / placement 的本地資料模型
  - 完成：`personal-space-state` 現在正式區分 `ownedItems` 與 `placedItems`；新增 placement normalization 與 `furnitureState` 解析層，`sceneRuntime` 會讀 local placement state 覆蓋 scene layout，而不把 placement 規則耦合進 runtime 內部

- [x] **PS-210** 為 personal space 建立 sprite-based furniture layout schema
  - 完成：新增 `world/furnitureLayout.js`，把租屋處、公司一樓與現有豪宅場景的家具位置抽成 schema，支援 `assetId / x / y / width / height / z / anchor / scale / shadow`；`sceneRuntime` 會依 schema 渲染家具與地面陰影，不再依賴原本的色塊式 placeholder 容器

- [x] **PS-209** 匯入 personal space 2D 素材包並接上 asset registry
  - 完成：使用者提供的 `window / reference / props` 素材包已放入 `pwa/assets/personal-space/`；`assetRegistry` 與 `sceneRuntime` 會讀取窗景背景、窗外立繪與現有 2D 家具 sprite，無對應資產時仍保留原本 placeholder fallback

- [x] **PS-208** 建立辦公窗景 view node 互動原型
  - 完成：`office-window` view node 現在可切換到窗外 placeholder view，顯示 skyline、玻璃層、窗外立繪 slot 與返回按鈕；返回會依 view 的 `exitAction` 回到原場景

- [x] **PS-204** 為 personal space 建立 interactive scene graph 資料模型
  - 完成：新增 scene graph schema 與範例資料，支援 `exit / view / inspect / npc` interaction nodes、anchors、action sequence、views、asset slots；runtime 會讀取資料渲染 hotspot 並透過 interaction bus 發送 action event，頁面可用通用 `changeScene` action 從公司一樓回到住處

- [x] **PS-203** 將個人空間的場景切換器改為二層分類選單
  - 完成：個人空間場景切換器已改為 `住處 / 上班 / 回顧` 分類列加分類內場景列；舊辦公樓層會歸到 `回顧`，Lv.80 買回最初租屋處也先納入 memory scene 資料

- [x] **PS-201** 將個人空間頁面的 scene placeholder 升級為可描述場景狀態的 2D 視覺層
  - 完成：個人空間頁面已從純文字 placeholder 升級為會反映 stage / scene / owned items 的輕量 2D scene layer

- [x] **PS-102** 建立最小可用的個人空間商店資料流
  - 完成：頁面已列出 `STARTER_CATALOG`，並保留 starter shop 的購買事件接點供下一步實作寫入流程

- [x] **PS-101** 個人空間頁面接入真實 `spentGold / ownedItems` 本地狀態
  - 完成：`personalSpace` 頁面已接入本地 `spentGold / ownedItems`，available gold 會扣除已花費，並顯示已擁有物件快照

- [x] **DOC-001** 補齊 Orbit life-sim foundation 文件基線
  - 完成內容：README 加入 product positioning、design philosophy、personal space、Gold economy、AI companion、hidden stats、platform expansion、life-sim roadmap

- [x] **DOC-002** 建立共享協作規則文件
  - 完成內容：新增 `AGENTS.md`，定義 baseline、scope control、task lifecycle、documentation sync

- [x] **ARCH-001** 建立 `pwa/js/platform/` 骨架
  - 完成內容：`notifications.js`、`haptics.js`、`share.js`、`purchases.js`、`storageBridge.js`

- [x] **ARCH-002** 建立 `pwa/js/personalSpace/` 骨架
  - 完成內容：economy、unlock rules、game state、scene runtime、asset registry、interaction bus、avatar / npc / world / ui 子模組

- [x] **UI-001** 新增個人空間頁面與 route
  - 完成內容：`personalSpace` route、底部 nav、最小 page renderer、scene placeholder、Gold / unlock 顯示

- [x] **TEST-001** 補上個人空間頁面基本單元測試
  - 完成內容：`tests/unit/personalSpace.test.js`

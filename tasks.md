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

- [ ] **HW-112** 佐證圖片雲端同步（Supabase Storage）
  - Goal: upload proof photos to Supabase Storage so they persist across devices and app reinstalls.
  - Scope: `platform/badge.js` → new `pwa/js/platform/proofStorage.js` adapter; bucket `orbit-proof`, path `{user_id}/{sessionId}.jpg`; RLS: SELECT/INSERT/DELETE scoped to `auth.uid()`; use existing `compressImage()` output; graceful fallback to localStorage-only for guests.
  - Acceptance: logged-in user completes a task, attaches proof, photo survives sign-out and re-login on a different device; guest mode still works with localStorage only; no service_role key in client code.
  - Note: requires Supabase Storage RLS policy and a bucket — propose SQL migration before implementation.

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

- [ ] **PS-211** 為 personal space 新增常用資產 preload / cache 策略
  - 目標：降低切換頁面或切回 personal space 時重新顯示圖片的等待感
  - 範圍：`pwa/js/personalSpace/`、service worker / asset loading 相關模組、相關測試或文件
  - 完成條件：目前常用場景素材可預載或快取，window view 與主要家具切頁後不再明顯延遲出現
  - 備註：應在主要場景與資產集合較穩定後再做，避免過早優化 placeholder 階段的載入策略

- [ ] **PS-227** Generate controlled idle furniture variants from approved references
  - Goal: replace one-view-only expanded props with true `front / left-wall-flush / right-wall-flush` variants that preserve material identity.
  - Scope: legacy Idle Growth Window only; pause further volume work while the fixed-camera Personal Space V2 vertical slice is validated.
  - Acceptance: resume only if a validated runtime interaction still needs multiple authored perspectives; preserve all completed variant assets and provenance in the meantime.

- [ ] **AI-202** 定義 companion relationship stage 與 hidden stats 的最小映射規則
  - 目標：讓 companion 關係變化可由真實行為驅動，而不是聊天次數
  - 對應 roadmap：Phase 2 / Phase 4

- [ ] **AI-203** Companion `remind` 的資料來源與頻率提案（Mode A，只產出規格）
  - 現況（AI-201 盤點時發現）：`companionEngine.js` 只有在 Low Momentum 且 `missedPatterns` 含使用者選定目標時才回傳 `remind`，但 `viewModels.js` 讀取的 `coreState.missedPatterns` 沒有任何寫入點，所以這個狀態在 production 永遠不會出現。
  - 交付物：一份提案，決定「使用者選定目標」的資料來源（Goals 頁的目標或 V2 state 的新欄位）、`missedPatterns` 的計算方式，以及 bounded remind 的頻率上限與冷卻規則
  - 完成條件：提案經使用者核准；核准後才建立實作任務 `AI-203B`，並把核准的規則寫成它的驗收條件
  - 對應 roadmap：Phase 2

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
    8. `PRO-014P` 換日處理只依權威的 entitlement 結果執行（否則 projection 過期的付費使用者會失去保護卡與 offer）
    9. `PRO-014H` 另案核准後執行 cutover（旗標切到 `server`）
  - **為什麼 C 的實作與部署要拆開**：`.github/workflows/deploy.yml` 在每次 push `main` 後自動部署 `pwa/`，所以**合併 = 部署**。`PRO-014C` 的 client 會呼叫 `start_trial()`，若在 `PRO-014I` 之前合併，該 function 在 production 還不存在，trial 會整段失效。舊版寫「I 必須在 C 部署之前或同時完成」既與順序衝突，「同時」也無法保證原子性 —— 因此把合併本身變成一個有前置的具名任務（`PRO-014J`），而不是塞在 C 裡的但書。
  - `PRO-014E` → `PRO-014F` 為呈現層，接在 `PRO-014D` 之後。`PRO-014G` 為可選 hardening，不在主線上。`PRO-014M`（開發者面板）不擋 cutover，但 `PRO-014H` 的實機驗證會需要它；`PRO-014Q` 同理，實機驗證前要完成。
  - 狀態：此項只作為追蹤母項，不直接進入實作；各子任務需各自遵守 `Next → In Progress → Done`
  - 既有 PR：[#132](https://github.com/yoyoCadence/Orbit/pull/132)（Ready for review；開始後續任務前應確認最新 head）

- [ ] **PRO-014H** Production Pro entitlement client cutover
  - 目標：把 `REPO_PRO_ENTITLEMENT_SOURCE` 由 `legacy` 切到 `server`，讓 production 的 `isProUser()` 實際改用 server-derived UI projection
  - 範圍：repo 常數變更、付費／非付費／trial／離線／切換帳號的實機驗證、rollback 程序；不含新功能
  - 完成條件：切換後付費使用者維持 Pro、非付費不會誤授權、離線在 grace window 內維持、超出後 fail closed
  - **rollback 是「旗標＋相容層」兩件事，不能只切回 `legacy`**：本任務會移除 `PRO-014C` 的 legacy 寫回相容層，而 `legacy` gate 的 `isTrialUser()` 只讀 `user.trialStartedAt`。若只把旗標切回 `legacy` 而不還原相容層，trial 使用者會直接失去 Pro —— rollback 本身變成一次故障。演練與記錄需涵蓋兩者同時還原。
  - **前置：`PRO-014J` 完成（因此 C／D／I 皆已完成且 client 已上線），以及 `PRO-014L`、`PRO-014P` 完成。** 依 AGENTS.md §3 高風險規則，production rollout 需另行取得明確核准
  - **為什麼 `PRO-014L` 是前置**：SUB-16 連勝解鎖目前在 client 端寫 `state.user.isPro`。切到 `server` source 後那個寫入不再有任何效果，連勝解鎖會靜默失效 —— cutover 不該挾帶一個功能迴歸。
  - 一併移除 `PRO-014C` 建立的 legacy 相容層（client 寫回 `trial_started_at`）—— cutover 後 legacy gate 不再被使用。**移除與旗標切換應在同一次變更內**，rollback 時也一起還原。
  - 依賴：`PRO-014J`、`PRO-014L`、`PRO-014O`（已於 v1.25.5 完成：cached-user 啟動也會 refresh projection）、`PRO-014P`（**擋 cutover**）；實機驗證前也需完成 `PRO-014Q`

- [ ] **PRO-014P** `server` source 下，換日處理只依權威的 entitlement 結果執行
  - 問題（PR #160 Codex review 指出，2026-10-18 對照 `dayCycle.js` 確認）：
    - 缺天時的連勝歸零本身與 Pro 無關。
    - 依賴 `isProUser()` 的是三件事：每月補滿保護卡、歸零後的保護卡 offer、SUB-16 解鎖（非 Pro 且連勝 ≥45 時發放並消耗一次性的 `streakUnlockUsed`）。
    - cached-user 啟動先跑 `bootWithLocalState()`，`db.refreshProEntitlement()` 在背景同步後才跑；`loadAndStart()` 在 `loadFromRemote()` 失敗時也會跳過 refresh 直接開機。
    - 結果：projection 過期的付費使用者會被當成非 Pro。他們拿不到保護卡、拿不到 offer，還可能把 `streakUnlockUsed` 用掉。同時 `lastStreakDate` 已推進，之後無法補救。
  - 影響：`legacy` source（目前 production）下不會發生；只影響已 opt-in `server` 的裝置。cutover 後會直接傷害付費使用者。
  - 現況（對照 `storage.refreshProEntitlement()` 與 `applyProStatusResponse()`）：所有非 Pro 的情況都回 `false`，目前的呼叫端也都忽略回傳值。各情況的 snapshot 處理：
    - **網路例外**（`supabase.rpc()` throw）：保留舊 snapshot
    - **RPC 回傳 `error`、資料格式不符、沒有 session 或 owner 不符**：清除 snapshot
    - **snapshot 寫入失敗**：`writeProEntitlementSnapshot()` 設定 lost-write latch 並立即 `removeItem()`，所以通常會**刪除**舊 snapshot；只有刪除也失敗時，舊 snapshot 才留在磁碟上（由 `SNAPSHOT_TTL_MS` 兜底）
    - **`FLAG_DEV_BACKUP` 存在**：直接略過，不呼叫 RPC
    - **明確非 Pro**：寫入非 Pro 的 snapshot
  - 方向（實作前需提案與核准，屬 entitlement 啟動流程）：
    - `refreshProEntitlement()` 改回傳可區分的結果 `{ status: 'pro' | 'not-pro' | 'unknown' }`。
    - 判定依序為：
      - RPC 成功且 snapshot 寫入成功，依結果回 `pro` 或 `not-pro`；
      - 否則若有 `SNAPSHOT_TTL_MS` 內的 snapshot，以它判定（離線 grace window）；
      - 都沒有才是 `unknown`。
    - 從未登入過的訪客（沒有任何 owner）不會有 server entitlement，視為 `not-pro`。曾登入的 owner 只是 session 暫時無法還原時，若也沒有 TTL 內的 snapshot，仍是 `unknown`。
    - 在 `server` source 下，換日處理（補卡、offer、SUB-16、推進 `lastStreakDate`）只在 `pro` 或 `not-pro` 時執行。
    - `unknown` 時整個換日處理延後：記錄**確切的待處理日期**（可能不只一天），不推進 `lastStreakDate`。得到權威結果時依序重播這些日期，各自依當天的 Sessions 判定，而不是只處理「新的昨天」。
  - 完成條件：
    - `unknown` 的每種來源（snapshot 過期或不存在時的網路例外與 `FLAG_DEV_BACKUP` 略過、RPC error、格式不符、寫入失敗）都不重設連勝、不補保護卡、不消耗 `streakUnlockUsed`，且不推進 `lastStreakDate`
    - TTL 內的 snapshot 在離線時照常判定
    - 跨日：第一天 `unknown`、隔天才得到權威結果時，第一天的 Sessions 仍被評估（有效則延續連勝）
    - `pro` 時補卡並提供保護 offer；`not-pro` 時照常重設，SUB-16 條件照舊
    - 每個情況各有測試；目前忽略回傳值的呼叫端（`loadAndStart`、cached-user 背景同步、連線恢復同步）行為不變
  - **擋 `PRO-014H`**
  - 依賴：`PRO-014O`；與 `PRO-014L`（草稿 PR #154）改的是同一段 SUB-16 路徑，需協調先後

- [ ] **PRO-014Q** 開發者面板的 backup 不應擋住其他帳號或非 Pro 模擬的 entitlement refresh
  - 問題（PR #158 Codex review 指出，2026-10-18 確認）：`storage.refreshProEntitlement()` 只要 `FLAG_DEV_BACKUP` 存在就直接 return。這個 backup 也由等級模擬器建立，且 `storage.clearAll()` 登出時不會清除。開發者登出後換另一個帳號，該帳號的 refresh 會一直被跳過，在 `server` source 下 fail closed，直到手動重設。
  - 影響：只影響使用過開發者面板的裝置。
  - 同一個旗標也讓 `upsertProfile()` 對新帳號直接 return；`settings.js` 的 `_devReset()` 會把 backup 裡**前一個帳號**的 user 還原回去。
  - 方向：改用 owner-scoped、專屬 Pro 模擬的標記；或在 owner 改變時清除或驗證 backup。屬 entitlement 路徑，實作前附變更說明。
  - 依賴：`PRO-014M`

- [ ] **PRO-014L** SUB-16 連勝解鎖改由 server 授權
  - 目標：45 天連勝換 30 天 Pro 的授權由 server 發放，而不是 client 自行寫入
  - 現況（`PRO-014C` 實作時發現）：`pwa/js/dayCycle.js` 直接寫 `state.user.isPro = true` 與 `proExpiresAt`，再經 `saveUser()` 同步上雲。這是 client 決定的 Pro 授權 —— 與 `startTrial()` 原本的問題同一類，只是沒被 `PRO-014C` 的範圍涵蓋。
  - **在 `server` source 下會直接失效**：`isProUser()` 改讀 projection 後，寫 `state.user.isPro` 不再有任何效果，連勝解鎖等於靜默消失。因此這項必須在 `PRO-014H` cutover 前完成，否則就是一個功能迴歸。
  - 範圍：新的 `grant_streak_unlock()` RPC（migration 變更）、`dayCycle.js` 的授權路徑、once-per-account 的 server 端強制、相關測試
  - 完成條件：同一帳號無法重複領取；連勝條件由 server 驗證而非 client 傳入；`server` 與 `legacy` 兩種 source 下都正確
  - **前置：屬 RPC／schema 變更，依 AGENTS.md §3 需先取得核准**；建議與 `PRO-014I` 的 production 套用一併規劃，避免第二次 migration 時序問題
  - 依賴：`PRO-014C`

- [ ] **PRO-014N** `my_pro_status()` 回傳 `is_pro`，消除 `expires_at` 的歧義
  - 問題（`PRO-014C` 實作時發現）：RPC 的 `CASE WHEN e.is_pro = true THEN e.pro_expires_at ELSE NULL END` 讓 `expires_at = null` 同時代表「沒有付費」與「終身付費」。client 因此無法在「終身付費」與「試用中」之間可靠區分。
  - 目前的處理：`getPaidProStateFromSnapshot()` 用「還有什麼能解釋這個 active」來推斷 —— 未到期的 `expires_at` ⇒ 付費；沒有 `expires_at` 且沒有生效中的試用 ⇒ 終身付費；沒有 `expires_at` 但試用生效中 ⇒ 算試用。最後一條是保守讀法：在試用期間購買終身方案的人會被顯示成試用中。
  - 範圍：`my_pro_status()` 增加 `is_pro boolean` 回傳欄位、client 改讀該欄位、移除推斷邏輯與其測試
  - 完成條件：終身付費與試用可明確區分，不需推斷；試用期間購買終身方案顯示為付費
  - **前置：屬 RPC contract 變更，依 AGENTS.md §3 需先取得核准**；建議與 `PRO-014I` 的 production 套用一併規劃
  - 影響：純呈現層的正確性，不影響授權判定（`isProUser()` 兩種情況都是 true）
  - 依賴：`PRO-014C`

- [ ] **PRO-014G**（可選）為 entitlement projection 加上 server 簽章的 anti-tamper hardening
  - **狀態：可選，非任何任務的前置。** PR #146 覆驗定案採「UI entitlement projection ＋ server-side enforcement」，signed receipt 不再是 `PRO-014B` 的必要條件。
  - 何時才做：只有在產品明確需要提高「離線 UI 防竄改」的門檻時才啟動。判斷依據是產品需求，不是安全需求 —— 真正的安全控制在 server 端（見 `PRO-014F`）。
  - 為什麼不預設做：簽章擋得掉「手寫一段合法的 localStorage JSON」，但擋不掉裝置擁有者直接改 `isProUser()`。它會引入 RPC contract 變更、簽章私鑰保管、公鑰佈署與輪替等高風險複雜度，若所有呼叫點都只是 UI 顯示／隱藏，投入與所得不成比例。
  - 範圍（若啟動）：`my_pro_status()` 增加 detached JWS receipt 欄位、資料庫端簽章金鑰、公鑰 vendored 進 repo、client 以 Web Crypto 驗章、已驗證結果只存記憶體
  - 完成條件（若啟動）：格式合法但未簽章的偽造 projection 被拒（回歸測試）；receipt `exp` 過期 fail closed；公鑰載入失敗 fail closed；離線首次啟動仍需驗章
  - **前置：屬 RPC／schema 變更，依 AGENTS.md §3 需先取得核准**；若啟動，建議與 `PRO-014D` 合併規劃
  - 提案文件：[`docs/pro-014-entitlement-integrity.md`](docs/pro-014-entitlement-integrity.md)
  - 依賴：`PRO-014B`

- [ ] **PRO-014E** 另案建立 `display_name` 與排行榜安全 read model
  - 目標：在 entitlement foundation 穩定後，以新 PR 提出 `display_name` 寫入規則及排行榜可公開欄位，不沿用 PR #132 的混合範圍
  - 範圍：欄位／constraint、owner-scoped update、leaderboard view 或 RPC、明確 `REVOKE`／`GRANT`、資料逃逸測試與 migration 文件
  - 安全閘門：此項是另一個 schema proposal；實作與套用前需個別核准
  - 依賴：`PRO-014D`

- [ ] **PRO-014F** 交付 SUB-14 排行榜 glow 與 Personal Space Pro 呈現
  - 目標：只使用安全 read model 與 entitlement snapshot 呈現 Pro 身分，不讓視覺功能回寫 entitlement
  - 範圍：排行榜、Personal Space projection、HTML escaping、reduced motion、responsive 與視覺／E2E regression tests
  - 完成條件：Pro／非 Pro／匿名狀態顯示正確，動態文字安全，reduced motion 下無必要動畫，且不改動 auth／entitlement schema
  - **完成條件（server-side enforcement，PR #146 覆驗新增）**：任何有實際價值的 Pro 資料、API 或操作，都必須由 server 自行驗證 `is_pro_active`（RLS policy 或 RPC 內部判斷），**不得**相信 `storage.isProUser()` 或任何由 client 傳入的 Pro 狀態。交付時需逐項列出本次新增的 Pro 入口分別由哪一層強制授權；純顯示／隱藏可只靠 client projection，取得資料或觸發運算則不可。
  - 依賴：`PRO-014E`

- [ ] **PRO-017** 邀請制解鎖 Pro
  - 目標：完成 roadmap 既有 SUB-17
  - 對應 roadmap：中期

- [ ] **AI-015** AI 晨間報告
  - 目標：完成 roadmap 既有 SUB-15
  - 對應 roadmap：長期（v2.x）


---

## Next

> 2026-10-17 排程：Next 為空且 PS-243 只剩 human-device gate，依 Backlog 中不涉及 auth／schema／部署的低風險項目排入 Next；高風險項目仍待個別核准。

> 2026-10-17 核准：使用者明確核准 `BUG-110`（auth flow 表單 UI）、`PRO-014O`（entitlement 啟動流程）、`BUG-109`（只撰寫 migration 與測試，production 套用由使用者執行），並排定 `HW-110`、`HW-106`、`HW-107`。

- [ ] **BUG-109A** 在 production 套用 013 signup trigger migration
  - 目標：讓 production 的 `handle_new_user()` 截斷超過 30 字元的名稱來源，長 email local-part 與長 Google 顯示名稱都能註冊。
  - 步驟：依 [`docs/bug-109-signup-name-truncation.md`](docs/bug-109-signup-name-truncation.md) 的 runbook：先以 `pg_get_functiondef` 比對 production 函式與 004、記錄回滾來源，在非 production 環境跑 `tests/database/bug109.test.sql`，再套用並驗證。
  - **需專案擁有者執行**：production 資料庫操作，Claude 不具權限；依 AGENTS.md §3 屬 schema 變更的套用。
  - 依賴：`BUG-109`

---

## In Progress

- [ ] **PS-243** Complete device performance, accessibility, and telemetry acceptance
  - In progress: establish a reproducible browser acceptance baseline and evidence matrix for responsive viewports, 200% zoom, keyboard flow, reduced motion, route/runtime lifecycle, privacy-safe local telemetry, and simulated performance. Real iOS／Android／standalone PWA measurements and two-account verification remain explicit human-device gates.

---

## Done

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

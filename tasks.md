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

- [ ] **INFRA-105** service worker 安裝時，SHELL 的 JS／CSS／HTML 也要重新驗證，避免改版後先跑舊程式
  - 問題（PS-211A 獨立 review 發現，2026-10-20；修改前就存在）：`sw.js` 的 install 只對圖片與 `pixi.js` 使用 `cache: 'no-cache'`。JS、CSS、HTML 仍走瀏覽器的 HTTP cache。GitHub Pages 的 `max-age=600` 內，新版本的快取會存到**舊的** `version.js` 等模組。
  - 影響：
    - 「新版本已就緒」後的第一次載入，最多約 10 分鐘內仍執行舊程式。stale-while-revalidate 的背景更新也會讀到仍然有效的 HTTP cache。
    - 改版若改了素材檔名，舊的 `assetManifest.js` 會要求不在 SHELL 中的舊檔名：線上 404、離線缺圖。
    - 新模組使用舊模組沒有的 export 時，可能無法 link。
  - 方向：SHELL 的所有項目都以 `new Request(path, { cache: 'no-cache' })` 取得（沒變的檔案只需 304），並以 e2e 模擬改版驗證。
  - **改 service worker 的快取行為（部署行為），需使用者核准**。

- [ ] **PS-211D** 跨版本保存 V2 素材快取（以 `manifest.json` 的 `sha256` 為 key）
  - 背景：PS-211 提案 §5 D。activate 時保留素材快取、依目前 manifest 清理，讓沒改的素材在改版後不必重新下載。
  - 暫緩（使用者 2026-10-20 同意）：素材仍在調整；且要先驗證 GitHub Pages 的 ETag 是否隨部署改變（`curl -I` 比較兩次部署中同一個沒改過的素材）。ETag 不變時，PS-211A 之後的效益很小。
  - 改 service worker 與部署語意，實作前需提案與核准。

- [ ] **PS-249** Orbit Window 在其他蓋住畫面的 overlay 下仍重畫、reveal 計時照走
  - 背景（INFRA-106 獨立 review 發現，2026-10-20）：INFRA-106 只在 Focus overlay 開啟時暫停 Pixi 場景。其他 overlay 也會蓋住首頁：
    - `#levelup-overlay`：85% 黑，z 100（`feedback.js`），升級後顯示到使用者關閉；
    - `.modal-overlay`：65% 黑，用於早晨、每日報告、連勝解鎖、Focus 的結果選擇等 modal；
    - `.shield-confirm-overlay`、`.pro-sheet-overlay`：55% 黑。
  - 另外：reveal 的計時（`orbitWindow.js` 的 reveal clock）不看 Focus overlay，待播放的 reveal 可能在 overlay 底下播完；`.orbit-window-major-reveal`（fixed、z 1200）會畫在 Focus overlay（z 80）之上。
  - 方向：決定哪些 overlay 要暫停場景（半透明的 modal 底下仍看得到場景，不一定要暫停）、reveal 是否要等 overlay 關閉再播；可選的最佳化：overlay 開著時延後掛載、`app.init` 傳 `autoStart: false`。
  - 屬於效能與呈現的調整，先提案再實作。

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
    - 從未登入過的訪客不會有 server entitlement，視為 `not-pro`。訪客也有本機 `uid()` 產生的 `user.id`，目前沒有訪客標記，實作需新增。曾登入的 owner 只是 session 暫時無法還原時，若也沒有 TTL 內的 snapshot，仍是 `unknown`。
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

> 2026-10-18 排程：Next 只剩需專案擁有者執行的 BUG-109A。PS-246 的第一步是提案（只寫文件、不改程式碼），從 Backlog 移入 Next；核准前不實作。

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

- [ ] **BUG-109A** 在 production 套用 013 signup trigger migration
  - 目標：讓 production 的 `handle_new_user()` 截斷超過 30 字元的名稱來源，長 email local-part 與長 Google 顯示名稱都能註冊。
  - 步驟：依 [`docs/bug-109-signup-name-truncation.md`](docs/bug-109-signup-name-truncation.md) 的 runbook：先以 `pg_get_functiondef` 比對 production 函式與 004、記錄回滾來源，在非 production 環境跑 `tests/database/bug109.test.sql`，再套用並驗證。
  - **需專案擁有者執行**：production 資料庫操作，Claude 不具權限；依 AGENTS.md §3 屬 schema 變更的套用。
  - 依賴：`BUG-109`

---

## In Progress

- [ ] **PS-248** 以 Blender 擴充「空間」的主題與素材（提案）
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

- [ ] **AI-202** 定義 companion relationship stage 與 hidden stats 的最小映射規則
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

- [ ] **PRO-014Q** 開發者面板的 backup 不應擋住其他帳號或非 Pro 模擬的 entitlement refresh
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

- [ ] **PS-243** Complete device performance, accessibility, and telemetry acceptance
  - In progress: establish a reproducible browser acceptance baseline and evidence matrix for responsive viewports, 200% zoom, keyboard flow, reduced motion, route/runtime lifecycle, privacy-safe local telemetry, and simulated performance. Real iOS／Android／standalone PWA measurements and two-account verification remain explicit human-device gates.

---

## Done

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
    - 升級：舊版本儲存的 reveal 與最近變化中、不計入進度的 Session（不在前 4 個 Main Quest 日）的 `+25` 在 reconcile 時移除（Codex P2）。舊版本留下、未播放的撤銷 `-25` 無法判斷當時進度是否改變，不處理。
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

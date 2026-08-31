# Orbit Tasks

本文件是 Orbit 的可交接任務清單，供 Codex、Claude Code 與人類開發者共用。

規則：

- 任務狀態固定為 `Backlog / Next / In Progress / Done`
- 任務應可直接執行，不依賴聊天上下文
- 任務粒度保持小而明確
- 任務內容以目前 repo 現況與 `README.md`、`ROADMAP.md` 為準

---

## Backlog

- [ ] **BUG-109** Email local-part 超過 30 字元時 Supabase signup 失敗
  - 目標：讓合法但 `@` 前綴超過 30 字元的 email 能完成註冊，同時維持 profile `name` 的 30 字元限制。
  - 根因：production 的 `handle_new_user()` 以 `split_part(NEW.email, '@', 1)` 建立 profile 名稱，未截斷即寫入受 `profiles_name_check` 約束的欄位，Auth 因 trigger exception 回傳 `500 Database error saving new user`。
  - 範圍：提出並核准 migration 後修正 signup trigger，補長 email 整合測試；此項涉及 Auth／schema，不納入 BUG-108 的 Service Worker hotfix。

- [ ] **HW-104** Camera proof capture for task deliverables
  - Goal: allow users to attach an optional local photo proof to a completed task or session, optimized for mobile camera capture.
  - Scope: PWA-only file/camera input, local preview/compression, localStorage-safe metadata shape; no cloud upload or schema changes.
  - Acceptance: a completed session can show a small proof thumbnail locally, and clearing local cache removes it.

- [ ] **HW-112** 佐證圖片雲端同步（Supabase Storage）
  - Goal: upload proof photos to Supabase Storage so they persist across devices and app reinstalls.
  - Scope: `platform/badge.js` → new `pwa/js/platform/proofStorage.js` adapter; bucket `orbit-proof`, path `{user_id}/{sessionId}.jpg`; RLS: SELECT/INSERT/DELETE scoped to `auth.uid()`; use existing `compressImage()` output; graceful fallback to localStorage-only for guests.
  - Acceptance: logged-in user completes a task, attaches proof, photo survives sign-out and re-login on a different device; guest mode still works with localStorage only; no service_role key in client code.
  - Note: requires Supabase Storage RLS policy and a bucket — propose SQL migration before implementation.

- [ ] **HW-106** Ambient noise focus signal
  - Goal: use microphone volume level as an optional focus-environment signal, not as recording.
  - Scope: permission-gated Web Audio volume meter, no audio persistence, UI states for quiet / normal / noisy.
  - Acceptance: focus mode can show a live ambient state and stops microphone tracks when leaving the view.

- [ ] **HW-107** Location context mode
  - Goal: support optional coarse context labels such as home / work / outside for task suggestions.
  - Scope: privacy-first local-only geolocation prompt, coarse saved labels, no precise coordinate sync.
  - Acceptance: user can opt in, assign current place to a label, and see context-aware task hints.

- [ ] **HW-110** Offline action queue and sync hints
  - Goal: make offline task completion feel intentional and visible.
  - Scope: local pending-action queue UI, sync status messaging, reuse existing storage bridge patterns; no schema migration.
  - Acceptance: user can complete tasks offline and see a clear pending-sync state when connection returns.


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

- [ ] **AI-201** 建立 AI companion behavior layer 的 rule-based 狀態模型
  - 目標：先定義 `observe / approach / remind / congratulate` 等狀態與觸發條件
  - 對應 roadmap：Phase 2

- [ ] **AI-202** 定義 companion relationship stage 與 hidden stats 的最小映射規則
  - 目標：讓 companion 關係變化可由真實行為驅動，而不是聊天次數
  - 對應 roadmap：Phase 2 / Phase 4

- [ ] **DOC-201** 補一份 personal space state 流程說明文件
  - 目標：說明 `user.totalXP -> level -> unlock -> gold -> ownedItems -> scene` 的資料流
  - 對應 roadmap：Phase 2

- [ ] **PLAT-201** 定義 `platform` adapters 在 PWA 與 future hybrid shell 的行為差異表
  - 目標：讓未來包成 native 時有清楚替換點
  - 對應 roadmap：Phase 5 準備

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
    8. `PRO-014H` 另案核准後執行 cutover（旗標切到 `server`）
  - **為什麼 C 的實作與部署要拆開**：`.github/workflows/deploy.yml` 在每次 push `main` 後自動部署 `pwa/`，所以**合併 = 部署**。`PRO-014C` 的 client 會呼叫 `start_trial()`，若在 `PRO-014I` 之前合併，該 function 在 production 還不存在，trial 會整段失效。舊版寫「I 必須在 C 部署之前或同時完成」既與順序衝突，「同時」也無法保證原子性 —— 因此把合併本身變成一個有前置的具名任務（`PRO-014J`），而不是塞在 C 裡的但書。
  - `PRO-014E` → `PRO-014F` 為呈現層，接在 `PRO-014D` 之後。`PRO-014G` 為可選 hardening，不在主線上。`PRO-014M`（開發者面板）不擋 cutover，但 `PRO-014H` 的實機驗證會需要它。
  - 狀態：此項只作為追蹤母項，不直接進入實作；各子任務需各自遵守 `Next → In Progress → Done`
  - 既有 PR：[#132](https://github.com/yoyoCadence/Orbit/pull/132)（Ready for review；開始後續任務前應確認最新 head）

- [ ] **PRO-014H** Production Pro entitlement client cutover
  - 目標：把 `REPO_PRO_ENTITLEMENT_SOURCE` 由 `legacy` 切到 `server`，讓 production 的 `isProUser()` 實際改用 server-derived UI projection
  - 範圍：repo 常數變更、付費／非付費／trial／離線／切換帳號的實機驗證、rollback 程序；不含新功能
  - 完成條件：切換後付費使用者維持 Pro、非付費不會誤授權、離線在 grace window 內維持、超出後 fail closed
  - **rollback 是「旗標＋相容層」兩件事，不能只切回 `legacy`**：本任務會移除 `PRO-014C` 的 legacy 寫回相容層，而 `legacy` gate 的 `isTrialUser()` 只讀 `user.trialStartedAt`。若只把旗標切回 `legacy` 而不還原相容層，trial 使用者會直接失去 Pro —— rollback 本身變成一次故障。演練與記錄需涵蓋兩者同時還原。
  - **前置：`PRO-014J` 完成（因此 C／D／I 皆已完成且 client 已上線），以及 `PRO-014L` 完成。** 依 AGENTS.md §3 高風險規則，production rollout 需另行取得明確核准
  - **為什麼 `PRO-014L` 是前置**：SUB-16 連勝解鎖目前在 client 端寫 `state.user.isPro`。切到 `server` source 後那個寫入不再有任何效果，連勝解鎖會靜默失效 —— cutover 不該挾帶一個功能迴歸。
  - 一併移除 `PRO-014C` 建立的 legacy 相容層（client 寫回 `trial_started_at`）—— cutover 後 legacy gate 不再被使用。**移除與旗標切換應在同一次變更內**，rollback 時也一起還原。
  - 依賴：`PRO-014J`、`PRO-014L`

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

- [ ] **PRO-014M** 開發者面板的 Pro 狀態切換支援 `server` source
  - 目標：`_devApplyPro()` 在 `server` source 下也能切換 Pro／試用／免費狀態
  - 現況（`PRO-014C` 實作時發現）：`pwa/js/pages/settings.js` 的開發者面板直接寫 `u.isPro` / `u.proExpiresAt` / `u.trialStartedAt`。`server` source 下這些欄位不再被讀，面板變成無效。
  - 範圍：改為寫入 owner-scoped projection（`writeProEntitlementSnapshot()`），或依當前 source 分派；僅開發者面板，不影響 production 路徑
  - 完成條件：兩種 source 下都能切換出付費／試用／免費三種狀態並被 `isProUser()` 正確反映
  - 備註：純開發工具、低風險，但缺了它就無法在裝置上人工驗證 `server` source 的行為 —— `PRO-014H` 的實機驗證會需要
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
  - 對應 roadmap：銝剜?

- [ ] **AI-015** AI 晨間報告
  - 目標：完成 roadmap 既有 SUB-15
  - 對應 roadmap：?瑟? 2.x


---

## Next

---

## In Progress

- [ ] **BUG-108** Service Worker 快取 Supabase Data API 舊回應
  - 目標：Service Worker 只攔截同來源靜態資源，任何 Supabase／跨來源 GET 都直接交由瀏覽器網路層處理。
  - 根因：`sw.js` 的「Images / others」cache-first 分支沒有 origin guard，production 實際把 owner-scoped `profiles`／`tasks`／`sessions`／`energy` REST 回應存入 `orbit-v1.25.1`。登出再登入時讀回 setup 前的空 tasks 與舊 profile，`remoteLoaded` 仍被誤認為成功。
  - 完成條件：跨來源 GET 不呼叫 `respondWith()`、不開啟或寫入 app cache；同來源圖片 cache-first 行為維持；部署後以全新帳號驗證 setup 後第二次登入直接進主畫面、任務與 `trial_started_at` 不變，且 Cache Storage 無 Supabase REST URL。
  - 範圍：v1.25.2 client hotfix、回歸測試與 production smoke；不修改 Auth、Supabase schema／migration 或 entitlement source。

- [ ] **PRO-014J** 合併並部署 `PRO-014C` 的 client
  - 目標：在 production 已具備 011 的前提下，才把 `PRO-014C` 的分支合併進 `main`（＝經 `deploy.yml` 自動部署）
  - 為什麼是獨立任務：`deploy.yml` 在 push `main` 後自動部署 `pwa/`，所以合併等於部署，而「合併」在 Task Lifecycle 裡原本只是 C 完成的副作用，沒有任何前置能擋住它。把它變成具名任務，順序才由前置強制，而不是靠但書提醒（PR #149 覆驗發現）。
  - 範圍：確認前置、合併 `PRO-014C` 的 PR、部署後的 production 煙霧測試；不含新功能、不含旗標切換
  - 完成條件：合併前確認 `PRO-014I` 已完成且 production 的 `start_trial()` 可呼叫；部署後實際在 production 走一次「新帳號開始 trial」與「同一帳號再次呼叫**回傳相同 `trial_started_at`、未被重設或延長**」；確認 `legacy` source 下 trial 開始後 `isProUser()` 仍為 true（`PRO-014C` 的相容層有效）；確認第二次登入不會卡在 loading 畫面
  - 進度（2026-08-30）：PR #150 已合併並部署；首次 production smoke 驗證 RPC 成功與冪等，但發現 setup 重建 profile 會覆寫既有欄位。修正與擴大回歸測試在 PR #151，待人工檢查、合併、部署後重跑 production smoke，完成前維持 In Progress。
  - 進度（2026-08-31）：PR #151 已合併部署；第二次 production smoke 的首次 trial、setup 欄位保留、試用 UI 與預設任務皆通過，但第二次登入被 BUG-108 的 stale Supabase REST cache 導回 setup。待 v1.25.2 部署並重跑 smoke 後才能完成本任務。
  - **前置：`PRO-014C`（分支實作完成）、`PRO-014D`、`PRO-014I` 全部完成**
  - 回退方式：revert 該合併 commit 即可讓 client 回到舊行為；資料庫端不需要動
  - 依賴：`PRO-014C`、`PRO-014D`、`PRO-014I`

- [ ] **PS-243** Complete device performance, accessibility, and telemetry acceptance
  - In progress: establish a reproducible browser acceptance baseline and evidence matrix for responsive viewports, 200% zoom, keyboard flow, reduced motion, route/runtime lifecycle, privacy-safe local telemetry, and simulated performance. Real iOS／Android／standalone PWA measurements and two-account verification remain explicit human-device gates.

---

## Done

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

# Agent 交接紀錄

讓另一個 agent（或另一個帳號）能在沒有對話紀錄的情況下接手。**每完成一個段落、開 PR 時更新本檔**，並與該 PR 一起提交。

任務本身的定義與驗收條件以 [`tasks.md`](../tasks.md) 為準；本檔只記錄進行中的狀態、與使用者約定的工作規則，以及接手需要的操作細節。

> 最後更新：2026-10-19。PS-246（#176，v1.30.1）、AI-203B（#177，v1.31.0）、HW-113（#180，v1.31.1）、PRO-014Q S0（#178，v1.31.2，含使用者核准的 A1＋B1）、AI-204 提案（#181）、PS-247（#182，v1.31.3）已合併；INFRA-102（CI 上傳 e2e artifact）完成。使用者已核准 AI-204 的 W-A＋L2＋夥伴名稱，下一步實作（§3 第 6 點）。

## 1. 接手前先讀

1. `CLAUDE.md`：Supabase RLS 規則、高風險變更需先說明並取得核准、絕不在終端機輸出 secret。
2. `AGENTS.md`：§3 高風險區、§11 範圍控制、§14 每個 PR 跑一次 `npm run bump`（同一個 commit）、§15 任務生命週期（Backlog → Next → In Progress → Done）。本 repo 的慣例是先單獨提交 In Progress，再在完成的 commit 移到 Done。
3. `tasks.md`：Next／In Progress／Backlog。
4. 本檔 §3 的進行中 PR。

## 2. 與使用者約定的工作規則

- 工作循環：依 `tasks.md` 完成一個段落 → 開 PR → 合併 → 下一個。每個段落結束時更新本檔。
- **合併條件**（2026-10-18 使用者核准）：
  - CI 四項（lint、test、e2e、build-check）全綠；
  - Codex review 已完成（開 PR 約 2–3 分鐘後才出現），且沒有未解決的 finding；
  - 有任何 P1／P2 未解，或 finding 要求使用者核准，**停下來問使用者**，不自行判定。
- **Codex 額度用完時（2026-10-18 使用者核准）**：改用獨立的 Claude review agent 代替。它只讀不改，對照程式碼逐項回報 P1／P2／P3。P1／P2 全部修完、CI 全綠才合併；需要核准的項目仍要先問使用者。
- Codex 的 finding 先對照程式碼驗證。成立就修，在 thread 回覆修正的 commit 並 resolve，再留言 `@codex review` 要求重審，等重審乾淨才合併。不成立就回覆理由，並交給使用者決定。
- 高風險（auth、tokens、`.env`、schema／migration、CI/CD、部署、修改既有設定、Pro entitlement 流程）：先寫變更說明，取得使用者核准才實作。
- 純文件或任務定義的 PR 不 bump 版本（本工作階段的作法，#155–#157、#161 皆如此）；其餘 PR 依 §14 bump。
- 合併 PR 時使用完整 40 字元 SHA 作為 `expectedHeadSha`。
- Commit 結尾加 `Co-Authored-By` 與 `Claude-Session` 兩行；PR 描述結尾加 Claude Code 標記；不要寫入 model 名稱。

## 3. 進行中的工作（接手從這裡開始）

使用者在 2026-10-18 核准了三份提案（細節記在 `tasks.md` Next 的「2026-10-18 核准」註記），並要求**依序實作，每項一個 PR，從 PS-246 開始**。順序與狀態：

1. **PS-246：完成**（#176，v1.30.1）。V2 的 `placements` 固定為 `{}`；Edit Mode 只顯示說明；移除舊擺放的編輯程式碼與樣式；technical design §7.2 改為 S1；state-flow 更新；新增回歸測試（在修正前的程式碼上會失敗）；重新產生 asset baseline。lint、`npm test`（64 files／1073 tests）、e2e 41/41、`ps242:manifest`／`ps243:assets --check` 通過。
2. **AI-203B：完成**（#177，v1.31.0）。`viewModels.selectRemindGoals()` 從 `coreState.dailyPlan` 推導 `missedPatterns`；新增 `pwa/js/personalSpace/v2/remindWindow.js`（`isWithinRemindWindow`、`watchRemindWindow`：在 12:00／14:00 與隔天 12:00 設計時器，回到前景時重新判斷；`describeControl`／`findControl` 讓重新 render 保留焦點），首頁小卡與完整頁面 mount 時啟動、cleanup 時取消，完整頁面重新 render 時保留打開的詳細資訊面板（Codex P2 修正）；D2 的 CSS；`companionEngine.js` 不改。lint、`npm test`（65 files／1105 tests）、e2e 41/41、`ps242:manifest`／`ps243:assets --check` 通過。
3. **PRO-014Q S0：完成**（[#178](https://github.com/yoyoCadence/Orbit/pull/178)，v1.31.2；v1.31.1 由先合併的 #180 使用）。
   - 內容：「↩ 還原原始資料並重啟」先確認，再呼叫：
     - `storage.discardDevSimulation()`：刪除所有 `yoyo_profileSyncPending*`、本機 user、projection，最後刪除備份；
     - `v2/store.removeAllPersonalSpaceV2States()`：刪除所有帳號的 V2 state，保留 legacy claim 與 legacy state；
     - 然後重新載入。
   - 第一輪獨立 review 找到 P1（多視窗外流，main 上原本就有）與 P2（遊客失去唯一的本機 profile）。**使用者 2026-10-19 核准 A1＋B1**：
     - A1：`app.js` 監聽 `storage` 事件，其他視窗移除 `orbit_dev_backup` 或清空 localStorage 時重新載入；
     - B1：`db.readGuestDevBackup()` 在讀取 session 成功且沒有 session、backup 屬於本機 user 時回傳 backup，`discardDevSimulation({ restoreUser })` 把它寫回；遊客使用 `DEV_RESET_CONFIRM_GUEST`。
   - 複查（Codex 恢復可用，對 6f81638 無 finding；獨立 review 無 P1）找到 P2：讀取 session 出錯（token 過期且離線）時被當成遊客，舊備份會蓋掉雲端較新的資料；改為出錯時走已登入的清理。P3：重新載入前再按一次會刪掉剛寫回的遊客 profile；加上 backup 檢查與防重入。
   - 刻意不處理、記錄在變更說明 §4 S0「review 後的補充」的已知限制：A1 的毫秒級空窗、undo journal 的模擬 XP、在別的帳號模擬後才建立的遊客（Q6 前要決定）。
   - 測試：`tests/unit/pro014qDevReset.test.js`（含「只刪備份會外流」的對照組與遊客情境）、`appBootSequence.test.js` 的 A1 測試；另以 Playwright 開兩個分頁實測 A1＋B1。
   - CI：e2e 在 64b8633 兩次失敗（`flows.test.js:189` 逾時），程式碼與該測試無關；同一天 #180 也在只改版本號的 commit 上失敗一次（`flows.test.js:175`），重跑即通過。判斷為 CI 上 Focus 提前結束流程的間歇性逾時，見下方「其他」。#180 合併後 merge main、改為 v1.31.2 再跑 CI。
4. **PRO-014Q Q6**（被測試帳號擋住）：移除開發者面板的等級與 Pro 模擬、舊 backup 的一次性清理（沿用 S0 的兩個清理函式與 B1 的遊客判斷；在別的帳號模擬後才建立的遊客，處理方式要先問使用者）、測試帳號說明文件。**preview 專案的測試帳號要由專案擁有者建立**（agent 沒有 Supabase 權限）；實作前先向使用者確認帳號已建立。Q6 上線時更新 `tasks.md` 中「PRO-014H 的實機驗證需要 PRO-014M」的說明。

5. **HW-113：完成**（#180，v1.31.1）。今日計畫改用 `effectiveToday(newDayHour)`；新增 `storage.currentDailyPlan()`，app 開著跨過 `newDayHour`、day watcher 尚未重設時，新增、移除與拖曳排序從空的計畫開始。AI-203B 的「00:00 到 `newDayHour` 不提醒」未修改（已核准的驗收條件）。另外發現：Tour 的教學任務只從記憶體的計畫移除，儲存中仍留著 `tour-task`（未建立任務）。

6. **AI-204：提案已核准**（#181；使用者 2026-10-19 選 W-A＋L2，夥伴名稱統一為「Orbit 夥伴」）。下一步依提案 §5、§7 實作（建議另立 AI-204B，比照 AI-203B）。review 的教訓：第一版以「小卡放得下」為理由，實際小卡是單行截斷，兩版都放不下；也漏了既有測試釘住的文字。提案的事實要在真實 app 量測、grep 時用短字串。

7. **PS-247：完成**（v1.31.3）。椅子渲染時把書桌設為遮擋物（Holdout 材質，`PROP_OCCLUDERS`），右扶手與腳輪不再畫在邊櫃前面。注意：物件層級的 `is_holdout` 會讓 Freestyle 留下被擋住的邊的殘影，所以用材質。Blender 重新渲染在不同機器上不是逐位元組相同（家具有取樣雜訊差異、trim 框可能差 1 px），只更新真正改變的素材，其餘從 git 還原；預覽要從 lossless 的 room 合成重畫（`phase-000` 應與原檔相同）。

其他：

- **CI e2e 間歇性逾時（2026-10-19）**：`tests/e2e/flows.test.js` 的「Focus 計時流程」提前結束兩個測試（:175、:189）在 CI 上偶發 `Test timeout of 15000ms exceeded`，與 PR 內容無關（只改版本號的 commit 也失敗、重跑通過）；本機（完整 Chromium、headless shell、`CI=1`、2 workers、CPU 滿載）都無法重現。當時 CI 沒有上傳 Playwright artifact，看不到卡在哪一步。INFRA-102（使用者核准）之後 e2e 失敗時會上傳 `playwright-test-results` artifact（`test-results/`，保留 7 天），下次遇到先下載看 error-context。遇到時依規則只重跑一次，第二次失敗要查。
- **請專案擁有者自行檢查**：若曾在自己的帳號用過開發者面板的「模擬 Pro」或「模擬等級」後按「還原」，確認 Supabase 中該帳號 `profiles` 的 `is_pro`、`pro_expires_at`、`total_xp` 是否正確（PRO-014Q 發現的既有問題）。
- 草稿 PR [#154](https://github.com/yoyoCadence/Orbit/pull/154)（`feat/pro-014l-streak-unlock-rpc`，PRO-014L）不是本工作階段開的；它改的 SUB-16 路徑與 `PRO-014P` 相同。
- Codex review 額度在 2026-10-18 兩度用完（中間短暫恢復，對 #172、#173 找到 6 個 P2，都已修正）。額度用完時依 §2 改用獨立 Claude review（只讀 agent，對照程式碼回報 P1／P2／P3，修完再請它複查）。
- 2026-10-19：Codex 在 #176 與 #177 開 PR 時可用（#177 找到 2 個 P2，已修），之後額度再度用完；#177 的複查與 #178 改用獨立 Claude review。獨立 review 在 #177 另找到「還原焦點會捲動頁面」的 P2，在 #178 找到上述 P1／P2，所以複查不能省。
- 2026-10-19 12:24：留言 `@codex review` 後 Codex 又可用了（#178 的 6f81638 無 finding）。每個 PR 仍同時跑獨立 Claude review：#178 的複查在 Codex 沒找到問題的 commit 上仍找到 P2。
- 教訓：三份提案的獨立 review 各找到 P1（PRO-014Q 連續四輪）。提案的事實與設計都要對照程式碼驗證；逐條修補一直被找到新漏洞時，要退一步改結構（PRO-014Q 由修補 backup 改為移除模擬，AI-203 由 F3 改為 F4）。

## 4. 本次工作階段已完成（2026-10-17～19）

| PR | 版本 | 內容 |
|---|---|---|
| #155 | — | tasks.md 排程整理 |
| #156 | — | `docs/personal-space-state-flow.md`（DOC-201） |
| #157 | — | `docs/platform-adapters.md`（PLAT-201） |
| #158 | v1.25.3 | PRO-014M 開發者面板支援 `server` source |
| #159 | v1.25.4 | BUG-110 登出後重設登入按鈕 |
| #160 | v1.25.5 | PRO-014O cached-user 啟動也 refresh entitlement |
| #161 | — | BUG-109 signup trigger 名稱截斷 migration（只寫入 repo，**未套用 production**） |
| #162 | v1.26.0 | HW-110 離線待同步提示與連線恢復同步 |
| #163 | v1.27.0 | HW-106 Focus 環境音偵測 |
| #164 | v1.28.0 | HW-107 位置情境 |
| #165 | v1.28.1 | BUG-111 Service Worker 預快取漏列模組（更新後離線無法啟動）＋ import 圖測試 |
| #166 | v1.28.2 | BUG-112 位置／麥克風請求可取消；同步只在佇列清空才顯示完成 |
| #167 | — | 依 review 修正 state-flow／platform-adapters 文件；AI-203 改為提案；新增 PRO-014P／Q；本交接紀錄 |
| #168 | v1.29.0 | PS-244 Blender 渲染的工作站房間與 8 件家具（含獨立 review 的椅子 z 與覆寫修正） |
| #169 | v1.30.0 | PS-245 Blender 精細化：家具真實構造、螢幕 UI、地板木紋、地毯、護牆框線板、壁燈、時鐘、插座、捲簾與窗簾（含獨立 review 的壁燈陰影與時鐘位置修正） |
| #170 | — | 交接紀錄：記錄 #169；寫提案前須依 AGENTS §15 移動任務；渲染時間統一 |
| #171 | — | PS-246 提案：V2 不套用 legacy 位置覆寫（已核准） |
| #172 | — | AI-203 提案：Companion remind 的資料來源與頻率（已核准，實作為 AI-203B） |
| #173 | — | PRO-014Q 變更說明：開發者面板模擬的外流問題，建議 S0＋Q6（已核准） |
| #174 | — | 交接紀錄：記錄 #173 |
| #175 | — | 交接紀錄：記錄使用者核准、AI-203B／AI-204／HW-113、PS-246 WIP |
| #176 | v1.30.1 | PS-246：V2 不再套用舊相機的位置覆寫，Edit Mode 改為說明 |
| #177 | v1.31.0 | AI-203B：Companion 在 12:00–14:00 溫和提醒今日計畫中尚未開始的目標 |
| #180 | v1.31.1 | HW-113：今日計畫改用與 Sessions 相同的 effective date |
| #178 | v1.31.2 | PRO-014Q S0：開發者面板的「還原」改為確認後完整清理；A1 其他視窗重新載入、B1 遊客寫回自己的備份 |
| #181 | — | AI-204 提案：Companion 台詞統一（使用者已核准 W-A＋L2＋夥伴名稱） |
| #182 | v1.31.3 | PS-247：椅子的右扶手與腳輪不再畫在書桌邊櫃前面 |
| #183 | — | INFRA-102：e2e 失敗時上傳 Playwright 的 test-results；記錄 AI-204 的核准 |

教訓：#155–#164 在 Codex review 出現前就合併，造成 #165、#166、#167 的回頭修正。這就是 §2 合併條件的由來。獨立 review 在 #167、#168、#169 都找到真正的問題（例如椅子畫在螢幕後面、壁燈在相框下投出暗影），所以複查不能省。

## 5. 還差什麼

### 需要使用者決定或執行

- **BUG-109A**：在 production 套用 `pwa/db/013_signup_profile_name.sql`，需專案擁有者執行，步驟見 `docs/bug-109-signup-name-truncation.md`。
- **PRO-014Q Q6 的測試帳號**：在 preview Supabase 專案建立（見 §3 第 4 點）。
- **角色 3D 化**：主角與 Companion 仍是 PS-242 的像素 sprite。改成 3D 會推翻已核准素材（主角 12 個姿勢、Companion 6 個狀態），範圍很大，等使用者決定。
- **PRO-014P**：entitlement 流程，實作前需提案與核准，擋 `PRO-014H` cutover。與草稿 PR #154（PRO-014L）改同一段 SUB-16 路徑，寫提案前先問使用者先後順序。
- **PS-243**：真機、installed PWA、雙帳號、螢幕閱讀器等 human gate。
- 尚未回答：高風險項目（如 entitlement）連變更說明都要不要先問再排程（PRO-014Q 變更說明 §7）。在得到答案前，維持「寫變更說明可以，實作前一定要核准」。

### 可直接做（已核准）

- 依 §3 的順序：PRO-014Q Q6（需先有測試帳號）。PS-246、AI-203B、HW-113、PRO-014Q S0 已完成。

## 6. PS-245 精細化：實作計畫

使用者原始需求是「用 blender 的精細模型去完善『空間』分頁」。PS-244 只處理一致性，PS-245 依下列計畫實作，已由 PR #169 合併（v1.30.0）。門、牆面掛畫與重新取景刻意不做，理由見 `tasks.md` 的 PS-245。實作與計畫的其他差異：軌道燈具改為後牆壁燈（不投陰影），時鐘因避開壁燈改到 z 2.28 m。下列內容保留作為設計紀錄。

程式碼只改 `art-pipeline/ps244-blender/scene.py`；素材、manifest、測試數字、CHANGELOG 與版本由下面的完成流程更新。相機 `CAMERA` 不動，角色寬度 24／13 不必重新校準。實作計畫：

- **新增 helper**
  - `Builder.tube(points, radius)`：Bezier curve 加 `bevel_depth`，用於線材、紅線、檯燈電線。
  - `Builder.panel(width, height, thickness, bend)`：細分平面沿垂直軸彎曲後 solidify，用於椅背、窗簾。
  - 螢幕 UI：用 numpy 畫成 `bpy.data.images.new`（sRGB 位元組影像），貼在 UV 0–1 的 plane 上（`rotation=(π/2,0,0)` 時法線朝 −y，正對相機）。
- **家具**
  - 書桌：
    - 桌板加封邊層，抽屜面板內縮並留縫，加橫桿把手。
    - 腳改成 T 型鋼腳並加調整腳墊，桌下加走線槽。
    - 桌面放桌墊、馬克杯、筆記本加筆。這些屬於 desk prop，在 25% 階段出現。
  - 椅子：彎曲網布椅背、腰靠、頭枕、L 型扶手、氣壓棒護套、五爪腳加真實腳輪。
  - 書櫃：
    - 結構：頂蓋外伸、內縮踢腳、背板直紋。
    - 內容物：高低不一的書（書背加色帶）、橫放的書堆、書擋、收納盒、獎盃、相框、小盆栽。
  - 檯燈：關節旋鈕、燈罩邊環、內側發光盤、電線。
  - 計畫板：四邊框條、軟木雜訊紋、連接便條的紅線、月曆卡。
  - 螢幕與鍵盤：
    - 螢幕：程序化 UI（側欄、程式碼行、長條圖）、細邊框加下巴、背殼、支架加底座。
    - 鍵盤：逐顆鍵帽，再加滑鼠與滑鼠墊。
  - 盆栽：盆口邊環、底盤、更多葉片。
- **房間**
  - 地板：在 brick 材質上疊 Wave 木紋。
  - 地毯：放在角色站立區，約 x 0.9、y −0.6、2.6×1.7 m，屬於房間，所以也是陰影接收面。
  - 後牆：
    - 護牆板改成框線線板。
    - 天花線條處加 4 個軌道燈具，對應既有的 4 盞 spot。
    - 書櫃上方加時鐘（約 `(RIGHT_X-1.75, BACK_Y-0.03, 2.45)`）。
    - 書桌附近加插座。
  - 窗：後側兩格加半放的捲簾，靠後牆的角落加窗簾。
  - 左牆在畫面上只占約 6% 寬，不值得加細節。
- **避開成就相框**：相框的 DOM 位置是 `top:20% left:47%`，寬度 `clamp(34px, 13.5%, 86px)`。寬螢幕約佔 x 47–56%、y 20–30%；手機上是 13.5% 寬，約佔 x 47–60.5%、y 20–36%。後牆新物件兩者都要避開。`previews/` 只畫出 960px 的情況。
- **完成流程**：
  1. 先用 `--width 768 --samples 24` 的草稿檢查構圖。
  2. 再跑全解析度（約 30–50 分鐘）。
  3. 跑 `process_pack.py --write-runtime`、`ps242:manifest`、`ps243:assets`。
  4. 更新 `ps243AssetBudget.test.js` 的位元組數。
  5. 用 `npm run bump -- minor`，並寫 CHANGELOG。
- **不含**：角色 3D 化（需使用者另行決定）、PS-246（舊相機位置覆寫，另有提案）。

## 7. PS-244／PS-245 的 Blender 管線操作

詳見 [`art-pipeline/ps244-blender/README.md`](../art-pipeline/ps244-blender/README.md)。重點：

```bash
python3 -m venv /tmp/bpyenv
/tmp/bpyenv/bin/pip install bpy==5.2.2 pillow==12.3.0 numpy==2.5.3   # 需 Python 3.13
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/ps244-renders --width 1536 --samples 96
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/ps244-renders --write-runtime
npm run ps242:manifest && npm run ps243:assets
```

- 全解析度渲染（房間＋8 件）在 4 核 CPU 上約 30–50 分鐘（PS-244 實測約 30 分鐘，PS-245 約 31 分鐘）。只重渲某一件時加 `--only <id>`（例如 `--only room`）。草稿可用 `--width 768 --samples 24`（約 3 分鐘）。
- 渲染原始檔（`room.png`、各家具 PNG）**沒有提交**，只提交處理後的 runtime 素材、`placements.json` 與 `previews/`。在新容器接手必須重新渲染。
- 只能用 Cycles（容器沒有 EGL，EEVEE 不能用）。
- `process_pack.py --write-runtime` 會改寫 `assetManifest.js` 的 `PROP_DEFINITIONS`；`tests/unit/ps244WorkspacePlacements.test.js`檢查兩者一致。
- 素材位元組變動後要更新 `tests/unit/ps243AssetBudget.test.js` 釘住的數字。
- `previews/phase-*.jpg` 會畫出 HW-105 成就相框（位置與 `pwa/assets/style.css` 的 `.orbit-window-achievement-frame` 同步），用來檢查重疊。

## 8. 本機驗證

```bash
npm run lint
npm test
npm run ps242:manifest -- --check
npm run ps243:assets -- --check
```

本機 e2e：repo 鎖定的 Playwright headless shell 在雲端容器裡不存在。做法是建一個只在本機用的 config，沿用 `playwright.config.js`，並把 `launchOptions.executablePath` 指到 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`。這個 config 不要提交。

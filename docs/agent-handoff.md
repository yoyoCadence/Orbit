# Agent 交接紀錄

讓另一個 agent（或另一個帳號）能在沒有對話紀錄的情況下接手。**每完成一個段落、開 PR 時更新本檔**，並與該 PR 一起提交。

任務本身的定義與驗收條件以 [`tasks.md`](../tasks.md) 為準；本檔只記錄進行中的狀態、與使用者約定的工作規則，以及接手需要的操作細節。

> 最後更新：2026-10-18（UTC 11:30 左右）。main = `db9d29a`（v1.30.0，#171 已合併）。

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

## 3. 進行中的工作

- **等待使用者決定的提案**（核准前不改程式碼）：
  - PS-246：[`docs/ps-246-v2-placement-overrides.md`](ps-246-v2-placement-overrides.md)，已由 #171 合併。四個決定：方案 A、Edit Mode 入口（A1／A2）、PS-246B、`unmappedPlacements` 摘要（S1／S2）。
  - AI-203：[`docs/ai-203-companion-remind-proposal.md`](ai-203-companion-remind-proposal.md)，分支 `docs/ai-203-proposal`。決定項見提案 §9。
  - PRO-014Q：`docs/pro-014q-dev-backup-owner-scope.md`，只在分支 `docs/pro-014q-proposal` 上（尚未開 PR；PRO-014Q 移入 In Progress 的 commit 也只在該分支，合併前 main 上仍是 Backlog）。review 發現 main 上已存在、只影響開發者模式裝置的問題：模擬資料可能推到真實帳號，模擬中登出後無法再登入。
- 核准後的流程：把提案的驗收條件寫進對應任務，再實作；PS-246 與 PRO-014Q 實作完移到 Done，AI-203 核准後建立 AI-203B。
- 草稿 PR [#154](https://github.com/yoyoCadence/Orbit/pull/154)（`feat/pro-014l-streak-unlock-rpc`，PRO-014L）不是本工作階段開的；它改的 SUB-16 路徑與 `PRO-014P` 相同。
- Codex review 額度在 2026-10-18 用完；之後的 PR 依 §2 改用獨立 Claude review（只讀 agent，對照程式碼回報 P1／P2／P3，修完再請它複查）。

## 4. 本次工作階段已完成（2026-10-17～18）

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
| #171 | — | PS-246 提案：V2 不套用 legacy 位置覆寫（等待核准） |

教訓：#155–#164 在 Codex review 出現前就合併，造成 #165、#166、#167 的回頭修正。這就是 §2 合併條件的由來。獨立 review 在 #167、#168、#169 都找到真正的問題（例如椅子畫在螢幕後面、壁燈在相框下投出暗影），所以複查不能省。

## 5. 還差什麼

### 需要使用者決定或執行

- **BUG-109A**：在 production 套用 `pwa/db/013_signup_profile_name.sql`，需專案擁有者執行，步驟見 `docs/bug-109-signup-name-truncation.md`。
- **角色 3D 化**：主角與 Companion 仍是 PS-242 的像素 sprite。改成 3D 會推翻已核准素材（主角 12 個姿勢、Companion 6 個狀態），範圍很大，等使用者決定。
- **PRO-014P**：entitlement 流程，實作前需提案與核准，擋 `PRO-014H` cutover。與草稿 PR #154（PRO-014L）改同一段 SUB-16 路徑。
- **PRO-014Q**：變更說明見 §3，等使用者決定。
- **PS-246**：舊 16:9 相機的位置覆寫（`x`／`y`）仍會套用到 V2 家具（`width`／`anchor` 已在 #168 改為不套用）。提案見 `docs/ps-246-v2-placement-overrides.md`，等使用者決定四件事：方案 A、Edit Mode 入口（A1／A2）、是否建立 PS-246B、`migration.unmappedPlacements` 摘要（S1 改規格／S2 實作）。
- **AI-203**：Companion `remind` 的資料來源與頻率。提案見 `docs/ai-203-companion-remind-proposal.md`，等使用者決定。
- **PS-243**：真機、installed PWA、雙帳號、螢幕閱讀器等 human gate。

### 可直接做（低風險）

- `tasks.md` 的 Next 只有需要使用者執行的 BUG-109A。
- 上面需要核准的項目，可以先寫成提案文件交給使用者決定；寫提案不是實作，不違反 AGENTS §3 的「先說明再核准」。但依 AGENTS §15，任務要先在 `tasks.md` 從 Backlog 明確移到 Next，再移到 In Progress（附日期與理由，不可靜默調整順序），才能開始寫。PS-246、AI-203 已移入 In Progress；PRO-014Q 的移動只在分支 `docs/pro-014q-proposal` 上；PRO-014P 仍在 Backlog。高風險項目（如 entitlement）連變更說明都要不要先問使用者再排程，已列為 PRO-014Q 的待決定事項。
- 椅子右扶手與一個腳輪畫在書桌之上（PS-244 起既有，約 10 px，記錄在 `tasks.md` 的 PS-245）。修正要拆分椅子的渲染層，再用 `render_pack.py --only office-chair` 重渲椅子。`tasks.md` 目前沒有對應任務，要做需先建立任務。

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

# Agent 交接紀錄

讓另一個 agent（或另一個帳號）能在沒有對話紀錄的情況下接手。**每完成一個段落、開 PR 時更新本檔**，並與該 PR 一起提交。

任務本身的定義與驗收條件以 [`tasks.md`](../tasks.md) 為準；本檔只記錄進行中的狀態、與使用者約定的工作規則，以及接手需要的操作細節。

> 最後更新：2026-10-18（UTC 02:20 左右）。main = `5644536`（v1.28.2）。

## 1. 接手前先讀

1. `CLAUDE.md`：Supabase RLS 規則、高風險變更需先說明並取得核准、絕不在終端機輸出 secret。
2. `AGENTS.md`：§3 高風險區、§11 範圍控制、§14 每個 PR 跑一次 `npm run bump`（同一個 commit）、§15 任務生命週期（Backlog → Next → In Progress → Done，In Progress 要先單獨提交）。
3. `tasks.md`：Next／In Progress／Backlog。
4. 本檔 §3 的進行中 PR。

## 2. 與使用者約定的工作規則

- 工作循環：依 `tasks.md` 完成一個段落 → 開 PR → 合併 → 下一個。每個段落結束時更新本檔。
- **合併條件**（2026-10-18 使用者核准）：
  - CI 四項（lint、test、e2e、build-check）全綠；
  - Codex review 已完成（開 PR 約 2–3 分鐘後才出現），且沒有未解決的 finding；
  - 有任何 P1／P2 未解，或 finding 要求使用者核准，**停下來問使用者**，不自行判定。
- Codex 的 finding 先對照程式碼驗證。成立就修，在 thread 回覆修正的 commit 並 resolve，再留言 `@codex review` 要求重審，等重審乾淨才合併。不成立就回覆理由，並交給使用者決定。
- 高風險（auth、tokens、`.env`、schema／migration、CI/CD、部署、修改既有設定、Pro entitlement 流程）：先寫變更說明，取得使用者核准才實作。
- 純文件或任務定義的 PR 不 bump 版本；其餘 PR 依 §14 bump。
- 合併 PR 時使用完整 40 字元 SHA 作為 `expectedHeadSha`。
- Commit 結尾加 `Co-Authored-By` 與 `Claude-Session` 兩行；PR 描述結尾加 Claude Code 標記；不要寫入 model 名稱。

## 3. 進行中的 PR

| PR | 分支 | 內容 | 狀態與下一步 |
|---|---|---|---|
| [#167](https://github.com/yoyoCadence/Orbit/pull/167) | `docs/review-followups` | 依 #155–#160 的 Codex review 修正 `docs/personal-space-state-flow.md` 與 `docs/platform-adapters.md`；AI-203 改為 Mode A 提案；新增 `PRO-014P`、`PRO-014Q`；本檔 | PRO-014P 文字已依多輪 review 修正。下一步：等 Codex 重審乾淨且 CI 綠後合併 |
| [#168](https://github.com/yoyoCadence/Orbit/pull/168) | `feat/ps-244-blender-workstation` | PS-244：Blender 渲染的房間與 8 件家具（v1.29.0） | 兩個 P2 已在 `4f5a781` 修正（poster 家具的 CSS 陰影、README 的 venv）。下一步：等 Codex 重審與 CI；合併後若 #167 先合併，需把 main 合進來處理 `tasks.md` 衝突 |

兩個 PR 都改 `tasks.md`（不同段落），後合併的那個可能需要先 merge main。

> **阻塞（2026-10-18 02:20 UTC）**：Codex 回覆「You have reached your Codex usage limits for code reviews」，#167（`d7a283d`）與 #168（`4f5a781`）的重審都顯示 Failed。依 §2 合併條件，這兩個 PR 在 Codex 能重審、或使用者另定規則前不合併。所有已出現的 finding 都已修正並 resolve，CI 在跑。

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

教訓：#155–#164 在 Codex review 出現前就合併，造成 #165、#166 的回頭修正。這就是 §2 合併條件的由來。

## 5. 還差什麼

### 需要使用者決定或執行

- **BUG-109A**：在 production 套用 `pwa/db/013_signup_profile_name.sql`，需專案擁有者執行，步驟見 `docs/bug-109-signup-name-truncation.md`。
- **PS-245（精細化）**：使用者要求「精細模型」。PS-244 只解決一致性。是否立即開始，尚待使用者確認；範圍見 `tasks.md`。
- **角色 3D 化**：主角與 Companion 仍是 PS-242 的像素 sprite。改成 3D 會推翻已核准素材（主角 12 個姿勢、Companion 6 個狀態），範圍很大，等使用者決定。
- **PRO-014P、PRO-014Q**：entitlement 流程，實作前需提案與核准。PRO-014P 擋 `PRO-014H` cutover。
- **PS-246**：舊 16:9 相機的位置覆寫套用到 V2 家具，屬使用者資料語意變更，需先提案。
- **AI-203**：Companion `remind` 的資料來源與頻率，產出規格給使用者核准。
- **PS-243**：真機、installed PWA、雙帳號、螢幕閱讀器等 human gate。

### 可直接做（低風險）

- #167、#168 合併後，依 `tasks.md` 的 Next 繼續。

## 6. PS-244／PS-245 的 Blender 管線操作

詳見 [`art-pipeline/ps244-blender/README.md`](../art-pipeline/ps244-blender/README.md)。重點：

```bash
python3 -m venv /tmp/bpyenv
/tmp/bpyenv/bin/pip install bpy==5.2.2 pillow==12.3.0 numpy==2.5.3   # 需 Python 3.13
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/render_pack.py /tmp/ps244-renders --width 1536 --samples 96
/tmp/bpyenv/bin/python art-pipeline/ps244-blender/process_pack.py /tmp/ps244-renders --write-runtime
npm run ps242:manifest && npm run ps243:assets
```

- 全解析度渲染（房間＋8 件）在 4 核 CPU 上約 30–35 分鐘。只重渲某一件時加 `--only <id>`（例如 `--only room`）。草稿可用 `--width 768 --samples 24`（約 3 分鐘）。
- 渲染原始檔（`room.png`、各家具 PNG）**沒有提交**，只提交處理後的 runtime 素材、`placements.json` 與 `previews/`。在新容器接手必須重新渲染。
- 只能用 Cycles（容器沒有 EGL，EEVEE 不能用）。
- `process_pack.py --write-runtime` 會改寫 `assetManifest.js` 的 `PROP_DEFINITIONS`；`tests/unit/ps244WorkspacePlacements.test.js` 檢查兩者一致。
- 素材位元組變動後要更新 `tests/unit/ps243AssetBudget.test.js` 釘住的數字。
- `previews/phase-*.jpg` 會畫出 HW-105 成就相框（位置與 `pwa/assets/style.css` 的 `.orbit-window-achievement-frame` 同步），用來檢查重疊。

## 7. 本機驗證

```bash
npm run lint
npm test
npm run ps242:manifest -- --check
npm run ps243:assets -- --check
```

本機 e2e：repo 鎖定的 Playwright headless shell 在雲端容器裡不存在。做法是建一個只在本機用的 config，沿用 `playwright.config.js`，並把 `launchOptions.executablePath` 指到 `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`。這個 config 不要提交。

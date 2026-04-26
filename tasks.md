# Orbit Tasks

本文件是 Orbit 的可交接任務清單，供 Codex、Claude Code 與人類開發者共用。

規則：

- 任務狀態固定為 `Backlog / Next / In Progress / Done`
- 任務應可直接執行，不依賴聊天上下文
- 任務粒度保持小而明確
- 任務內容以目前 repo 現況與 `README.md`、`ROADMAP.md` 為準

---

## Backlog

- [ ] **PS-211** 為 personal space 新增常用資產 preload / cache 策略
  - 目標：降低切換頁面或切回 personal space 時重新顯示圖片的等待感
  - 範圍：`pwa/js/personalSpace/`、service worker / asset loading 相關模組、相關測試或文件
  - 完成條件：目前常用場景素材可預載或快取，window view 與主要家具切頁後不再明顯延遲出現
  - 備註：應在主要場景與資產集合較穩定後再做，避免過早優化 placeholder 階段的載入策略

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

- [ ] **PRO-013** 資料匯出 CSV
  - 目標：完成 roadmap 既有 SUB-13
  - 對應 roadmap：v1.16.x

- [ ] **PRO-014** 排行榜 Pro 強化
  - 目標：完成 roadmap 既有 SUB-14
  - 對應 roadmap：銝剜?

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

- [ ] 目前無進行中的正式任務

---

## Done

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

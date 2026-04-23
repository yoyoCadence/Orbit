# Orbit Tasks

本文件是 Orbit 的可交接任務清單，供 Codex、Claude Code 與人類開發者共用。

規則：

- 任務狀態固定為 `Backlog / Next / In Progress / Done`
- 任務應可直接執行，不依賴聊天上下文
- 任務粒度保持小而明確
- 任務內容以目前 repo 現況與 `README.md`、`ROADMAP.md` 為準

---

## Backlog

- [ ] **PS-205** 定義公司大樓與豪宅的樓層圖 / 房間拓樸資料
  - 目標：把公司與豪宅的樓層、房間、相鄰關係資料化，支撐未來地圖視窗與可變格局
  - 範圍：`pwa/js/personalSpace/world/`、相關文件
  - 完成條件：公司與豪宅都有可查閱的 floor-map schema，未來改哪層是什麼房間時不需要重寫 scene runtime

- [ ] **PS-206** 為 personal space 新增地圖視窗入口
  - 目標：提供公司 / 豪宅整層設計圖視窗，讓使用者可查閱空間結構但不取代主要切換方式
  - 範圍：`pwa/js/pages/personalSpace.js`、`pwa/js/personalSpace/ui/`、相關樣式
  - 完成條件：公司與豪宅可透過地圖圖示開啟總圖視窗，顯示樓層與房間配置

- [ ] **PS-207** 將舊辦公樓層與租屋處正式納入 memory property 規則
  - 目標：讓舊辦公樓層可回顧且有其他員工工作的視覺語意，並為未來買回最初租屋處保留正式資料規則
  - 範圍：`unlockRules.js`、`gameState.js`、`world/`、相關文件
  - 完成條件：memory property 不再只是 UI 語意，而有明確資料分類與保存規則

- [ ] **PS-202** 為 personal space 建立 furniture ownership / placement 的本地資料模型
  - 目標：把「已擁有」與「已擺放」拆開，避免之後 UI 和 scene runtime 耦合
  - 對應 roadmap：Phase 2

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

- [ ] 目前無下一個正式任務

---

## In Progress

- [ ] 目前無進行中的正式任務

---

## Done

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

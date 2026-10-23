# Personal Space State Flow（DOC-201）

- 狀態基準：`main`（v1.25.2），2026-10-17 依程式碼逐項核對
- 範圍：`user.totalXP -> level -> unlock -> gold -> ownedItems -> scene` 在 legacy 與 V2 兩個 runtime 中的實際資料流、計算位置、持久化 key 與同步邊界
- 不在範圍：Pixi 渲染、素材 manifest、telemetry（見 [`personal-space-v2-technical-design.md`](personal-space-v2-technical-design.md) 與 [`ps-243-production-acceptance.md`](ps-243-production-acceptance.md)）

本文件只描述「現在程式碼實際做什麼」。規格上的目標行為以 [`personal-space-v2-vertical-slice.md`](personal-space-v2-vertical-slice.md) 為準；兩者不一致之處列在 [§7 已知缺口](#7-已知缺口刻意保留或待決)。

---

## 1. Runtime 選擇

| 項目 | 位置 | 行為 |
|---|---|---|
| Runtime flag | `pwa/js/personalSpace/v2/featureFlag.js` → `getPersonalSpaceRuntime()` | 讀 `localStorage['orbit_personal_space_runtime']`；值不是 `legacy`／`v2` 時回到預設 |
| 預設值 | `pwa/js/personalSpace/v2/config.js` → `DEFAULT_PERSONAL_SPACE_RUNTIME` | `v2` |
| 頁面分派 | `pwa/js/pages/personalSpace.js` → `renderPersonalSpace()` | `isPersonalSpaceV2Enabled()` 為 true 時改呼叫 `renderPersonalSpaceV2()`，否則走 legacy 頁面 |
| 首頁 Orbit Window | `pwa/js/pages/home.js` | 只在 V2 且有登入 `state.user.id` 時掛載 |

兩個 runtime 共用同一個上游（§2），但 Gold、場景與物件的計算方式不同。

---

## 2. 共用上游：XP 與等級

```text
Session 完成（sessionFlow.js _commitSession）
  -> state.user.totalXP += session.finalXP
  -> storage.saveUser()            // 本機 yoyo_user，並同步 profiles.total_xp
Session 刪除／Undo（storage.js / sessionFlow.js）
  -> user.totalXP 扣回該 Session 的 finalXP（不低於 0）
週一致性獎勵（dayCycle.js：過去 7 天有 5 個有效日）
  -> state.user.totalXP += 60
```

| 步驟 | 計算位置 | 說明 |
|---|---|---|
| `totalXP` | `pwa/js/sessionFlow.js`、`pwa/js/storage.js`、`pwa/js/dayCycle.js` | 唯一累積來源；`storage.js` 的 profile mapping 將 `totalXP` 對應 `profiles.total_xp` |
| `level` | `pwa/js/engine.js` → `getLevelInfo(totalXP)` | 由 `xpRequired(level)` 逐級扣除；Lv.1–20 為 `round((50 + 14(level-1)) / 2)`，之後加上 `n^1.3` 曲線。`leveling.js` 只是 re-export |

`level` 從不被儲存，每次都由 `totalXP` 即時推導。

---

## 3. Legacy 路徑

入口：`pwa/js/personalSpace/index.js` → `buildPersonalSpaceViewModel(user)`。

```text
user.totalXP
  -> getLevelInfo()                         level
  -> getCurrentSpaceStage(level)            survival(<10) / building(10–39) / mastery(>=40)
  -> getUnlockedSpaceMilestones(level)      SPACE_UNLOCKS 中 level 已達者
  -> getAvailableSceneOptions(level, {ownedItems})
  -> resolveActiveScene(level, selectedSceneId, {ownedItems, memoryViewSceneId})
  -> getTotalGoldForLevel(level) - spentGold = gold.available
```

| 階段 | 計算位置（`pwa/js/personalSpace/`） | 輸入 | 輸出 |
|---|---|---|---|
| unlock | `unlockRules.js` → `SPACE_UNLOCKS`、`getUnlockedSpaceMilestones()`、`getNextSpaceUnlock()` | `level` | 已解鎖里程碑、下一個解鎖 |
| stage | `unlockRules.js` → `getCurrentSpaceStage()` | `level` | `survival` / `building` / `mastery` |
| gold | `economy.js` → `getTotalGoldForLevel()`、`estimateAvailableGold()` | `level`、`spentGold` | `totalEarned` = Lv.2 起每級 `goldReward(level) + milestoneBonus(level)` 的總和；`available = max(0, totalEarned - spentGold)` |
| ownedItems | `gameState.js` → `loadPersonalSpaceState().ownedItems` | 本機 state | 已擁有物件 id（只讀，見 §7） |
| shop 顯示 | `economy.js` → `buildStarterCatalogView(ownedItems, gold.available)` | `ownedItems`、可用 Gold | 每項的 `isOwned`／`canAfford` |
| scene | `unlockRules.js` → `getAvailableSceneOptions()`、`resolveActiveScene()`、`getPrimaryWorkplaceScene()` | `level`、`selectedSceneId`、`memoryViewSceneId`、`ownedItems` | 可選場景清單、目前場景、主要工作場景 |
| memory scene | `unlockRules.js` → `MEMORY_PROPERTY_RULES`、`getUnlockedMemoryScenes()`；`gameState.js` → `recordMemorySceneVisit()` | `level`、`ownedItems` | 回顧場景與首次造訪時間 |

Legacy 的 Gold 沒有交易紀錄：它是 `level` 的純函數減去 `spentGold`。

### Legacy 寫入點

| 動作 | 位置 | 寫入欄位 |
|---|---|---|
| 切換場景（場景切換器／地圖房間／interaction bus） | `pwa/js/pages/personalSpace.js` | `selectedSceneId`，或回顧場景時的 `memoryViewSceneId` |
| 首次造訪回顧場景 | `gameState.js` → `recordMemorySceneVisit()` | `memorySceneLog[sceneId].firstVisitedAt` |
| Idle window 編輯 | `personalSpace/idleWindow/editorRuntime.js` | `idleWindowLayouts` |
| 購買 | `pages/personalSpace.js` 只派送 `orbit:personal-space-purchase-request` 事件 | **無**（沒有任何 listener，見 §7） |

---

## 4. V2 路徑

入口：`pwa/js/personalSpace/v2/controller.js`。V2 不以 `level` 計算 Gold 或解鎖場景，改由 **Session → reward ledger** 推導。

```text
sessions（state.sessions，含遠端合併結果）
  -> sessionAdapter.adaptSessions()              正規化、去重、排除 invalid / 刪除 / epoch 前
  -> reconciler.reconcileRewardLedger()          依 rewardRules 產生／撤銷 ledger entry
  -> controller.applyReconciliationToV2State()   推導 wallet、hiddenStats、companion、activeProject
  -> store.savePersonalSpaceV2State()            owner-scoped 本機持久化
  -> viewModels.buildPersonalSpaceV2Snapshot()   Home Orbit Window / Full World / Edit 共用
```

### 4.1 觸發時機

| 觸發 | 位置 | 參數 |
|---|---|---|
| App 載入／遠端同步後 | `pwa/js/app.js` → `loadStateFromStorage()` → `refreshCanonicalStateAndReconcilePersonalSpaceV2()` | 遠端完整載入成功時 `authoritative: true` |
| Session 新增、結算、刪除 | `pwa/js/sessionFlow.js` → `reconcilePersonalSpaceAfterSessionChange()` → `reconcileAndSavePersonalSpaceV2()` | 失敗只記 warning，下次 render 再試 |
| Reveal 確認 | `controller.js` → `consumePersonalSpaceV2Reveal()` | 從 `pendingRewardReveals` 移除該筆；帶里程碑的 reveal 同時把 `presentedMilestones` 前進到它的 `to`（AI-202B2） |

V2 失敗被刻意隔離：`refreshCanonicalStateAndReconcilePersonalSpaceV2()` 先更新 tasks／sessions／energy，再 reconcile；reconcile 丟錯不影響核心 UI。

### 4.2 一次性遷移與 opening Gold

| 項目 | 位置 | 規則 |
|---|---|---|
| 遷移 | `v2/migrateState.js` → `migratePersonalSpaceStateV1ToV2()` | 複製 legacy 的 `ownedItems`、`placedItems`、`selectedSceneId`、`memoryViewSceneId`、`selectedThemeId`、`idleWindowLayouts`、`memorySceneLog`、`hiddenStats`、`companionRelationshipStage` |
| Legacy claim | `v2/store.js` → `claimLegacyPersonalSpaceState()` | 同一台裝置的 legacy state 只能被第一個 owner 認領；其他帳號從空白 state 開始，避免跨帳號繼承 |
| opening Gold | `controller.js` → `calculateMigrationOpeningGold()` | 以 `totalXP` 減去 reward epoch（`2026-07-17T00:00:00.000Z`）之後 Session 的 XP 得出 cutover level，再取 legacy `estimateAvailableGold(cutoverLevel, legacySpentGold)` |
| provisional | `controller.js` → `loadControllerState()` | 尚未完成遠端同步前建立的 state 標記為 provisional；第一次 `finalizeMigration` 時重算 opening Gold 並解除標記 |

遷移後 legacy 的 `level → gold` 曲線只用來算一次 opening Gold，之後 V2 Gold 只隨 ledger 變動。

### 4.3 Reward 規則（`v2/rewardRules.js`）

| Session 類型 | 條件（`v2/sessionAdapter.js`） | Ledger entry |
|---|---|---|
| 每日 Main Quest 勝出者 | `isDailyMainQuestCandidate()`：`complete`、`impactType = task`、價值 A／S、時長 ≥ 25 分鐘；每日只取一筆（`questEngine.js`） | Gold 100、depth 3、quest progress 1、Workspace Upgrade project progress 25 |
| 其他有效 Session | `isValidRewardSession()`，且 `mapSessionToHiddenStat()` 有回傳值 | 只給一個 hidden stat，**不給 Gold** |
| 有效但不給獎勵的 Session | `isValidRewardSession()` 為真，但 `mapSessionToHiddenStat()` 回 `null`：非 productive 的 Session，例如娛樂，以及 `impactType`／`taskNature` 為 recovery 且未滿 30 分鐘的 Session | 不產生任何 ledger entry |
| Workspace Upgrade 完成 | `projectEngine.js`：4 個不同日期的 Main Quest 貢獻 = 100% | `world_unlock: formal-workstation`、`relationship: companion +1` |

Session 刪除或 Undo 會為該 source 建立 tombstone 並撤銷其 entry（`rewardLedger.js` → `reverseRewardsForSource()`）；`platform/sessionDeletionLog.js` 保存尚未被遠端確認的刪除，避免同步把已撤銷的 Session 帶回來。

### 4.4 推導欄位（`controller.js` → `applyReconciliationToV2State()`）

| 欄位 | 公式 |
|---|---|
| `economy.earnedGold` | 有效 ledger 中 Gold entry 總和 |
| `economy.balanceGold` | `max(0, openingGold + earnedGold - spentGold)` |
| `hiddenStats[key]` | 遷移基準值 + 有效 ledger 的 hidden stat 總和 |
| `companion.relationshipPoints` | `max(legacyRelationshipPoints, 有效 ledger 的 relationship 總和 ＋ 推導的 milestone)`；推導的 milestone：不同的 Main Quest 日（`quest_progress` 的 `main-focus:<date>` key）達 12 天 +1、達 30 天再 +1，不寫入 ledger（AI-202，policy `ai202-main-quest-days-v1`）。舊公式（AI-202B1 之前）：`已儲存的點數 − 舊 ledger 的 relationship ＋ 新 ledger 的 relationship` |
| `companion.legacyRelationshipPoints` | 欄位不存在時寫入一次：`max(0, 已儲存的點數 − reconcile 之前 ledger 的 relationship)`；之後只讀，無效值視為 0 |
| `companion.relationshipPolicyId` | 每次 reconcile 寫入目前的 policy id（`ai202-main-quest-days-v1`） |
| `companion.relationshipStage` | relationship points 對應 `stranger-observer → familiar → partner → trusted-companion`（0–3） |
| `presentedMilestones` | 使用者**最後看到**的里程碑 `{ projectCompleted, relationshipStage, pending }`（AI-202B2）。欄位不存在時以目前規則從 reconcile 之前的 ledger 計算，扣掉仍有效、尚未播放的舊格式 reveal 所代表的完成與 relationship entry；`pending` 記錄帶里程碑的 reveal 與它的 `to`，該 reveal 已不在佇列（舊版分頁播放了它）時先把基準設為 `to` |
| `pendingRewardReveals[].milestone` | 淨變化（目前狀態 − `presentedMilestones`）：`{ project: 'completed' \| 'uncompleted' \| null, stage: { from, to } \| null }`，整個佇列最多一個 reveal 帶它。記錄或撤銷 Session（`queueReveal: true`）時，依序放在錨點 Session（完成與 `familiar` 是第 4 個、`partner`／`trusted-companion` 是第 12／30 個 Main Quest 日）的 reveal、**已帶著同方向里程碑且仍在佇列中的 reveal**（之後記錄的 Session，即使沒有 ledger 變化，或重複套用同一次 reconcile，都不會搬走它或讓它未播放就併入基準）、本次 `main-focus` 與淨變化同方向變化的 reveal（提升放在新增 Main Quest 日的 reveal，退回放在撤銷的 reveal）、最新一個不是只含撤銷的 reveal；完成與階段提升不放在只含撤銷的 reveal。第一次以新規則計算而不是記錄 Session 時（開啟、同步），只放回舊格式 reveal 尚未呈現的部分（以 reconcile 之前的 ledger 計算），再像同步一樣縮小。其他 reconcile 只縮小或移除已排入的里程碑，移除的部分併入基準；舊版分頁排入的 reveal 只在它就是錨點時接收里程碑 |
| `pendingRewardReveals[]` 的 `lines`／`kind`／`title`／`projectCompleted`／`relationshipStage`／`worldChange` | 由 reward 與里程碑重新計算：`world_unlock`／`relationship` entry 不再直接成為行，解鎖行與「夥伴關係：<階段>」只來自里程碑；`major` 只來自完成或階段提升；只有階段提升（沒有完成）時 `title` 是「夥伴關係：<階段>」；沒有任何行的 reveal 不排入。`projectCompleted`／`relationshipStage` 供 `companionEngine` 判斷恭喜或 `observe` |
| `activeProject` | `projectEngine.deriveActiveProject()`；phase 依 progress 0／25／50／75／100 對應 `viewModels.js` 的 `PROJECT_PHASES` |
| `worldRevision` | 任何 ledger 或語意變動時 +1；`savePersonalSpaceV2State()` 可用 `expectedRevision` 擋下過期寫入 |

### 4.5 V2 寫入點

| 動作 | 位置 | 寫入欄位 |
|---|---|---|
| Reconcile（§4.1） | `controller.js` → `reconcileAndSavePersonalSpaceV2()` | `economy`、`hiddenStats`、`companion`、`activeProject`、`rewardLedger`、`rewardTombstones`、`pendingRewardReveals`、`presentedMilestones`、`worldRevision` |
| Edit Mode：工作站佈置 | `pages/personalSpaceV2.js` | **無**。PS-246 起 Edit Mode 只顯示「位置由固定視角的場景決定」的說明，不列出、不調整、也不清除 legacy 擺放；V2 也不套用 `world.placedItems`、`world.idleWindowLayouts` 中的座標 |
| Edit Mode：風格與角色（PS-250B） | `ui/appearancePicker.js` → `saveAppearanceChange()` | `world.appearance`（`{ style, protagonistId, companionId }`；使用者選擇前是 `null`，以預設顯示）。疊在已存的 state 上寫入；還沒有 V2 state 時不寫入（避免跳過遷移）。不改變 `worldRevision`、ledger 與任何獎勵 |
| Edit Mode：房間風格（PS-250E2） | `ui/appearancePicker.js` → `saveAppearanceChange()` | `world.selectedThemeId`（既有欄位，以前只存不讀；`default`、`nordic`…，不認得的值包括 legacy 的 `night` 都畫預設房間）。只改這個欄位，沒選過的 `world.appearance` 維持 `null`。與風格與角色相同：不寫入沒有遷移過的 state，不改變 `worldRevision`、ledger 與任何獎勵 |
| Edit Mode：裝飾開關（PS-250F） | `ui/appearancePicker.js` → `saveAppearanceChange()` | `world.hiddenDecorations`（關掉的裝飾 id；預設 `[]`＝全部顯示，之後新增的裝飾也會出現）。疊在最新已存的 state 上加入或移除一個 id，不認得的 id（較新版本的裝飾）保留。與風格與角色相同：不寫入沒有遷移過的 state，不改變 `worldRevision`、ledger、經濟與任何獎勵 |
| Reveal 確認 | `controller.js` → `consumePersonalSpaceV2Reveal()` | `pendingRewardReveals`；帶里程碑時還有 `presentedMilestones` |
| 購買、新增物件、切換場景 | — | **無**（見 §7） |

### 4.6 Scene 與 level 在 V2 的角色

- 場景 id：`viewModels.js` → `buildPersonalSpaceV2Snapshot()` 取 `world.memoryViewSceneId || world.selectedSceneId || 'rough-room'`，也就是遷移帶過來的 legacy 選擇；V2 沒有依 `level` 解鎖場景的程式碼。
- 視覺階段：`sceneStage` = `activeProject.currentPhase`，由 Workspace Upgrade 進度決定，而不是 `level`。
- 遷移完成後，`level` 在 V2 只出現在 `snapshot.player.level` 供顯示。例外是遷移與 provisional finalize 期間：`controller.calculateMigrationOpeningGold()` 以 cutover 時的 `totalXP` 算出 level，再交給 `estimateAvailableGold()` 決定 V2 開場 Gold（`openingGold`）。
- `unlockRules.js` 在 V2 只被 `v2/telemetry.js` 用來取 `SCENE_IDS` 作為 telemetry 的封閉 scene 清單。

---

## 5. 持久化 key 一覽

`platform/storageBridge.js` 的 `readJSON()`／`writeJSON()` 會在 key 前加上 `orbit_platform_bridge_v1:`。

| 實際 localStorage key | 寫入者 | 內容 | Owner-scoped |
|---|---|---|---|
| `yoyo_user` | `storage.js` | 使用者 profile，含 `totalXP` | 依登入帳號覆寫 |
| `orbit_personal_space_runtime` | `v2/featureFlag.js` | `legacy`／`v2` runtime 選擇 | 否（裝置） |
| `orbit_platform_bridge_v1:personal-space-state` | `gameState.js` | Legacy state（version 1） | **否**（裝置共用） |
| `orbit_platform_bridge_v1:personal-space-state-v2:<encodeURIComponent(ownerId)>` | `v2/store.js` | V2 state（version 2） | 是 |
| `orbit_platform_bridge_v1:personal-space-state-v2:legacy-claim` | `v2/store.js` | 第一個認領 legacy state 的 owner | 否（裝置） |
| `orbit_platform_bridge_v1:session-deletion-log-v1:<encodeURIComponent(ownerId)>` | `platform/sessionDeletionLog.js` | 尚未被遠端確認的 Session 刪除；reconcile 視為已刪除 source | 是 |

---

## 6. 同步邊界

| 資料 | 是否同步 Supabase | 跨裝置一致性來源 |
|---|---|---|
| `totalXP`、Sessions | 是（profile／sessions 表） | 遠端資料 |
| `level`、legacy Gold | 不儲存 | 由 `totalXP` 即時推導 |
| V2 reward ledger、hiddenStats、companion、activeProject | 否（本機 owner-scoped） | 由已同步的 Sessions 重新 reconcile，因此在相同 Session 集合下結果一致 |
| V2 wallet | 否 | 該裝置的 `openingGold` ＋ ledger 的 Gold − `spentGold`（V2 目前不寫入 `spentGold`），因此可能因 `openingGold` 而不同 |
| V2 `openingGold` | 否 | 每台裝置在自己 finalize 遷移時各算一次：`totalXP` 扣掉 reward epoch 之後的 Session XP，換成 level 後扣掉**該裝置**的 legacy 已花費 Gold。finalize 後不再重算。兩台裝置的值**不保證相同**：finalize 時間之間若有不經 Session 的 XP（例如 `dayCycle.js` 的每週獎勵 +60），或兩台的 legacy 花費不同，結果就會不同 |
| `ownedItems`、`placedItems`、`selectedSceneId`、layout、memory log | 否 | **只存在該裝置**；換裝置或清除本機資料即遺失 |
| `world.appearance`（PS-250B 的風格與角色） | 否 | **只存在該裝置**；其他裝置顯示預設（全 Q 版的上班族與 Orbit） |
| `world.selectedThemeId`（PS-250E2 的房間風格） | 否 | **只存在該裝置**；其他裝置顯示預設的藍色工作室。舊版的 `stateSchema.js` 也保留這個欄位，所以新舊版本混用時不會遺失 |
| `world.hiddenDecorations`（PS-250F 關掉的裝飾） | 否 | **只存在該裝置**；其他裝置顯示全部裝飾。舊版的 `stateSchema.js` 保留 `world` 中不認得的欄位，所以新舊版本混用時不會遺失 |

因此 Project、Companion 與 ledger 內的 Gold 跨裝置一致，來自確定性的重新計算，而不是同步 V2 state 本身；開場 Gold 是例外，見上表。

---

## 7. 已知缺口（刻意保留或待決）

| 缺口 | 證據 | 狀態 |
|---|---|---|
| `gold -> ownedItems` 尚未接通：兩個 runtime 都沒有寫入 `spentGold` 或 `ownedItems` 的程式碼 | `pages/personalSpace.js` 只派送 `orbit:personal-space-purchase-request`，repo 中沒有 listener；V2 `economy.spentGold` 只被讀取與正規化 | 刻意保留：[`personal-space-v2-vertical-slice.md`](personal-space-v2-vertical-slice.md) 規定 shop 需先有 idempotent settlement 與 reversal contract 才能加入 V2 purchase |
| V2 不依 `level` 解鎖場景 | §4.6 | 符合 V2 slice 的固定場景設計；若要恢復 level gate 需另立任務 |
| Companion `remind` 無法觸發 | `viewModels.js` 讀取 `coreState.missedPatterns`，但沒有任何寫入點 | 已立 `AI-203` |
| 場景、擺放與物件不跨裝置 | §6 | 現行行為；跨裝置同步需 schema 變更，屬高風險 |
| 新舊版本混用時，風格與角色的選擇可能遺失 | v1.33.0 之前的 `stateSchema.js` 以固定欄位重建 `world`，會丟掉 `world.appearance`：仍開著舊版分頁時，它的 reconcile 存檔會清掉選擇；改版後約 10 分鐘內若讀到舊的 `stateSchema.js`（INFRA-105），選擇也存不住 | 舊程式無法修正；重新選擇即可。INFRA-105 核准後可縮短後者 |

---

## 8. 在 DevTools 對照

```js
// 等級與 legacy Gold
const u = JSON.parse(localStorage.getItem('yoyo_user'));
u.totalXP;

// Legacy state
JSON.parse(localStorage.getItem('orbit_platform_bridge_v1:personal-space-state'));

// V2 state（目前登入帳號）
JSON.parse(localStorage.getItem(
  `orbit_platform_bridge_v1:personal-space-state-v2:${encodeURIComponent(u.id)}`,
));

// 重置 Personal Space 本機狀態（legacy + 目前帳號的 V2 + claim）
localStorage.removeItem('orbit_platform_bridge_v1:personal-space-state');
localStorage.removeItem(`orbit_platform_bridge_v1:personal-space-state-v2:${encodeURIComponent(u.id)}`);
localStorage.removeItem('orbit_platform_bridge_v1:personal-space-state-v2:legacy-claim');
location.reload();
```

重置 V2 state 後，下一次載入會重新遷移並依目前的 `totalXP` 與 Session 計算 opening Gold（尚未完成遠端同步時先標記 provisional，完整同步後 finalize），再由 Session 重建 ledger。

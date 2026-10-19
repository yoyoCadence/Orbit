# PS-246 提案：V2 家具不套用舊相機的位置覆寫

> 狀態：**已核准並實作**。使用者 2026-10-18 核准方案 A、A1、不建立 PS-246B、S1，由 #176 實作（v1.30.1）。以下保留提案原文作為設計紀錄。

## 1. 結論

- 建議核准**方案 A**：V2 不再套用 legacy 位置覆寫，家具一律使用 Blender 校準的位置。legacy 資料原封保留。
- 這不是新的資料語意，而是讓實作回到既有規格。目前的行為違反：
  - `docs/personal-space-v2-technical-design.md` §7.2（Migration Contract，最直接的一條）：
    - 只有確定、列入允許清單的 placement ID 才映射到 V2；
    - 相機選擇與透視款式不複製到固定相機的 V2；
    - 無法映射的項目保留在 legacy state，並摘要在 `migration.unmappedPlacements`；V2 使用安全的預設位置。
  - 同文件 §3.2：只有在 item ID 與 placement plane 的對應是確定的時候才能映射。
  - `docs/personal-space-v2-product-spec.md` §9：不相容的擺放要用明確的 fallback，不能靜默損壞。
- 方案 A 滿足「使用安全的預設位置」與「不複製相機選擇」，但**不包含** `migration.unmappedPlacements` 摘要（目前也沒有任何程式碼實作）。是補做摘要，還是修改規格文字，交給使用者決定（§7 第 4 點）。
- 「新建覆寫」（Edit Mode 真正的擺放功能）不在本提案。建議先不做，理由見 §6。

## 2. 問題

### 程式碼路徑

1. `pwa/js/personalSpace/v2/viewModels.js` 的 `resolvePlacements()`：
   - 取 `world.idleWindowLayouts` 中第一個有 `placements` 物件的 layout；
   - 再疊上 `world.placedItems`；
   - 結果成為 `model.placements`。
2. `pwa/js/personalSpace/v2/content/assetManifest.js` 的 `getWorkspaceSceneAssets()`：把覆寫的 `x`／`y` 蓋在 Blender placement 上（`normalizePositionOverride()`）。PS-244 起不再套用 `width`／`anchor`／`z`。
3. `pwa/js/pages/personalSpaceV2.js` 的 `listPersonalSpaceV2EditablePlacements()`：Edit Mode 只列出這些 legacy 項目，調整後寫回 `world.idleWindowLayouts`。

### 為什麼座標是錯的

legacy 與 V2 的座標系不同，同一個百分比在兩邊指向不同的位置：

- legacy：layout `building-office-prototype`，畫面 1672×941，left／center／right 三個相機。
- V2：Blender 相機 `building-workspace-v2`，畫面 1536×1024，透視也不同。

legacy idle window 的 `readPlacementFromElement()` 每次儲存都會寫入 `x`／`y`。會觸發儲存的不只是拖曳：

- 在編輯模式中旋轉、隱藏或換款；
- **不在編輯模式也會**：左右滑動或按鈕切換相機角度時，`switchCameraProfile()` → `applyPreferredCameraVariants()` 會把有各相機專屬款式的家具（例如 `corner-desk`）連同預設的 `x`／`y` 一起存下；
- 「全部顯示」「全部隱藏」（`setAllItemsHidden()`）會把每件家具都存一次。

因此只要在 legacy 中**切換過相機角度**或用過上述任一功能，V2 的同 ID 家具就會被移到 legacy 座標。

以 legacy 預設位置為例（沒有移動過、只觸發了儲存時，存下的就是這個值）。只切換相機時，只有 `corner-desk` 這類有各相機款式的家具會被存下；其他家具要經過全部顯示／隱藏、旋轉、隱藏或換款才會被存下：

| 家具 | legacy x／y | V2 x／y（PS-245） | V2 中的位移 |
|---|---|---|---|
| `corner-desk` | 42／83 | 38.97／66.31 | 往右 3.0、往下 16.7 |
| `office-chair` | 38／84 | 39.71／69.43 | 往左 1.7、往下 14.6 |
| `office-shelf` | 72／78 | 69.47／54.40 | 往右 2.5、往下 23.6 |
| `office-plant` | 82／84 | 72.14／64.75 | 往右 9.9、往下 19.3 |
| `planning-board` | 39／43¹ | 39.19／39.06 | 往左 0.2、往下 3.9 |

¹ legacy 的 `planning-board` 以中心為錨點，43 是中心高度。V2 不套用 `anchor`，所以 43 會被當成底邊，實際往下 3.9。

說明：

- 單位是畫面的百分比。在 1024 px 高的畫面上，往下 15–24 等於 150–240 px：書桌、椅子與書櫃會掉到前景地板，與主角（y 87）重疊。
- `single-monitor`、`desk-lamp` 在 legacy 放在桌面 surface 上，存下的 `x`／`y` 是換算後的絕對座標，同樣會位移。
- `dual-monitor` 在 legacy 沒有同 ID 項目，不受影響。

## 3. 影響範圍

- **誰會受影響**：在 V2 遷移**之前**用過 legacy idle window 的裝置，包括只切換過相機角度、沒進編輯模式的情況（§2）。
  - 遷移只做一次（`v2/migrateState.js` 複製 `idleWindowLayouts`），之後 legacy 的編輯不會進入 V2。
  - runtime 預設是 V2。`setPersonalSpaceRuntime()` 在 UI 沒有呼叫者，要手動改 localStorage flag 才能回到 legacy 編輯器。
- **資料位置**：只在本機，不同步 Supabase（`docs/personal-space-state-flow.md` §6）。不需要 DB migration，也不涉及 RLS。
- **`placedItems`**：legacy 沒有任何寫入點（只有 normalize），實際上應為空。方案 A 一併不套用。
- **人數**：本機 telemetry（`emitPersonalSpaceTelemetry`）沒有記錄覆寫，無法得知。專案擁有者可以在自己的裝置用 DevTools 檢查（只讀）：

  ```js
  const u = JSON.parse(localStorage.getItem('yoyo_user'));
  const v2 = JSON.parse(localStorage.getItem(
    `orbit_platform_bridge_v1:personal-space-state-v2:${encodeURIComponent(u.id)}`,
  ));
  Object.entries(v2?.world?.idleWindowLayouts || {})
    .map(([id, layout]) => [id, Object.keys(layout?.placements || {})]);
  // 空陣列，或每個 layout 都沒有 key ＝ 這台裝置不受影響
  ```

## 4. 方案比較

| 方案 | 做法 | 評估 |
|---|---|---|
| **A（建議）** | V2 不套用 legacy 覆寫；legacy 資料保留不動 | 符合 technical design §3.2、§7.2 的預設位置規則與 product spec §9 的 fallback 規則（`unmappedPlacements` 摘要見 §7 第 4 點）；改動小、可逆 |
| B 座標換算 | 把 legacy 座標換算成 V2 座標，或只套用相對 legacy 預設的位移量 | 拒絕。兩個相機的透視不同，沒有確定的映射，所以 §3.2 的前提不成立。旋轉、換款、隱藏在 V2 也沒有對應 |
| C 刪除 | 遷移時刪掉 legacy 覆寫 | 拒絕。違反「不刪使用者資料」；legacy runtime 仍存在，也仍會讀這些資料 |
| D 維持現狀 | — | 拒絕。這就是規格禁止的靜默損壞 |
| E 依相機標記覆寫（`tasks.md` 原本的方向） | 覆寫記錄所屬的 `canonicalCameraId`，V2 只套用同相機的覆寫 | 併入 A。現有覆寫全部屬於 legacy 相機，標記後的結果就是「全部不套用」，與 A 相同。標記只有在 V2 自己會建立覆寫時才有意義，留給 PS-246B |

## 5. 方案 A 的變更（核准後實作）

1. **不套用**：`resolvePlacements()` 不再讀 `world.idleWindowLayouts` 與 `world.placedItems`，V2 的覆寫來源改為空。`getWorkspaceSceneAssets()` 的介面不變。
2. **保留資料**：
   - `world.idleWindowLayouts`、`world.placedItems` 照常 normalize 與儲存，內容不變。
   - legacy 的 `personal-space-state` 不動。
3. **Edit Mode**：
   - `listPersonalSpaceV2EditablePlacements()` 不再列出 legacy 項目。
   - 空狀態文字改為說明：工作站家具的位置由固定視角的場景決定，目前不能移動；舊版編輯器的擺放仍保留在舊版場景。
   - 面板的引導文字「僅能在場景安全區內微調既有物件；編輯模式不會產生任何獎勵。」（`personalSpaceV2.js` 的 Edit Mode 區塊）會與新說明矛盾，一併改寫。
   - 隱藏「重設全部調整」：V2 中沒有可重設的覆寫，而它目前會清掉 V2 保存的 legacy 副本。
   - view model 的 `layoutOverrides` 與 `editor.*` 仍會帶著 legacy 資料，但沒有任何消費者（小卡與 Pixi runtime 只讀 `placements`），不需改動。
4. **主角與 Companion**：`getWorkspaceSceneAssets()` 也會讀 `placementOverrides.protagonist`／`.companion`。legacy 不會寫入這兩個 key，所以目前沒有影響；方案 A 之後覆寫來源為空，也不會有影響。
5. **測試**：
   - 有 legacy 覆寫（含 `x`／`y`）的 V2 state，每件家具的 placement 等於 `PROP_DEFINITIONS`。
   - 載入、儲存之後，`world.idleWindowLayouts` 與 `world.placedItems` 內容不變。
   - Edit Mode 不列出 legacy 項目，也沒有能清除它們的操作。
   - 會失敗、需要更新的是 `tests/unit/personalSpaceV2Page.test.js`：列出與調整既有覆寫的案例（約 87–115 行），以及完整頁面的微調按鈕案例（約 233–240 行）。
   - `personalSpaceV2ViewModel.test.js`、`ps244WorkspacePlacements.test.js`、`personalSpaceOrbitWindow.test.js` 的覆寫案例直接呼叫 `getWorkspaceSceneAssets()` 或比對 `{}`，預期不受影響。
6. **版本**：修正行為，`npm run bump`（patch）。

**風險**：在 V2 Edit Mode 中「手動把位置調回來」的使用者，會失去那些調整。這類調整與 legacy 原始項目存在同一個欄位，無法區分。實際損失有限：

- 那些調整是在補償錯誤的座標，方案 A 後家具會回到正確位置；
- PS-244 已整套重新渲染並更換 placement，PS-244 之前做的 V2 調整本來就對不上新素材。

## 6. 為什麼建議暫不做「新建覆寫」

PS-246 原始描述提到，「V2 Edit Mode 目前只能調整既有覆寫，也需一併決定新建覆寫的流程」。對預先渲染的固定視角場景，任意 2D 平移在結構上就不成立：

- **透視**：每件家具是在特定 3D 位置渲染的。左右平移後，它的透視線與房間不一致，看起來會歪。
- **陰影**：陰影和家具一起烘在 PNG 裡。移到別處後，陰影的方向與接地點都不對。
- **依附關係**：螢幕（鍵盤與滑鼠畫在螢幕的 PNG 裡）與檯燈都放在桌面上。V2 中每件是獨立 prop，沒有 support surface；只移書桌，螢幕與檯燈會浮在空中。
- **繪製順序**：z 是固定的。例如椅子 z 30 永遠畫在書桌前方，就算把它移到桌子後面也一樣。

product spec §7 本來就寫明「大型家具使用 canonical perspective 與受限的槽位，小物件才有較多自由」。可行的路線是**預先渲染的槽位**：Blender 為每個允許的位置各渲染一次，Edit Mode 在槽位之間切換。這屬於美術與產品範圍，需要另外寫規格（例如 PS-246B），並先決定要哪一種自訂：

- 槽位：家具換位置；
- 換款：同一位置換造型；
- 小物：在 support surface 上擺放。

## 7. 需要使用者決定

1. **是否核准方案 A**（建議：核准）。
2. **Edit Mode 入口**：
   - A1（建議）：保留「編輯」入口，面板顯示 §5.3 的說明。沒有 legacy 覆寫的使用者今天看到的本來就是空面板；A1 只改變說明文字並移除「重設全部調整」，功能上沒有損失。
   - A2：隱藏「編輯」入口，直到有真正的擺放功能。入口有兩個：頁首的模式切換，以及底部 dock 的「編輯」按鈕。
3. **PS-246B（新建覆寫或槽位）**：
   - 建議：暫不建立任務；
   - 若想要自訂功能，先決定 §6 的三種中要哪一種，再寫規格。
4. **technical design §7.2 的 `migration.unmappedPlacements` 摘要**：
   - S1（建議）：修改規格文字。原始資料完整保留在 legacy 的 `personal-space-state`，隨時可以從那裡推導；V2 的 `world.idleWindowLayouts` 副本則可能已被 V2 Edit Mode 的微調或「重設全部調整」改過。摘要目前沒有任何讀取者。
   - S2：方案 A 一併實作摘要。遷移時寫入；已遷移的 state 在 normalize 時補上。這是本機 V2 state 的新增欄位，不涉及 Supabase。

## 8. 驗收條件草稿（核准後寫入 tasks.md）

- V2 state 中有 legacy 覆寫時，8 件家具的 placement 與 `PROP_DEFINITIONS` 完全相同，在 Orbit Window 小卡與完整頁面都一樣。
- `world.idleWindowLayouts`、`world.placedItems` 與 legacy 的 `personal-space-state` 在載入、儲存、Edit Mode 進出之後內容不變。
- Edit Mode 不列出、不調整、也不清除 legacy 項目；空狀態顯示說明文字。
- 把 runtime 切回 legacy 時，legacy 場景仍顯示原本的擺放。
- `npm run lint`、`npm test`、e2e 全數通過。

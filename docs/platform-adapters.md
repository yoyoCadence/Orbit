# Platform Adapters：PWA 與 Future Hybrid Shell 行為差異（PLAT-201）

- 狀態基準：`main`（v1.25.2），2026-10-17 依程式碼核對
- 範圍：`pwa/js/platform/` 的每個模組，以及仍散落在 `platform/` 之外、未來包成 hybrid／native shell 時必須替換的平台能力
- 性質：純文件。本文件**不**選定 hybrid 技術（WebView wrapper、Capacitor 或其他），也不修改任何 adapter；「Hybrid 替換點」欄只描述介面上需要換掉的部分

> 假設：未來 shell 以 WebView 載入同一份 `pwa/`，並透過 native bridge 提供裝置能力。若改走完全 native 重寫，本表仍可作為「哪些行為必須保留」的清單。

---

## 1. Adapter 行為差異表

「呼叫端」只列 `pwa/js/` 內實際 import 該模組的檔案。

### 1.1 裝置能力 adapter

| Adapter | 職責 | 呼叫端 | PWA 現況 | 不支援時 | Hybrid 替換點 | 邊界／風險 |
|---|---|---|---|---|---|---|
| `storageBridge.js` | 具 namespace 的 JSON KV（`orbit_platform_bridge_v1:` 前綴） | `personalSpace/gameState.js`、`personalSpace/v2/store.js`、`platform/sessionDeletionLog.js` | `localStorage`；`getStorageBridgeInfo()` 回報 `platform: 'web'` | 讀取失敗回 fallback、寫入失敗回 `false`，由呼叫端決定 fail closed | 換成 native KV／檔案儲存；`getStorageBridgeInfo()` 回報新平台 | **介面是同步的**，多數 native bridge 是 async。替換前需決定：啟動時預載到記憶體，或把呼叫端改成 async。`storage.js` 本身直接用 `localStorage`，不經過此 bridge（見 §2） |
| `haptics.js` | 以事件名稱觸發震動（`HAPTIC_PATTERNS`） | `focusTimer.js`、`sessionFlow.js`、`pages/personalSpace.js` | `navigator.vibrate(pattern)` | `supportsHaptics()` 為 false 時回 `false`，不丟錯 | 以 `haptic(eventName)` 為 seam，對應 native impact／notification 回饋；數字 pattern 只屬於 web | iOS WebView／Safari 沒有 `navigator.vibrate`，目前在 iOS 上全部 no-op；`pages/home.js` 拖曳排序直接呼叫 `navigator.vibrate(50)`，繞過此 adapter |
| `badge.js` | App icon badge；本機提醒殼 | `app.js`（延遲 import，`_updateBadge()`、登出時 `clearBadge()`） | `navigator.setAppBadge()`／`clearAppBadge()` | 靜默 no-op；權限被拒時吞掉錯誤 | native badge API；`scheduleLocalReminder()` 換成 native 排程通知 | 支援度依瀏覽器與是否安裝而定，本任務未做實機驗證。`scheduleLocalReminder()` 只是 `setTimeout`，頁面關閉即失效，且目前沒有呼叫端 |
| `notifications.js` | 本機通知權限與發送 | 無 | `Notification` API | 回 `'unsupported'`／`{ delivered: false }` | native local notification；push 需另有 server 與 token 流程 | 目前未被使用。push token 屬 AGENTS.md §3 的 tokens 範圍，加入前需提案 |
| `share.js` | 分享成長卡 | `pages/profile.js` | `navigator.share()`，不支援時 `navigator.clipboard.writeText()` | 回 `{ shared: false, reason }`，由頁面顯示 toast | native share sheet；clipboard fallback 可保留 | 只分享文字；分享內容由 `buildGrowthShareText()` 產生，與平台無關 |
| `proofCapture.js` | 佐證照片壓縮 | `ui/proofSheet.js`（動態 import） | `FileReader` + `<canvas>` 壓到 ≤320px JPEG | `sessionFlow.js` 的 `offerProofSheet()` 以 inline 檢查 `FileReader` 決定是否顯示 sheet；動態 import 失敗時 sheet 靜默略過 | 相機改由 native camera 取得檔案，再交給同一個 `compressImage()` | `supportsProofCapture()` 目前沒有呼叫端（`sessionFlow.js` 為了不在啟動時載入此模組而複製了同一個檢查），替換時兩處要一起改。相機入口本身也不在此 adapter：`ui/proofSheet.js` 用 `<input type="file" accept="image/*" capture="environment">`（見 §2） |
| `proofStore.js` | 佐證照片與展示照片選擇的本機儲存 | `ui/proofSheet.js`、`ui/sessionRow.js`、`pages/settings.js`、`pages/home.js`、`pages/personalSpaceV2.js` | `localStorage` 的 `orbit_proof_<sessionId>`、`orbit_achievement_photo_<ownerId>`，直接存 data URL | 未選擇時回 `empty`；Session 不存在或圖片讀不到、格式不符時回 `unavailable`，相框顯示 placeholder。**storage 本身失敗不降級**：沒有 try/catch，錯誤會同步丟給呼叫端。`localStorage` 被封鎖時，讀寫都會丟錯（`getProof()`、`getAchievementPhotoSelection()`、`resolveAchievementPhoto()`、`proofStats()`、`saveProof()`、`set`／`clearAchievementPhotoSelection()`、`clearAllProofs()`）；配額已滿只影響寫入。只有 `ui/sessionRow.js` 會捕捉 `set`／`clearAchievementPhotoSelection()` 的錯誤，`pages/home.js` 與 `pages/personalSpaceV2.js` 的 `resolveAchievementPhoto()` 渲染路徑不會 | 改存 native 檔案系統，只在 KV 留路徑 | 刻意 device-local 且登出不清除（`storage.clearAll()` 不碰），只有設定頁的「清除佐證」會清；data URL 佔用 `localStorage` 配額。雲端同步是另一個高風險任務 `HW-112` |
| `network.js` | 連線狀態（HW-110） | `app.js`（離線提示、連線恢復時推送待同步變更） | `navigator.onLine` 與 window `online`／`offline` 事件 | 無 `navigator.onLine` 時視為在線；`true` 只代表有網路，同步失敗仍當作待同步 | native reachability API | 只決定何時重試與顯示提示；待同步資料本身仍在 `storage.js` 的 owner-scoped sidecar |
| `ambientNoise.js` | 環境噪音等級（HW-106） | `focusTimer.js`（使用者點擊後才開啟） | `getUserMedia` 音訊＋`AnalyserNode` 計算 RMS，分類 quiet／normal／noisy | 不支援時不顯示控制項；權限被拒顯示「無法使用麥克風」 | native audio session／麥克風權限 API | **隱私邊界**：只讀即時音量，不錄音、不保存、不上傳；離開 focus 畫面或 App 進入背景即停止所有 track |
| `placeContext.js` | 位置情境（HW-107） | `pages/settings.js`（設定位置）、`ui/placeHint.js`（首頁提示） | `navigator.geolocation` 低精度單次定位，座標四捨五入到 3 位小數（約 110 公尺） | 不支援時設定頁只顯示說明；定位被拒或逾時則不顯示提示 | native location API（粗略精度權限） | **隱私邊界**：opt-in；只在本機以 storageBridge 依 owner 保存使用者指定的粗略位置，不上傳、不同步；即時位置只用來比對、不保存 |
| `purchases.js` | 購買介面保留位 | 無 | `enabled: false`，`beginPurchase()` 回 `not-implemented` | 永遠回未啟用 | StoreKit／Play Billing 等 native IAP | **高風險**：付款與 Pro 授權。依 `PRO-014F`，任何有價值的 Pro 能力必須由 server 驗證 `is_pro_active`；IAP 收據也必須由 server 驗證後才發 entitlement，不能讓 client 寫入 |

### 1.2 平台無關的邏輯模組（放在 `platform/`，但不碰裝置 API）

| 模組 | 職責 | 呼叫端 | Hybrid 影響 |
|---|---|---|---|
| `proEntitlement.js` | 以 `my_pro_status()` RPC 回應建立 owner-scoped UI entitlement projection（`legacy`／`server` source） | `storage.js` | 邏輯不變；snapshot 目前透過 `localStorage` 直接存取，若改用 async storage 需和 `storageBridge` 一起處理。屬 entitlement 高風險區 |
| `sessionDeletionLog.js` | 記錄尚未被遠端確認的 Session 刪除，避免同步帶回 | `storage.js`、`sessionFlow.js`、`personalSpace/v2/controller.js` | 跟隨 `storageBridge` 的替換 |
| `authOperationGuard.js` | 以遞增 token 讓登出或切換帳號後的 async 結果作廢 | `app.js` | 不變；但 native app 的 resume／deep link 可能成為新的 auth 進入點，需沿用同一個 guard |
| `bootSequenceGuard.js` | 每次啟動只跑一次換日流程（BUG-106） | `app.js` | 不變；native 的 background → foreground 不等於重新啟動，若要在 resume 時跑換日需另外設計，不能重用「每次 launch 一次」的語意 |

---

## 2. 尚未收斂到 `platform/` 的平台能力

這些呼叫目前直接寫在功能模組裡。包成 hybrid 前，應先各自收斂成 adapter，否則替換會變成全 repo 搜尋。

| 能力 | 位置 | 目前做法 | 包成 hybrid 時的問題 |
|---|---|---|---|
| 裝置方向感測 | `focusTimer.js`（HW-103 desk mode）、`theme.js`（Liquid Glass motion）、`pages/personalSpace.js`（HW-102 parallax） | `deviceorientation` 事件，iOS 以 `DeviceOrientationEvent.requestPermission()` 取得權限 | 三處各自處理權限與清理；WebView 的權限模型與 Safari 不同 |
| Web Audio | `focusTimer.js` | `AudioContext` 合成專注開始／結束提示音（Pro 功能） | 背景播放與靜音開關行為由 native audio session 決定 |
| 相機入口 | `ui/proofSheet.js` | `<input capture="environment">` | WebView 需 native file chooser 支援；權限文案由 shell 提供 |
| 震動 | `pages/home.js` 拖曳排序 | 直接 `navigator.vibrate(50)` | 應改走 `haptics.js` |
| 頁面生命週期 | `personalSpace/v2/ui/orbitWindow.js` | `visibilitychange` 暫停 runtime | native pause／resume 事件需對應到同一個暫停邏輯 |
| Service Worker | `pwa/index.html`、`pwa/sw.js` | 註冊 SW；更新時（不是首次安裝）`controllerchange` 會顯示「新版本已就緒」banner，使用者按「重新整理」才 `location.reload()`，不會自動重載 | 多數 WebView 不跑或限制 SW；離線快取需改由 shell 打包靜態檔 |
| 核心資料儲存 | `storage.js`（`yoyo_` 前綴）、`dayCycle.js`、`tour.js`、`titleBreathing.js`、`pages/home.js`、`pages/profile.js`、`pages/settings.js`、`personalSpace/v2/featureFlag.js` | 直接 `localStorage` | 與 `storageBridge` 的同步／async 問題相同，且範圍更大 |
| OAuth 與重設密碼回跳 | `auth.js` | `redirectTo: window.location.href.split('#')[0]` | native 需 custom scheme 或 universal link。屬 auth 高風險，需先提案 |
| 部署 | `.github/workflows/deploy.yml` | push `main` 即部署 `pwa/` 到 GitHub Pages | shell 版本需另有打包與商店發布流程；屬 CI／部署高風險 |

---

## 3. 建議的收斂順序（提案，未排入任務）

以下只是後續任務的候選，依「不碰高風險區、可獨立完成」排序；是否執行需另立任務並排入 Next：

1. `pages/home.js` 的 `navigator.vibrate(50)` 改走 `haptic()`（單行、低風險）。
2. 三處 `deviceorientation` 收斂成一個 `platform/motion.js`（權限請求、訂閱、清理）。
3. 決定 storage 介面在 hybrid 下是「啟動預載＋同步讀」還是「全面 async」。這是影響最大的決策，應先 Mode A 提案，再動 `storage.js`。
4. Auth 回跳、push token、IAP、部署流程都屬 AGENTS.md §3 高風險，只能在確定 shell 技術後個別提案。

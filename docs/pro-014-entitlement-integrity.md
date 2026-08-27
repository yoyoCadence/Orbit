# Pro entitlement：安全模型定案，與 PRO-014G（可選 hardening）提案

狀態：**已定案採「UI entitlement projection ＋ server-side enforcement」。**
PRO-014G（signed receipt）為**可選**的 anti-tamper hardening，**不是任何任務的前置**，
尚未實作；若日後啟動，因涉及 RPC 回傳值變更，仍須依 AGENTS.md §3 先取得核准。

來源：[PR #146](https://github.com/yoyoCadence/Orbit/pull/146) 的驗收與覆驗結論。

---

## 0. 定案：安全控制在 server，client 只做投影

這是整份文件最重要的一節，其餘各節都是它的推導與備案。

**Orbit 是純前端 PWA，JS 未混淆、靜態部署。裝置擁有者永遠可以直接改程式：**

```js
storage.isProUser = () => true;   // 任何 client-local 機制都擋不住這一行
```

因此：

| 層 | 負責什麼 | 可否被裝置擁有者繞過 |
|---|---|---|
| `storage.isProUser()`（client projection） | UI 顯示／隱藏、鎖／不鎖、要不要導去購買頁 | **可以** —— 本來就不是安全邊界 |
| server（RLS policy／RPC 內部判斷 `is_pro_active`） | 付費資料、付費 API、雲端運算 | 不可以 |

**規則**：任何有實際價值的 Pro 資料、API 或操作，必須由 server 自行驗證 `is_pro_active`，
不得相信 `isProUser()` 或任何由 client 傳入的 Pro 狀態。已寫入 `PRO-014F` 的完成條件。

目前 `isProUser()` 的呼叫點（保護卡、專注音效、主題、回顧月數、Personal Space 呈現）
全部是 UI 層，此結論成立；`PRO-014F` 交付付費呈現時需重新確認。

**那 PRO-014B 買到了什麼？** 偽造的授權不再往返伺服器 —— 不會同步到該使用者的其他裝置，
也不會外溢到排行榜 read model。這是實質改善，但它的性質是「縮小血徑」，不是「不可繞過」。

---

## 1. PRO-014G 要處理的是什麼

PRO-014B 的 projection 是**純 localStorage JSON，沒有任何來源完整性證明**，
格式完全合法的手寫內容會被照樣接受：

```js
localStorage.setItem('orbit_pro_entitlement', JSON.stringify({
  ownerId: '<自己的 user id>',
  isActive: true,
  expiresAt: null,          // null = 終身
  trialEndsAt: null,
  fetchedAtMs: Date.now(),
}));
```

格式完全合法，`isProFromSnapshot()` 會照樣授權。

**因此 PRO-014B 目前只縮小了影響範圍，沒有移除 client trust anchor。**
兩者的差別值得說清楚，因為它決定了這件事有多急：

| | 舊：profile 欄位 | 現在：localStorage snapshot |
|---|---|---|
| 偽造後會 | 寫進 `profiles`，**同步到該使用者所有裝置** | 只影響**當前這一台裝置** |
| 會不會外溢到其他功能 | 會 —— PRO-014E／F 的排行榜 read model 會讀到 | 不會 |
| 需要什麼技能 | 一行 console | 一行 console |

血徑變小了，門檻沒有變。

## 2. 簽章能買到什麼、買不到什麼

見第 0 節：**簽章不會讓 client gate 變成安全邊界**，那一層永遠可被裝置擁有者繞過。

簽章的價值明確且有限：把「隨手改一個 localStorage key」擋掉，讓本機偽造必須動到
應用程式碼本身。它是**提高門檻**，不是**建立邊界**，因此定位為可選 hardening。

判斷是否啟動時，問的應該是「離線 UI 的防竄改門檻對產品是否重要到值得這些複雜度」，
而不是「我們需不需要安全性」—— 後者的答案永遠在 server 端。

## 3. 提案：server 簽章的 entitlement receipt

### 3.1 RPC 回傳值變更

`my_pro_status()` 除現有三個欄位外，增加一個 receipt 欄位：

```
is_active      boolean
expires_at     timestamptz
trial_ends_at  timestamptz
receipt        text          -- 新增：detached JWS，payload 即上面三項 + owner + issued/expiry
```

payload 至少包含：

| 欄位 | 用途 |
|---|---|
| `sub` | owner user id —— 綁定持有者，複製到別的帳號無效 |
| `is_active` / `expires_at` / `trial_ends_at` | 授權內容本身 |
| `iat` | 簽發時間 —— 對應現有的 `fetchedAtMs`，離線 grace window 由它起算 |
| `exp` | receipt 本身的有效期（建議 ≦ 離線 grace window，即 24 小時） |

`exp` 與 `expires_at` 是兩件事：前者限制「這張憑證能被重放多久」，
後者是「這個訂閱到什麼時候」。終身 Pro 的 `expires_at` 是 null，但 `exp` 仍然是 24 小時。

### 3.2 簽章與金鑰

- 演算法：**ES256**（非對稱）。client 只拿得到公鑰，因此即使前端完全被讀取，也產不出有效簽章。
  對稱式 HMAC 不可行 —— 密鑰得放進前端就等於沒簽。
- 私鑰只存在資料庫端，由 `SECURITY DEFINER` 函式取用，**不得**經由任何 API 暴露。
- 公鑰隨 repo 一起 vendored（比照 `pwa/vendor/supabase.js` 的做法），
  這樣「client 用哪把公鑰驗章」由 repo 決定且可稽核。
- 輪替：payload 帶 `kid`，client 端保留一組公鑰。輪替流程需另行設計。

### 3.3 Client 端驗證

用 Web Crypto（`crypto.subtle.verify`），不引入新依賴。

驗證通過才建立 snapshot，且 snapshot 存的是 **receipt 原文**而非解析後的欄位 ——
每次讀取都重新驗章，避免「驗一次、之後信任解析結果」這種可被繞過的寫法。

驗章是非同步的（`crypto.subtle` 回 Promise），而 `isProUser()` 必須維持同步。
作法：在 `refreshProEntitlement()` 與啟動時各驗一次，把結果放進**記憶體**（不是 localStorage）。
記憶體中的已驗證結果無法被 console 一行改掉，也不會跨頁面存活 —— 每次啟動都要重驗。

### 3.4 需要處理的邊界

- 離線首次啟動：記憶體是空的，只有 localStorage 裡的 receipt。此時仍需驗章（公鑰在本機，可離線驗），驗過才授權。
- `exp` 已過的 receipt：fail closed，即使 `expires_at` 還很久。
- 公鑰載入失敗：fail closed。
- 時鐘倒轉：沿用現有 `isProFromSnapshot()` 的處理。

## 4. 影響範圍與風險

| 項目 | 風險 |
|---|---|
| 改 `my_pro_status()` 回傳值 | **高** —— migration 變更，且 011 尚未套用，須與 PRO-014D 一併規劃 |
| 資料庫端保存簽章私鑰 | **高** —— 金鑰管理、輪替、洩漏應對都要先想清楚 |
| Client 端 Web Crypto 驗章 | 中 —— 動到啟動路徑，但不涉及 auth 流程 |
| 公鑰 vendored 進 repo | 低 —— 公鑰本來就是公開的 |

## 5. 若日後啟動的順序

1. **先取得核准**（AGENTS.md §3）—— 涉及 RPC contract 與簽章金鑰。
2. 與 `PRO-014D` 合併規劃：011 還沒套用，趁那次一起改比套用後再改 migration 乾淨。
3. 實作順序：RPC 加簽 → client 驗章 → 加入「合法 JSON 偽造被拒」的回歸測試。

## 6. 現況

- `REPO_PRO_ENTITLEMENT_SOURCE` 維持 `legacy`，production 行為不變；切到 `server` 是 `PRO-014H`（前置 `PRO-014C`、`PRO-014D`、`PRO-014I`，並需依 AGENTS.md §3 另行核准）。
- `PRO-014B` 已依第 0 節重新定義為 UI entitlement projection，**不再以 PRO-014G 為完成前置**。
- `pwa/js/platform/proEntitlement.js` 檔頭寫明它不是安全邊界，避免後續有人把真正有價值的能力掛上去。

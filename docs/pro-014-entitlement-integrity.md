# PRO-014G 提案：entitlement snapshot 的來源完整性

狀態：**提案，尚未實作。** 涉及 RPC 回傳值變更，依 AGENTS.md §3 需先取得核准。

來源：[PR #146](https://github.com/yoyoCadence/Orbit/pull/146) 的驗收意見（Blocker 1）。

---

## 1. 問題

PRO-014B 把 Pro 判定的依據從 profile 欄位換成 `my_pro_status()` 建立的本機 snapshot。
但那個 snapshot 是**純 localStorage JSON，沒有任何來源完整性證明**：

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

## 2. 一個必須先講清楚的前提

**簽章不會讓 client gate 變成安全邊界。**

Orbit 是純前端 PWA，JS 未混淆、靜態部署。裝置擁有者永遠可以直接改程式：

```js
storage.isProUser = () => true;      // 簽章驗到一半也擋不住這個
```

所以簽章的價值是**明確且有限**的：它把「隨手改一個 localStorage key」擋掉，
讓偽造需要動到應用程式碼本身。它**不能**取代伺服器端授權。

推論（與驗收意見第 4 點一致，這裡寫進文件避免日後被誤讀）：

> 任何有實際價值的 Pro 能力 —— 付費資料、付費 API、雲端運算 ——
> **必須由伺服器自己判斷 `is_pro_active`**，不得依賴 client 傳來的任何東西。
> `isProUser()` 只負責 UI：顯示或隱藏、鎖或不鎖、要不要導去購買頁。

目前 `isProUser()` 的呼叫點（保護卡、專注音效、主題、回顧月數、Personal Space 呈現）
全部都是 UI 層。這個結論現在成立，但需要在 PRO-014F 交付排行榜／付費呈現時重新確認。

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

## 5. 建議順序

1. **先取得本提案的核准**（AGENTS.md §3）。
2. 與 `PRO-014D` 合併規劃：011 還沒套用，趁這次一起改比套用後再改 migration 乾淨。
3. 實作順序：RPC 加簽 → client 驗章 → 加入「合法 JSON 偽造被拒」的回歸測試 → 才把 `REPO_PRO_ENTITLEMENT_SOURCE` 切到 `server`。
4. `PRO-014F` 交付付費呈現時，重新確認第 2 節的「只在 UI 層」結論仍然成立。

## 6. 在核准之前

`REPO_PRO_ENTITLEMENT_SOURCE` 維持 `legacy`，production 不受影響。
PRO-014B 停在 In Progress，不得標為 Done。

`pwa/js/platform/proEntitlement.js` 的檔頭已寫明這個缺口，避免後續有人誤以為
snapshot 是可信來源而把真正有價值的能力掛上去。

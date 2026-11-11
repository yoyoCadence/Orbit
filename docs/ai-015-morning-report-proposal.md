# AI-015 提案：AI 晨間報告

> 狀態：提案（只寫文件），等擁有者決定 §9。2026-11-11 使用者要求寫提案（「好你寫提案我看看」）。核准前不改程式、不動 production、不建立任何 API key。

## 1. 結論

- **目標**（`docs/monetization.md` SUB-15）：Pro 使用者每天早上看到一段由 Claude 根據最近 7 天紀錄寫的個人化建議；免費使用者維持現在的固定格式報告。
- **原始構想是「使用者在設定頁貼上自己的 Claude API key，不經過 Orbit 後端」。** 這做得到，但只有少數人會有 API key，而且 key 存在瀏覽器裡有外洩風險（§4）。
- **建議**：
  - 改由 **Supabase Edge Function** 代為呼叫 Claude API：key 只存在 server（Edge Function 的 secret），server 先確認呼叫者是 Pro、一天一次，再送出請求；
  - 送給 Claude 的資料**只有統計數字與任務分類**，預設不送任務名稱與筆記（§5）；
  - 模型與費用由擁有者決定（§6）；
  - 拆成 A1（Edge Function＋測試）→ AA（擁有者建立 key 與部署）→ A2（client）。

## 2. 現況（2026-11-11 的 main）

- **晨間報告**：`pwa/js/dayCycle.js` 的 `showDailyReport()`，換日後顯示一次：
  - 昨天的 XP、價值分布（S／A／B／C）、有效日與連勝；
  - `_reportSuggestions()` 依規則產生最多 3 條建議（例如「今天安排一個 A 或 S 級的重要任務」「昨天娛樂時間 2.5hr，今天保持平衡」）。
  - 全部在 client 計算，不連網。
- **沒有任何後端程式**：app 只用 Supabase 的資料表與 RPC；目前沒有 Edge Function。
- **CSP**（`pwa/index.html`）：`connect-src` 只允許自己與 Supabase 的網域。
- **Pro 的判定**：PRO-014H 起由 server 決定；目前所有 Pro 功能都在 client（PRO-014G §7）。AI 報告會是**第一個花 server 錢的 Pro 功能**，所以必須在 server 檢查 Pro。

## 3. 架構（建議：Edge Function）

1. client（Pro、已登入、今天還沒有 AI 報告）呼叫 Edge Function `morning-report`，帶著使用者的登入 token。
2. Edge Function：
   - 以 token 確認身分（`auth.getUser()`）；
   - 以 `is_pro_active()` 確認是 Pro（不相信 client）；
   - 確認這個帳號今天還沒產生過（server 的一張小表 `ai_reports(user_id, report_date, …)`，或同一天直接回傳已存的結果）；
   - 自己從 `sessions` 讀最近 7 天、計算統計（不接受 client 傳的資料，避免被拿來當免費的通用 AI）；
   - 呼叫 Claude API（官方 SDK，key 在 Edge Function 的 secret），取得 3–5 句的建議；
   - 存下結果並回傳。
3. client 在晨間報告裡、固定建議的上方顯示 AI 的文字；失敗或逾時就只顯示原本的報告。

- **權限**：`ai_reports` 是 server-owned table：RLS 開啟、只建立「讀自己的」SELECT policy、REVOKE client 的寫入（CLAUDE.md 的例外條款，migration 註解寫明）。
- **key 的保管**：Anthropic API key 只放在 Supabase 的 Edge Function secret；不進 repo、不進 client、不輸出到 log（CLAUDE.md 的環境變數規則）。
- **CSP 不用改**：client 只呼叫 Supabase。

## 4. 為什麼不建議「自己貼 key」

- **能用的人很少**：要先去 Anthropic 申請帳號、付費、產生 key。
- **key 在瀏覽器裡**：存在 localStorage，任何 XSS 都能讀走；雖然 CSP 已經很嚴（沒有 inline script、沒有 eval），仍是長期存在的秘密。官方 SDK 在瀏覽器裡要明確開啟 `dangerouslyAllowBrowser`（送出 `anthropic-dangerous-direct-browser-access` 標頭），名稱就說明了風險。
- **CSP 要放行 `api.anthropic.com`**。
- **好處**：擁有者不用付錢、不用後端。若擁有者不想負擔費用，這仍是可行的方案（§9 第 2 點），但建議只給「知道自己在做什麼」的進階設定，並清楚提示風險。

## 5. 送給 Claude 的資料

- **預設只送**：最近 7 天每天的有效 XP、有效日與否、連勝天數、各分類（成長／維持／義務／恢復／娛樂）的時間與次數、S／A／B 任務的數量、專注計時完成與放棄的次數。
- **預設不送**：任務名稱、專注筆記、佐證照片、名稱與 email。任務名稱可能包含私事；要更貼切的建議，可以讓使用者自己打開「把任務名稱也給 AI 參考」（§9 第 4 點）。
- **第一次使用前**顯示說明並取得同意：資料會送到 Anthropic 產生建議；可以隨時在設定關閉。
- Anthropic API 的資料使用規範以官方條款為準；套用前由擁有者確認。

## 6. 模型與費用

- **預設模型**：`claude-opus-5-5`（目前的預設與最新的 Opus）。也可以用 `claude-haiku-5-5`（最新的 Haiku，便宜很多）；選哪一個由擁有者決定（§9 第 3 點）。
- **一次報告的估算**（輸入約 2,000–3,000 tokens 的統計與說明，輸出約 300–600 字的建議，加上模型的思考）：

  | 模型 | 價格（每百萬 tokens，輸入／輸出） | 一次約 | 每人每月（每天一次） |
  |---|---|---|---|
  | `claude-opus-5-5`（effort `low`） | $4／$20 | 約 $0.02–0.05 | 約 $0.6–1.5 |
  | `claude-haiku-5-5` | $0.10／$0.50 | 約 $0.001 | 約 $0.03 |

  以實際的 `usage` 為準；A1 的測試會量一次真實的 token 數再更新這張表。
- **控制費用**：
  - 每個帳號每天最多一次（server 檢查）；
  - Anthropic Console 設定每月的支出上限；
  - 系統提示固定不變，可以用 prompt caching 省下重複的部分。

## 7. 順序

1. **A1**（repo）：Edge Function 的程式與測試（用假的 Claude 回應測 Pro 檢查、一天一次、資料只來自 server、失敗時的回應）；migration（`ai_reports` 表與權限）。
2. **AA**（擁有者）：在 Anthropic Console 建立 API key 與支出上限；在 Supabase 設定 Edge Function secret、部署函式、套用 migration。這一步涉及金鑰與部署，需要另外核准，agent 不經手 key。
3. **A2**（repo）：晨間報告顯示 AI 的建議、設定頁的開關與同意說明。

## 8. 驗收

- Pro 帳號：晨間報告出現 AI 的建議，一天只產生一次；同一天再打開看到同一段文字。
- 免費帳號、訪客：呼叫 Edge Function 被拒，畫面與現在相同。
- 偽造本機的 Pro 狀態（PRO-014G 的情況）呼叫 Edge Function 仍被拒（server 檢查）。
- 斷網、逾時、Claude 拒絕回答：只顯示原本的報告，不卡住開機。
- repo、client、log 裡都沒有 API key。

## 9. 需要擁有者決定

1. **做不做、何時做**：
   - A（建議）：先做 PRO-014E 等已經在排的項目，這項排在後面（ROADMAP 標為長期 v2.x）；
   - B：現在開始 A1。
2. **架構**：Edge Function，擁有者付費（建議），或使用者自己貼 key（擁有者不付費，但能用的人少、有 key 外洩的風險）。
3. **模型**：`claude-opus-5-5`（預設），或 `claude-haiku-5-5`（便宜約 30 倍，建議用在這種短文字的工作）。最後的選擇由擁有者決定，A1 會用兩個模型各產生幾份範例讓擁有者比較。
4. **任務名稱**：預設不送（建議），或預設送出。
5. **誰可以用**：只有 Pro（建議，與原構想相同），或免費使用者每週一次。
6. **每月支出上限**：例如 $10（建議先從小額開始），由擁有者在 Anthropic Console 設定。

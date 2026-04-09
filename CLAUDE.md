# 成長監控專案

## 專案目的
個人成長紀錄系統，用於追蹤技能發展、健身進度、學習歷程與個人目標達成情況。

## 資料夾結構

```
成長監控/
├── 日記/          # 每日反思與記錄
├── 技能/          # 技能學習進度追蹤
├── 健身/          # 運動與健康數據
├── 學習/          # 學習資源與筆記
├── 目標/          # 短中長期目標設定
└── 數據/          # 統計資料與圖表
```

## 使用說明
- 日記：以 YYYY-MM-DD.md 格式命名每日記錄
- 技能：每項技能建立獨立子資料夾，記錄等級與里程碑
- 健身：按月份整理運動紀錄
- 學習：按主題分類學習筆記
- 目標：分為 short-term、mid-term、long-term 三類
- 數據：存放 CSV 或圖表等分析檔案

---

## Supabase 安全規則（每次寫資料庫相關程式碼都必須遵守）

### 角色模型
- 未登入 → `anon` role，`auth.uid()` 為 NULL
- 已登入 → `authenticated` role，`auth.uid()` 有值
- 所有資料 policy 只授權給 `authenticated`，`anon` 不得存取任何資料表

### RLS 規則（缺一不可）
1. 每張表都必須執行 `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY`
2. 每張表都必須明確定義四種 policy：SELECT、INSERT、UPDATE、DELETE
3. 未有明確 policy 的操作一律拒絕（不可依賴預設行為）

### Policy 寫法規範
| Operation | USING | WITH CHECK |
|-----------|-------|-----------|
| SELECT | ✅ `auth.uid() = user_id` | ❌ 不需要 |
| INSERT | ❌ 不需要 | ✅ `auth.uid() = user_id` |
| UPDATE | ✅ `auth.uid() = user_id` | ✅ `auth.uid() = user_id` |
| DELETE | ✅ `auth.uid() = user_id` | ❌ 不需要 |

- INSERT 必須有 `WITH CHECK`，否則使用者可以 insert 別人的 user_id
- UPDATE 必須同時有 `USING`（限制能改哪列）和 `WITH CHECK`（限制改後的值）

### Storage 規則
- 路徑設計：`{bucket}/{user_id}/filename`
- bucket policy 之外，還必須用 `storage.foldername(name)[1]` 做 path-level 限制
- SELECT / INSERT / UPDATE / DELETE 四個 policy 都要寫

### 禁止事項
- 禁止在任何 client-side 程式碼使用 `service_role` key
- 只用 `anon public key`（存在環境變數或 config，不 hardcode 在 JS 裡）
- 禁止 `FOR ALL` 或不指定 role 的寬鬆 policy

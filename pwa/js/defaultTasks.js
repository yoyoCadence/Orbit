// Built-in task templates — seeded on first launch
import { uid } from './utils.js';

export function createDefaultTasks() {
  const now = new Date().toISOString().slice(0, 10);

  return [
    // ── High-value growth ──────────────────────────────────────────────────────
    {
      id: uid(), name: '高價值深度輸出',
      category: 'focus', impactType: 'task', taskNature: 'growth',
      value: 'S', difficulty: 1.0, resistance: 1.4,
      emoji: '✍️', iconImg: null,
      minEffectiveMinutes: 25, cooldownMinutes: 120, dailyXpCap: 300,
      isDefault: true, requiresReasonIfS: true,
      reason: '高品質輸出是核心成長槓桿，直接提升能力與作品',
      successCriteria: '完成一份可交付的輸出成果（文章/程式/設計/分析）',
      hasDeliverable: true,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '深度學習 45 分鐘',
      category: 'focus', impactType: 'task', taskNature: 'growth',
      value: 'A', difficulty: 1.0, resistance: 1.2,
      emoji: '🧠', iconImg: null,
      minEffectiveMinutes: 25, cooldownMinutes: 60, dailyXpCap: 200,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '運動 30 分鐘',
      category: 'focus', impactType: 'task', taskNature: 'growth',
      value: 'A', difficulty: 0.7, resistance: 1.2,
      emoji: '🏋️', iconImg: null,
      minEffectiveMinutes: 15, cooldownMinutes: 360, dailyXpCap: 200,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '閱讀高品質內容 30 分鐘',
      category: 'focus', impactType: 'task', taskNature: 'growth',
      value: 'A', difficulty: 0.7, resistance: 1.2,
      emoji: '📚', iconImg: null,
      minEffectiveMinutes: 15, cooldownMinutes: 60, dailyXpCap: 200,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },

    // ── Maintenance / obligation ───────────────────────────────────────────────
    {
      id: uid(), name: '例行工作處理',
      category: 'focus', impactType: 'task', taskNature: 'obligation',
      value: 'B', difficulty: 0.7, resistance: 1.0,
      emoji: '💼', iconImg: null,
      minEffectiveMinutes: 15, cooldownMinutes: 30, dailyXpCap: 100,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '記帳 / 檢查支出',
      category: 'instant', impactType: 'task', taskNature: 'maintenance',
      value: 'B', difficulty: 0.4, resistance: 1.0,
      emoji: '💰', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 720, dailyXpCap: 50,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '整理環境 10 分鐘',
      category: 'instant', impactType: 'task', taskNature: 'maintenance',
      value: 'B', difficulty: 0.4, resistance: 1.0,
      emoji: '🧹', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 360, dailyXpCap: 50,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '回覆必要訊息 / 行政處理',
      category: 'instant', impactType: 'task', taskNature: 'obligation',
      value: 'B', difficulty: 0.4, resistance: 1.0,
      emoji: '📬', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 240, dailyXpCap: 50,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },

    // ── Recovery ──────────────────────────────────────────────────────────────
    {
      id: uid(), name: '散步 20 分鐘',
      category: 'instant', impactType: 'recovery', taskNature: 'recovery',
      value: 'D', difficulty: 0.4, resistance: 1.0,
      emoji: '🚶', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 120, dailyXpCap: 0,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '午休 / 冥想 / 伸展',
      category: 'instant', impactType: 'recovery', taskNature: 'recovery',
      value: 'D', difficulty: 0.4, resistance: 1.0,
      emoji: '🧘', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 180, dailyXpCap: 0,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },

    // ── Entertainment ─────────────────────────────────────────────────────────
    {
      id: uid(), name: '追劇 / 看影片 30 分鐘',
      category: 'instant', impactType: 'entertainment', taskNature: 'entertainment',
      value: 'D', difficulty: 0.4, resistance: 1.0,
      emoji: '🎬', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 0, dailyXpCap: 0,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '遊戲 30 分鐘',
      category: 'instant', impactType: 'entertainment', taskNature: 'entertainment',
      value: 'D', difficulty: 0.4, resistance: 1.0,
      emoji: '🎮', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 0, dailyXpCap: 0,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
    {
      id: uid(), name: '短影音 / 無目的滑手機 15 分鐘',
      category: 'instant', impactType: 'entertainment', taskNature: 'entertainment',
      value: 'D', difficulty: 0.4, resistance: 1.0,
      emoji: '📱', iconImg: null,
      minEffectiveMinutes: 0, cooldownMinutes: 0, dailyXpCap: 0,
      isDefault: true, requiresReasonIfS: false,
      valueConfidence: 100, createdAt: now,
    },
  ];
}

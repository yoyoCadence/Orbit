// Cross-module localStorage / sessionStorage flag keys.
// 這些值已持久化在使用者裝置上——只能新增，絕不能改字串值。

// localStorage
export const FLAG_SHIELD_PENDING    = 'orbit_shield_pending';    // {prevStreak} JSON，連勝中斷待用保護卡
export const FLAG_DEV_BACKUP        = 'orbit_dev_backup';        // dev tools 覆蓋前的 user 備份（存在＝暫停上雲）
export const FLAG_DEV_PANEL         = 'orbit_dev_panel';         // '1' = 非 localhost 也顯示開發者面板

// sessionStorage
export const FLAG_SHIELD_DISMISSED  = 'orbit_shield_dismissed';  // '1' = 本次 session 已收合保護卡橫幅
export const FLAG_SHIELD_SCROLL_TOP = 'orbit_shield_scroll_top'; // '1' = 導回首頁後捲到頂
export const FLAG_PRO_HIGHLIGHT     = 'orbit_pro_highlight';     // '1' = 進設定頁時高亮 Pro 卡
export const FLAG_STREAK_UNLOCK_NEW = 'orbit_streak_unlock_new'; // '1' = 顯示 45 天連勝解鎖慶祝

export function supportsNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareContent(payload) {
  if (!supportsNativeShare()) {
    return { shared: false, reason: 'unsupported' };
  }

  try {
    await navigator.share(payload);
    return { shared: true, reason: 'native-share' };
  } catch (error) {
    return { shared: false, reason: error?.name || 'share-failed' };
  }
}

// Build a text-only share payload from current user stats.
// Falls back to clipboard copy when Web Share is unavailable.
export function buildGrowthShareText({ name, level, title, streakDays, totalXP, todayXP } = {}) {
  const streak  = streakDays > 0 ? `🔥 ${streakDays} 天連勝` : '剛起步';
  const today   = todayXP   > 0 ? `今日 +${todayXP} XP` : '';
  const lines   = [
    `🌱 ${name || 'Orbit 使用者'} — Lv.${level} ${title}`,
    `⭐ 累積 ${totalXP} XP　${streak}`,
    today,
    '#Orbit成長日誌',
  ].filter(Boolean);
  return lines.join('\n');
}

export async function shareGrowthCard(payload) {
  const text = buildGrowthShareText(payload);

  if (supportsNativeShare()) {
    return shareContent({ title: 'Orbit 成長紀錄', text });
  }

  // Clipboard fallback
  try {
    await navigator.clipboard.writeText(text);
    return { shared: true, reason: 'clipboard' };
  } catch {
    return { shared: false, reason: 'clipboard-denied' };
  }
}

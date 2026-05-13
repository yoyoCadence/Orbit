import { storage } from './storage.js';

const RESULT_LABELS = {
  instant: '即時完成',
  complete: '完成',
  partial: '部分完成',
  skip: '略過',
};

const NATURE_LABELS = {
  growth: '成長',
  maintenance: '維持',
  obligation: '必要',
  recovery: '恢復',
  entertainment: '娛樂',
};

function _escCell(val) {
  const str = String(val ?? '');
  if (/[,"\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

export function exportSessionsCSV() {
  const sessions = storage.getSessions();
  if (!sessions.length) {
    window.showToast('目前沒有打卡紀錄可匯出');
    return;
  }

  const headers = ['日期', '任務名稱', '類型', '結果', '時長（分鐘）', '基礎XP', '最終XP', '性質', '價值'];

  const rows = sessions
    .slice()
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
    .map(s => [
      s.date ?? '',
      s.taskName ?? '',
      s.result === 'instant' ? '即時' : '專注',
      RESULT_LABELS[s.result] ?? s.result ?? '',
      s.durationMinutes ?? '',
      s.baseXP ?? '',
      s.finalXP ?? '',
      NATURE_LABELS[s.taskNature] ?? s.taskNature ?? '',
      s.value ?? '',
    ]);

  const csv = [headers, ...rows]
    .map(row => row.map(_escCell).join(','))
    .join('\n');

  // UTF-8 BOM ensures Excel opens Chinese correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `orbit-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

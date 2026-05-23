/* global Blob */
import { storage }         from './storage.js';
import { state }            from './state.js';
import { getLevelInfo }     from './leveling.js';
import { getDisplayTitle }  from './leveling.js';

// Lazy-loaded CDN libs (only when user generates a PDF)
const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const H2C_URL   = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';

const DETAIL_THRESHOLD = 150; // sessions; above this, omit detail table
const MAX_CHART_WEEKS  = 12;

// ─── CSV export ───────────────────────────────────────────────────────────────

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

  const csv = [headers, ...rows].map(row => row.map(_escCell).join(',')).join('\n');

  // UTF-8 BOM ensures Excel opens Chinese correctly
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `orbit-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── PDF report ───────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _formatMonth(yyyyMM) {
  const [y, m] = yyyyMM.split('-');
  return `${y} 年 ${parseInt(m)} 月`;
}

function _loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s  = document.createElement('script');
    s.src    = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`無法載入：${src}`));
    document.head.appendChild(s);
  });
}

// Return ISO date string (YYYY-MM-DD) of the Monday of the given date's week
function _weekStart(dateStr) {
  const d   = new Date(dateStr + 'T00:00:00');
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().slice(0, 10);
}

// ── HTML helpers (inline styles throughout for html2canvas compatibility) ─────

function _statCardHtml(label, value, color) {
  return `
    <div style="background:#f5f3ff;border-radius:10px;padding:16px 10px;text-align:center;border-top:3px solid ${color};">
      <div style="font-size:20px;font-weight:800;color:${color};line-height:1.2;">${_esc(String(value))}</div>
      <div style="font-size:11px;color:#6b7280;margin-top:5px;">${label}</div>
    </div>`;
}

function _weeklyChartHtml(sessions) {
  const byWeek = {};
  sessions.forEach(s => {
    if (!s.date) return;
    const w = _weekStart(s.date);
    byWeek[w] = (byWeek[w] || 0) + (s.finalXP || 0);
  });

  let weeks = Object.entries(byWeek).sort((a, b) => a[0].localeCompare(b[0]));
  if (weeks.length > MAX_CHART_WEEKS) weeks = weeks.slice(-MAX_CHART_WEEKS);

  if (!weeks.length) {
    return '<div style="color:#9ca3af;font-size:13px;text-align:center;padding:24px 0;">此期間無打卡紀錄</div>';
  }

  const maxXP   = Math.max(...weeks.map(([, xp]) => xp), 1);
  const CHART_H = 80;

  return `
    <div style="display:flex;align-items:flex-end;gap:5px;height:${CHART_H + 22}px;">
      ${weeks.map(([ws, xp]) => {
        const barH = Math.max(3, Math.round((xp / maxXP) * CHART_H));
        const d    = new Date(ws + 'T00:00:00');
        const lbl  = `${d.getMonth() + 1}/${d.getDate()}`;
        return `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:${CHART_H + 22}px;">
            <div style="width:100%;background:#7c3aed;border-radius:3px 3px 0 0;height:${barH}px;opacity:0.85;"></div>
            <div style="font-size:9px;color:#9ca3af;margin-top:3px;white-space:nowrap;">${lbl}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function _topTasksHtml(sessions) {
  const counts = {};
  sessions.forEach(s => {
    if (s.taskName) counts[s.taskName] = (counts[s.taskName] || 0) + 1;
  });

  const top5 = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!top5.length) return '<div style="color:#9ca3af;font-size:13px;">暫無資料</div>';

  const maxC = top5[0][1];
  return top5.map(([name, count], i) => `
    <div style="margin-bottom:11px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;">
        <span style="font-size:13px;color:#374151;font-weight:500;">${i + 1}. ${_esc(name)}</span>
        <span style="font-size:12px;color:#6b7280;flex-shrink:0;margin-left:8px;">${count} 次</span>
      </div>
      <div style="height:6px;background:#ede9fe;border-radius:3px;overflow:hidden;">
        <div style="height:100%;background:#7c3aed;width:${Math.round(count / maxC * 100)}%;border-radius:3px;"></div>
      </div>
    </div>`).join('');
}

function _detailTableHtml(sessions) {
  const sorted = sessions.slice().sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const rows   = sorted.map((s, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    return `
      <tr style="background:${bg};border-bottom:1px solid #f3f4f6;">
        <td style="padding:7px 10px;color:#6b7280;font-size:12px;white-space:nowrap;">${s.date ?? ''}</td>
        <td style="padding:7px 10px;color:#374151;font-weight:500;font-size:12px;">${_esc(s.taskName ?? '')}</td>
        <td style="padding:7px 10px;text-align:center;color:#6b7280;font-size:12px;white-space:nowrap;">${RESULT_LABELS[s.result] ?? ''}</td>
        <td style="padding:7px 10px;text-align:right;color:#7c3aed;font-weight:600;font-size:12px;white-space:nowrap;">+${s.finalXP ?? 0}</td>
      </tr>`;
  }).join('');

  return `
    <div style="margin-top:28px;">
      <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px;letter-spacing:0.5px;text-transform:uppercase;">打卡明細</div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.5px;">日期</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.5px;">任務</th>
            <th style="text-align:center;padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.5px;">結果</th>
            <th style="text-align:right;padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.5px;">XP</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function _buildReportHTML(sessions, user, level, titleStr, dateLabel) {
  const totalXP    = sessions.reduce((s, r) => s + (r.finalXP || 0), 0);
  const activeDays = new Set(sessions.filter(s => (s.finalXP || 0) > 0).map(s => s.date)).size;
  const showDetail = sessions.length <= DETAIL_THRESHOLD;
  const generatedAt = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  const chartNote  = sessions.length > MAX_CHART_WEEKS * 7 ? '（近 12 週）' : '';

  return `
    <div style="width:800px;background:#ffffff;font-family:-apple-system,'Helvetica Neue',Arial,sans-serif;color:#1a1a2e;box-sizing:border-box;">

      <!-- Header band -->
      <div style="background:#7c3aed;padding:32px 40px;color:#ffffff;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px;">Orbit</div>
            <div style="font-size:13px;opacity:0.75;margin-top:5px;">個人成長報告</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-weight:700;">${_esc(user?.name || '使用者')}</div>
            <div style="font-size:13px;opacity:0.8;margin-top:4px;">Lv.${level} &nbsp;${_esc(titleStr)}</div>
            <div style="font-size:12px;opacity:0.6;margin-top:3px;">${_esc(dateLabel)}</div>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div style="padding:28px 40px 24px;">

        <!-- Stats row -->
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
          ${_statCardHtml('總 XP', totalXP.toLocaleString(), '#7c3aed')}
          ${_statCardHtml('打卡次數', sessions.length + ' 次', '#0ea5e9')}
          ${_statCardHtml('活躍天數', activeDays + ' 天', '#16a34a')}
          ${_statCardHtml('當前連勝', (user?.streakDays || 0) + ' 天', '#f59e0b')}
        </div>

        <!-- Weekly XP chart -->
        <div style="margin-bottom:28px;">
          <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:14px;letter-spacing:0.5px;text-transform:uppercase;">每週 XP 趨勢${chartNote}</div>
          ${_weeklyChartHtml(sessions)}
        </div>

        <!-- Top 5 tasks -->
        <div>
          <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:14px;letter-spacing:0.5px;text-transform:uppercase;">最常打卡 Top 5</div>
          ${_topTasksHtml(sessions)}
        </div>

        <!-- Detail table or summary note -->
        ${showDetail
          ? _detailTableHtml(sessions)
          : `<div style="margin-top:24px;padding:14px 16px;background:#f5f3ff;border-radius:8px;font-size:12px;color:#6b7280;text-align:center;">
               共 ${sessions.length} 筆紀錄 &nbsp;·&nbsp; 詳細明細請使用「匯出 CSV」功能
             </div>`}
      </div>

      <!-- Footer -->
      <div style="padding:12px 40px;background:#f9fafb;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:11px;color:#9ca3af;">由 Orbit 自動產生</div>
        <div style="font-size:11px;color:#9ca3af;">${generatedAt}</div>
      </div>
    </div>`;
}

// ── Core PDF generation ───────────────────────────────────────────────────────

async function _generatePDF(rangeKey, dateLabel) {
  const allSessions = storage.getSessions();
  const sessions    = rangeKey === 'all'
    ? allSessions
    : allSessions.filter(s => (s.date ?? '').startsWith(rangeKey));

  if (!sessions.length) {
    window.showToast(`${dateLabel} 沒有打卡紀錄`);
    return;
  }

  const user    = state.user;
  const { level } = getLevelInfo(user?.totalXP || 0);
  const title   = getDisplayTitle(level, user);
  const html    = _buildReportHTML(sessions, user, level, title, dateLabel);

  // Mount off-screen container
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;pointer-events:none;';
  wrap.innerHTML = html;
  document.body.appendChild(wrap);
  const el = wrap.firstElementChild;

  try {
    await _loadScript(H2C_URL);
    await _loadScript(JSPDF_URL);

    const canvas = await window.html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const { jsPDF } = window.jspdf;
    const pdf   = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW  = pageW;
    const imgH  = (canvas.height * imgW) / canvas.width;
    const img   = canvas.toDataURL('image/jpeg', 0.92);

    // Multi-page: slice the long image across A4 pages
    let remaining = imgH;
    let posY      = 0;
    pdf.addImage(img, 'JPEG', 0, posY, imgW, imgH);
    remaining -= pageH;
    while (remaining > 0) {
      posY -= pageH;
      pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, posY, imgW, imgH);
      remaining -= pageH;
    }

    const fileName = rangeKey === 'all'
      ? `orbit-report-all-${new Date().toISOString().slice(0, 10)}.pdf`
      : `orbit-report-${rangeKey}.pdf`;
    pdf.save(fileName);

  } finally {
    document.body.removeChild(wrap);
  }
}

// ── Picker modal ──────────────────────────────────────────────────────────────

export function showReportPicker() {
  if (document.getElementById('report-picker-modal')) return;

  const allSessions = storage.getSessions();
  const monthSet    = new Set(allSessions.map(s => s.date?.slice(0, 7)).filter(Boolean));
  const months      = [...monthSet].sort().reverse();

  const now       = new Date();
  const curMonth  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevDate  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  const hasPrev   = months.includes(prevMonth);

  const radioStyle = 'display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border-radius:8px;border:1px solid var(--border-color);';

  const modal = document.createElement('div');
  modal.id        = 'report-picker-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:400px;">
      <div class="modal-header">
        <span class="modal-title">📊 產生成長報告</span>
        <button class="modal-close" id="rp-close">✕</button>
      </div>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">選擇報告涵蓋的時間範圍</p>

      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px;">
        <label style="${radioStyle}">
          <input type="radio" name="rp-range" value="${curMonth}" checked style="accent-color:var(--primary);flex-shrink:0;">
          <span style="font-size:14px;">本月（${_formatMonth(curMonth)}）</span>
        </label>
        ${hasPrev ? `
        <label style="${radioStyle}">
          <input type="radio" name="rp-range" value="${prevMonth}" style="accent-color:var(--primary);flex-shrink:0;">
          <span style="font-size:14px;">上個月（${_formatMonth(prevMonth)}）</span>
        </label>` : ''}
        <label style="${radioStyle}">
          <input type="radio" name="rp-range" value="custom" style="accent-color:var(--primary);flex-shrink:0;">
          <span style="font-size:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            選擇月份
            <select id="rp-month-sel" class="form-input" style="height:32px;padding:4px 8px;font-size:13px;width:130px;flex-shrink:0;">
              ${months.length ? months.map(m => `<option value="${m}">${_formatMonth(m)}</option>`).join('') : `<option value="${curMonth}">${_formatMonth(curMonth)}</option>`}
            </select>
          </span>
        </label>
        <label style="${radioStyle}">
          <input type="radio" name="rp-range" value="all" style="accent-color:var(--primary);flex-shrink:0;">
          <span style="font-size:14px;">全部時間（共 ${allSessions.length} 筆紀錄）</span>
        </label>
      </div>

      <button class="btn btn-primary" id="rp-generate" style="width:100%;">產生 PDF</button>
    </div>`;

  document.body.appendChild(modal);

  modal.querySelector('#rp-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

  // Selecting the dropdown also selects the "custom" radio
  modal.querySelector('#rp-month-sel').addEventListener('change', () => {
    modal.querySelector('input[value="custom"]').checked = true;
  });

  modal.querySelector('#rp-generate').addEventListener('click', async () => {
    const selected = modal.querySelector('input[name="rp-range"]:checked')?.value;
    let rangeKey  = selected;
    let dateLabel;

    if (selected === 'custom') {
      rangeKey  = modal.querySelector('#rp-month-sel').value;
      dateLabel = _formatMonth(rangeKey);
    } else if (selected === 'all') {
      dateLabel = '全部時間';
    } else {
      dateLabel = _formatMonth(rangeKey);
    }

    const btn     = modal.querySelector('#rp-generate');
    btn.textContent = '產生中，請稍候…';
    btn.disabled    = true;

    try {
      await _generatePDF(rangeKey, dateLabel);
      modal.remove();
    } catch (err) {
      console.error('[Orbit] PDF error:', err);
      window.showToast('PDF 產生失敗，請確認網路連線後再試');
      btn.textContent = '產生 PDF';
      btn.disabled    = false;
    }
  });
}

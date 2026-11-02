/**
 * @vitest-environment jsdom
 *
 * exportPdf.test.js — 成長報告 PDF 從 CDN 載入的兩個函式庫
 * jsdom 不會真的下載外部 script，由測試觸發 load／error。
 *
 *   1. 兩個 <script> 都帶 integrity（SRI）與 crossorigin：CDN 上的檔案被換掉時
 *      瀏覽器拒絕執行。
 *   2. 載入失敗（離線或檔案與 hash 不符）後再按一次會重新下載；原本留下的
 *      <script> 讓第二次直接「成功」，函式庫卻不存在，只能重新開啟 app。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const TODAY = new Date().toLocaleDateString('sv');

vi.mock('../../pwa/js/state.js', () => ({
  state: { user: { name: 'Tester', totalXP: 120, streakDays: 2, titleTemplate: 'rpg' } },
}));
vi.mock('../../pwa/js/storage.js', () => ({
  storage: {
    getSessions: () => [{
      id: 's1', date: TODAY, taskName: '讀書', taskEmoji: '📚', finalXP: 30,
      result: 'valid', value: 'A', completedAt: `${TODAY}T09:00:00`,
    }],
  },
}));

const { showReportPicker } = await import('../../pwa/js/export.js');

const scriptFor = name => document.head.querySelector(`script[src*="${name}"]`);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

async function generate() {
  document.querySelector('#rp-generate').click();
  await flush();
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.showToast = vi.fn();
});

describe('PDF report libraries', () => {
  it('load with SRI, and a failed load can be retried', async () => {
    showReportPicker();
    await generate();

    const h2c = scriptFor('html2canvas');
    expect(h2c.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
    expect(h2c.crossOrigin).toBe('anonymous');

    // Offline or a mismatching file: reported, tag removed.
    h2c.dispatchEvent(new Event('error'));
    await flush();
    expect(window.showToast).toHaveBeenCalledWith('PDF 產生失敗，請確認網路連線後再試');
    expect(scriptFor('html2canvas')).toBeNull();

    // The retry downloads again, then the PDF is made.
    await generate();
    const retry = scriptFor('html2canvas');
    expect(retry).not.toBeNull();
    window.html2canvas = vi.fn(() => Promise.resolve({
      width: 100, height: 100, toDataURL: () => 'data:image/jpeg;base64,',
    }));
    retry.dispatchEvent(new Event('load'));
    await flush();

    const jspdf = scriptFor('jspdf');
    expect(jspdf.integrity).toMatch(/^sha512-[A-Za-z0-9+/]{86}==$/);
    expect(jspdf.crossOrigin).toBe('anonymous');
    const save = vi.fn();
    window.jspdf = {
      jsPDF: function jsPDF() {
        return {
          internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
          addImage: vi.fn(),
          addPage: vi.fn(),
          save,
        };
      },
    };
    jspdf.dispatchEvent(new Event('load'));
    await flush();

    expect(save).toHaveBeenCalledWith(`orbit-report-${TODAY.slice(0, 7)}.pdf`);
    expect(document.querySelectorAll('script[src*="html2canvas"]')).toHaveLength(1);
    expect(document.querySelector('#report-picker-modal')).toBeNull();
  });
});

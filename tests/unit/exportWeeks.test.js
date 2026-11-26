/**
 * @vitest-environment jsdom
 *
 * exportWeeks.test.js — BUG-123: the growth report's weekly chart labels each
 * week by its Monday as a local date, in every time zone (it used the UTC date
 * of local midnight: a day early east of UTC, Taiwan included), and the
 * all-time report's file name carries today's local date.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

// Wed 11-25 and Sun 11-29 are one week (Monday 11-23); Mon 11-30 starts the next.
const SESSIONS = ['2026-11-02', '2026-11-25', '2026-11-29', '2026-11-30'].map((date, index) => ({
  id: `s${index}`, date, taskName: '讀書', taskEmoji: '📚', finalXP: 30,
  result: 'valid', value: 'A', completedAt: `${date}T09:00:00`,
}));

vi.mock('../../pwa/js/state.js', () => ({
  state: { user: { name: 'Tester', totalXP: 120, streakDays: 2, titleTemplate: 'rpg' } },
}));
vi.mock('../../pwa/js/storage.js', () => ({ storage: { getSessions: () => SESSIONS } }));

const { showReportPicker } = await import('../../pwa/js/export.js');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const before = process.env.TZ;

afterEach(() => {
  vi.useRealTimers();
  if (before === undefined) delete process.env.TZ;
  else process.env.TZ = before;
});

describe('growth report weeks (BUG-123)', () => {
  it('labels each week by its local Monday, and names the file by the local date, in any time zone', async () => {
    let captured = '';
    window.showToast = vi.fn();
    window.html2canvas = vi.fn(element => {
      captured = element.innerHTML;
      return Promise.resolve({ width: 100, height: 100, toDataURL: () => 'data:image/jpeg;base64,' });
    });
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
    // 2026-11-26 20:00 UTC: already the 27th in Taipei and Kiritimati, still the 26th in Los Angeles.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T20:00:00Z'));
    const expected = { 'Asia/Taipei': '2026-11-27', 'Pacific/Kiritimati': '2026-11-27', UTC: '2026-11-26', 'America/Los_Angeles': '2026-11-26' };
    let first = true;
    for (const [zone, today] of Object.entries(expected)) {
      process.env.TZ = zone;
      expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(zone);
      // Each zone's own report: nothing carried over from the last one.
      captured = '';
      save.mockClear();
      document.body.innerHTML = '';
      showReportPicker();
      document.querySelector('input[name="rp-range"][value="all"]').checked = true;
      document.querySelector('#rp-generate').click();
      await flush();
      if (first) {
        // The libraries load once, then stay.
        document.head.querySelector('script[src*="html2canvas"]').dispatchEvent(new Event('load'));
        await flush();
        document.head.querySelector('script[src*="jspdf"]').dispatchEvent(new Event('load'));
        await flush();
        first = false;
      }
      await flush();
      const holder = document.createElement('div');
      holder.innerHTML = captured;
      const labels = [...holder.querySelectorAll('div')]
        .filter(element => element.getAttribute('style')?.includes('font-size:9px'))
        .map(element => element.textContent);
      expect(labels, zone).toEqual(['11/2', '11/23', '11/30']);
      expect(save.mock.calls, zone).toEqual([[`orbit-report-all-${today}.pdf`]]);
    }
  });
});

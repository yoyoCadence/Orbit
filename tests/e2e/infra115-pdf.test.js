/**
 * infra115-pdf.test.js — INFRA-115
 *
 * The growth report PDF is built with jsPDF 4.x and html2canvas, loaded from
 * cdnjs with SRI when the user asks for a report. The cdnjs URLs are answered
 * with the devDependencies' dist files (the same bytes cdnjs serves, which
 * tests/unit/exportPdfLibs.test.js hashes), so this runs offline and checks:
 *   - the report downloads as a multi-page PDF written by that jsPDF;
 *   - the page's CSP and the SRI accept both files;
 *   - a file that differs from the SRI is refused, and the user is told.
 */

import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { FOCUS_TASK, GUEST_USER, TODAY, mockSupabase, seedStorage } from './support/seed.js';

const require = createRequire(import.meta.url);
const exportJs = readFileSync(new URL('../../pwa/js/export.js', import.meta.url), 'utf8');
const [JSPDF_URL, H2C_URL] = [...exportJs.matchAll(/src:\s*'(https:[^']+)'/g)].map(match => match[1]);
const JSPDF_VERSION = require('jspdf/package.json').version;
const LIBS = {
  [JSPDF_URL]: readFileSync(require.resolve('jspdf/dist/jspdf.umd.min.js')),
  [H2C_URL]: readFileSync(require.resolve('html2canvas/dist/html2canvas.min.js')),
};

const PRO_GUEST = { ...GUEST_USER, isPro: true, proExpiresAt: null };
// Enough rows in the detail table for the report to run past one A4 page.
const SESSIONS = Array.from({ length: 60 }, (_, index) => ({
  id: `session-pdf-${index}`, taskId: FOCUS_TASK.id, date: TODAY,
  completedAt: new Date().toISOString(), result: 'complete',
  impactType: 'task', taskNature: 'growth', category: 'focus', value: 'A',
  durationMinutes: 30, finalXP: 50,
}));

async function serveLibs(page, { tamper = null } = {}) {
  const served = [];
  for (const url of Object.keys(LIBS)) {
    await page.route(url, route => {
      served.push(url);
      const body = url === tamper ? Buffer.concat([LIBS[url], Buffer.from('\n// changed\n')]) : LIBS[url];
      return route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        // crossorigin="anonymous" + SRI: the browser needs a CORS response.
        headers: { 'Access-Control-Allow-Origin': '*' },
        body,
      });
    });
  }
  return served;
}

async function openReportPicker(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockSupabase(page);
  await seedStorage(page, [FOCUS_TASK], SESSIONS, PRO_GUEST);
  await page.goto('/');
  await page.waitForSelector('#main-app:not(.hidden)', { timeout: 8000 });
  await page.click('.nav-item[data-page="settings"]');
  await page.click('#export-pdf-btn');
  await page.waitForSelector('#report-picker-modal');
}

function cspViolations(page) {
  const seen = [];
  page.on('console', message => {
    if (/Content Security Policy/i.test(message.text())) seen.push(message.text());
  });
  return seen;
}

test.describe('INFRA-115 growth report PDF', () => {
  test('downloads a multi-page PDF written by the upgraded jsPDF', async ({ page }) => {
    test.setTimeout(45_000);
    const served = await serveLibs(page);
    const violations = cspViolations(page);
    await openReportPicker(page);

    const download = page.waitForEvent('download', { timeout: 30_000 });
    await page.click('#rp-generate');
    const file = await download;

    expect(file.suggestedFilename()).toBe(`orbit-report-${TODAY.slice(0, 7)}.pdf`);
    const pdf = readFileSync(await file.path()).toString('latin1');
    expect(pdf.startsWith('%PDF-')).toBe(true);
    expect(pdf).toContain(`/Producer (jsPDF ${JSPDF_VERSION})`);
    expect(pdf.match(/\/Type \/Page\b/g)?.length ?? 0).toBeGreaterThan(1);
    expect(pdf).toContain('/Subtype /Image');
    expect(served.sort()).toEqual(Object.keys(LIBS).sort());
    expect(violations).toEqual([]);
    await expect(page.locator('#report-picker-modal')).toHaveCount(0);
  });

  test('refuses a jsPDF that differs from its SRI, and says so', async ({ page }) => {
    await serveLibs(page, { tamper: JSPDF_URL });
    await openReportPicker(page);
    const downloads = [];
    page.on('download', download => downloads.push(download));

    await page.click('#rp-generate');

    await expect(page.locator('.toast').filter({ hasText: 'PDF 產生失敗' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#rp-generate')).toBeEnabled();
    expect(await page.evaluate(() => typeof window.jspdf)).toBe('undefined');
    expect(downloads).toEqual([]);
  });
});

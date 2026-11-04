/**
 * exportPdfLibs.test.js — INFRA-115
 *
 * js/export.js loads jsPDF and html2canvas from cdnjs with SRI. The versions
 * are pinned as devDependencies so the hashes can be checked here: cdnjs
 * serves the npm packages' dist files byte for byte (true of jsPDF 2.5.1 and
 * html2canvas 1.4.1, whose published SRI equals the npm files' sha512). An
 * upgrade has to change the devDependency, the URL and the hash together;
 * csp.test.js then requires the same URL in the CSP.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const exportJs = read('pwa/js/export.js');
const packageJson = JSON.parse(read('package.json'));

function cdnLib(name) {
  const match = new RegExp(`const ${name} = \\{\\s*src:\\s*'([^']+)',\\s*integrity:\\s*'([^']+)'`).exec(exportJs);
  expect(match, name).not.toBeNull();
  return { src: match[1], integrity: match[2] };
}

const LIBS = [
  { name: 'JSPDF', pkg: 'jspdf', dist: 'dist/jspdf.umd.min.js' },
  { name: 'H2C', pkg: 'html2canvas', dist: 'dist/html2canvas.min.js' },
];

describe('INFRA-115 PDF libraries loaded from cdnjs', () => {
  for (const { name, pkg, dist } of LIBS) {
    it(`${pkg}: the URL, the hash and the devDependency name the same file`, () => {
      const { src, integrity } = cdnLib(name);
      const version = packageJson.devDependencies[pkg];
      expect(version, 'pinned exactly').toMatch(/^\d+\.\d+\.\d+$/);
      expect(require(`${pkg}/package.json`).version).toBe(version);
      const file = dist.split('/').pop();
      expect(src).toBe(`https://cdnjs.cloudflare.com/ajax/libs/${pkg}/${version}/${file}`);
      const bytes = readFileSync(require.resolve(`${pkg}/${dist}`));
      expect(integrity).toBe(`sha512-${createHash('sha512').update(bytes).digest('base64')}`);
    });
  }

  it('uses jsPDF 4 or later (2.5.1 had critical and high advisories)', () => {
    expect(Number(packageJson.devDependencies.jspdf.split('.')[0])).toBeGreaterThanOrEqual(4);
  });

  it('keeps to the jsPDF API that 4.x still has', () => {
    // A future major could drop these; the e2e test builds a real PDF with them.
    const { jsPDF } = require('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 0);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 0);
    for (const method of ['addImage', 'addPage', 'save']) expect(typeof pdf[method], method).toBe('function');
    for (const call of ['new jsPDF(\'p\', \'mm\', \'a4\')', 'pdf.addImage(img, \'JPEG\'', 'pdf.addPage()', 'pdf.save(fileName)']) {
      expect(exportJs, call).toContain(call);
    }
  });
});

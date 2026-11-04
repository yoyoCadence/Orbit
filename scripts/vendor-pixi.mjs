import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeVendoredText, wrapUnsafeEval } from './vendorPixiLib.mjs';

const EXPECTED_VERSION = '8.18.1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'node_modules', 'pixi.js');
const packageJson = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));

if (packageJson.version !== EXPECTED_VERSION) {
  throw new Error(`Expected pixi.js ${EXPECTED_VERSION}, found ${packageJson.version || 'unknown'}`);
}

const outputRoot = path.join(root, 'pwa', 'vendor');
await mkdir(outputRoot, { recursive: true });
await Promise.all([
  vendorText(path.join(packageRoot, 'dist', 'pixi.min.mjs'), path.join(outputRoot, 'pixi.js')),
  vendorText(path.join(packageRoot, 'LICENSE'), path.join(outputRoot, 'pixi.LICENSE.txt')),
  vendorUnsafeEval(
    path.join(packageRoot, 'dist', 'packages', 'unsafe-eval.min.js'),
    path.join(outputRoot, 'pixi-unsafe-eval.js'),
  ),
]);

console.log(`Vendored pixi.js ${EXPECTED_VERSION} to pwa/vendor/`);

async function vendorText(source, destination) {
  const content = await readFile(source, 'utf8');
  await writeFile(destination, normalizeVendoredText(content), 'utf8');
}

async function vendorUnsafeEval(source, destination) {
  await writeFile(destination, wrapUnsafeEval(await readFile(source, 'utf8'), EXPECTED_VERSION), 'utf8');
}

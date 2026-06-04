#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = new Set(process.argv.slice(2));
const repoRoot = process.cwd();
const modulePath = path.join(repoRoot, 'pwa/js/personalSpace/idleWindow/index.js');

if (!existsSync(modulePath)) {
  console.error('Run this script from the Orbit repository root.');
  console.error(`Missing module: ${modulePath}`);
  process.exit(2);
}

const {
  buildIdleWindowVariantGenerationQueue,
  getIdleWindowVariantReadiness,
  IDLE_WINDOW_VARIANT_REFERENCE_PLAN,
} = await import(pathToFileURL(modulePath).href);

const queue = buildIdleWindowVariantGenerationQueue();
const completed = IDLE_WINDOW_VARIANT_REFERENCE_PLAN
  .map(plan => ({
    ...plan,
    readiness: getIdleWindowVariantReadiness(plan.assetId),
  }))
  .filter(item => item.readiness.ready)
  .sort((a, b) => a.priority - b.priority || a.assetId.localeCompare(b.assetId));

const report = {
  requiredVariants: ['front', 'left-wall-flush', 'right-wall-flush'],
  completed: completed.map(item => ({
    assetId: item.assetId,
    priority: item.priority,
    layoutCritical: item.layoutCritical,
  })),
  queue: queue.map(item => ({
    priority: item.priority,
    assetId: item.assetId,
    assetLabel: item.assetLabel,
    referencePath: item.referencePath,
    missingVariantIds: item.missingVariantIds,
    nonFinalVariantIds: item.nonFinalVariantIds,
    layoutCritical: item.layoutCritical,
    reason: item.reason,
  })),
};

if (args.has('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printMarkdown(report);
}

if (args.has('--fail-on-missing') && report.queue.length) {
  process.exit(1);
}

function printMarkdown(data) {
  console.log('# Idle Window Variant Audit');
  console.log('');
  console.log(`Completed: ${data.completed.length}`);
  console.log(`Queued: ${data.queue.length}`);
  console.log('');

  if (data.completed.length) {
    console.log('## Completed');
    console.log('');
    console.log('| Priority | Asset | Layout critical |');
    console.log('|---:|---|---|');
    data.completed.forEach(item => {
      console.log(`| ${item.priority} | \`${item.assetId}\` | ${item.layoutCritical ? 'yes' : 'no'} |`);
    });
    console.log('');
  }

  if (!data.queue.length) {
    console.log('No queued variant work.');
    return;
  }

  console.log('## Queue');
  console.log('');
  console.log('| Priority | Asset | Reference | Missing | Non-final | Critical |');
  console.log('|---:|---|---|---|---|---|');
  data.queue.forEach(item => {
    console.log([
      `| ${item.priority}`,
      `\`${item.assetId}\``,
      `\`${item.referencePath}\``,
      item.missingVariantIds.length ? item.missingVariantIds.map(id => `\`${id}\``).join(', ') : '-',
      item.nonFinalVariantIds.length ? item.nonFinalVariantIds.map(id => `\`${id}\``).join(', ') : '-',
      item.layoutCritical ? 'yes' : 'no',
    ].join(' | ') + ' |');
  });
}

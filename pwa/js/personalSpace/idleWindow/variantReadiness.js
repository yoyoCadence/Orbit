import { idleWindowAssetRegistry } from './assetRegistry.js';

export const IDLE_WINDOW_REQUIRED_DIRECTION_VARIANTS = Object.freeze([
  'front',
  'left-wall-flush',
  'right-wall-flush',
]);

export const IDLE_WINDOW_VARIANT_REFERENCE_PLAN = Object.freeze([
  variantPlan('office-corner-desk-v3', {
    priority: 0,
    layoutCritical: true,
    reason: 'Primary work anchor and camera-profile proof object.',
  }),
  variantPlan('office-leather-sofa', {
    priority: 1,
    layoutCritical: true,
    reason: 'Large floor furniture; wall alignment and depth read strongly affect the room composition.',
  }),
  variantPlan('office-low-coffee-table', {
    priority: 2,
    layoutCritical: true,
    reason: 'Large tabletop support surface; perspective must match sofa and floor angle.',
  }),
  variantPlan('office-pattern-rug', {
    priority: 3,
    layoutCritical: true,
    reason: 'Very sensitive layer-order and perspective object; wrong angle reads as a floor mismatch.',
  }),
  variantPlan('office-trophy-display', {
    priority: 4,
    layoutCritical: true,
    reason: 'Tall display furniture with shelf surfaces; side variants are needed for wall placement.',
  }),
  variantPlan('office-shelf', {
    priority: 5,
    layoutCritical: true,
    reason: 'Existing shelf uses a mirror-test variant; final camera profiles need authored sides.',
  }),
  variantPlan('office-tall-bookcase', {
    priority: 6,
    layoutCritical: false,
    reason: 'Library asset expected to become a major wall/floor storage piece.',
  }),
  variantPlan('office-filing-cabinet', {
    priority: 7,
    layoutCritical: false,
    reason: 'Library asset expected to sit against side walls in denser office layouts.',
  }),
]);

export function buildIdleWindowVariantGenerationQueue(registry = idleWindowAssetRegistry) {
  return IDLE_WINDOW_VARIANT_REFERENCE_PLAN
    .map(plan => buildVariantQueueItem(plan, registry.props?.[plan.assetId]))
    .filter(Boolean)
    .filter(item => !item.ready)
    .sort((a, b) => a.priority - b.priority || a.assetId.localeCompare(b.assetId));
}

export function getIdleWindowVariantReadiness(assetOrId, registry = idleWindowAssetRegistry) {
  const asset = typeof assetOrId === 'string' ? registry.props?.[assetOrId] : assetOrId;
  if (!asset) {
    return {
      ready: false,
      presentVariantIds: [],
      missingVariantIds: [...IDLE_WINDOW_REQUIRED_DIRECTION_VARIANTS],
      nonFinalVariantIds: [],
    };
  }

  const variants = asset.variants || [];
  const presentVariantIds = variants.map(variant => variant.id);
  const missingVariantIds = IDLE_WINDOW_REQUIRED_DIRECTION_VARIANTS
    .filter(variantId => !presentVariantIds.includes(variantId));
  const nonFinalVariantIds = variants
    .filter(variant => IDLE_WINDOW_REQUIRED_DIRECTION_VARIANTS.includes(variant.id))
    .filter(variant => variant.status !== 'perspective-correct')
    .map(variant => variant.id);

  return {
    ready: missingVariantIds.length === 0 && nonFinalVariantIds.length === 0,
    presentVariantIds,
    missingVariantIds,
    nonFinalVariantIds,
  };
}

function buildVariantQueueItem(plan, asset) {
  if (!asset) return null;
  const readiness = getIdleWindowVariantReadiness(asset);
  const referenceVariant = asset.variants?.find(variant => variant.id === plan.referenceVariantId)
    || asset.variants?.[0];

  return {
    ...plan,
    assetLabel: asset.label,
    referencePath: referenceVariant?.path || asset.path,
    requiredVariantIds: [...IDLE_WINDOW_REQUIRED_DIRECTION_VARIANTS],
    presentVariantIds: readiness.presentVariantIds,
    missingVariantIds: readiness.missingVariantIds,
    nonFinalVariantIds: readiness.nonFinalVariantIds,
    ready: readiness.ready,
  };
}

function variantPlan(assetId, options) {
  return {
    assetId,
    referenceVariantId: 'front',
    ...options,
  };
}

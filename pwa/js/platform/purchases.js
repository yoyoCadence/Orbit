export function getPurchaseAdapterStatus() {
  return {
    enabled: false,
    provider: 'placeholder',
    reason: 'Phase 1 reserves the interface only.',
  };
}

export async function listAvailableProducts() {
  return [];
}

export async function beginPurchase() {
  return {
    ok: false,
    reason: 'not-implemented',
  };
}

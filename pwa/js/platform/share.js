export function supportsNativeShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

export async function shareContent(payload) {
  if (!supportsNativeShare()) {
    return { shared: false, reason: 'unsupported' };
  }

  try {
    await navigator.share(payload);
    return { shared: true, reason: 'native-share' };
  } catch (error) {
    return { shared: false, reason: error?.name || 'share-failed' };
  }
}

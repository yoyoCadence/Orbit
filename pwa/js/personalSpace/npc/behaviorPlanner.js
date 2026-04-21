export function planCompanionBehavior(context = {}) {
  return {
    mode: 'rule-based-placeholder',
    context,
    action: 'observe',
  };
}

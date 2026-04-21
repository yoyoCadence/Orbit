export function createAnimationController() {
  return {
    play(animationName) {
      return { status: 'placeholder', animationName };
    },
  };
}

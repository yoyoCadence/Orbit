export function createSceneRuntime(container, sceneModel = {}) {
  let mounted = false;

  return {
    mount() {
      if (!container || mounted) return;
      mounted = true;
      container.innerHTML = `
        <div class="space-scene-placeholder">
          <div class="space-scene-grid"></div>
          <div class="space-scene-copy">
            <strong>${sceneModel.label || 'Personal Space Runtime'}</strong>
            <span>Scene runtime placeholder reserved for future 2D/3D rendering.</span>
          </div>
        </div>
      `;
    },
    destroy() {
      if (!container || !mounted) return;
      mounted = false;
      container.innerHTML = '';
    },
  };
}

// Local-only proof photo capture and compression adapter.
// Images are stored in localStorage under 'orbit_proof_<sessionId>' and never synced.

export function supportsProofCapture() {
  return typeof window !== 'undefined' && typeof FileReader !== 'undefined';
}

// Returns Promise<string> — compressed base64 JPEG data URL (≤320px, quality 0.5)
export function compressImage(file, maxDim = 320, quality = 0.5) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = evt => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.round(img.width  * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width  = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('canvas-unavailable')); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          reject(err);
        }
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

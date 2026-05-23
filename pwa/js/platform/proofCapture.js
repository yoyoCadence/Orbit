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
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

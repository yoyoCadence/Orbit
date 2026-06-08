// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compressImage, supportsProofCapture } from '../../pwa/js/platform/proofCapture.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('supportsProofCapture', () => {
  it('returns true in a browser environment with FileReader', () => {
    // jsdom provides both window and FileReader
    expect(supportsProofCapture()).toBe(true);
  });

  it('returns false when FileReader is not available', () => {
    vi.stubGlobal('FileReader', undefined);
    expect(supportsProofCapture()).toBe(false);
  });
});

describe('compressImage', () => {
  let mockCanvas, mockCtx;

  beforeEach(() => {
    mockCtx = { drawImage: vi.fn() };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => mockCtx),
      toDataURL: vi.fn(() => 'data:image/jpeg;base64,COMPRESSED'),
    };

    vi.spyOn(document, 'createElement').mockImplementation(tag => {
      if (tag === 'canvas') return mockCanvas;
      // Let other elements (e.g. 'img') fall through
      return Object.getPrototypeOf(document).createElement.call(document, tag);
    });

    // Mock FileReader to fire onload synchronously with a fake data URL
    const FakeFileReader = vi.fn(function () {
      this.readAsDataURL = vi.fn((_file) => {
        Promise.resolve().then(() => {
          this.onload?.({ target: { result: 'data:image/png;base64,FAKE' } });
        });
      });
    });
    vi.stubGlobal('FileReader', FakeFileReader);

    // Mock Image so onload fires after src is set
    const FakeImage = vi.fn(function () {
      this.width  = 640;
      this.height = 480;
      Object.defineProperty(this, 'src', {
        set: (_v) => { Promise.resolve().then(() => this.onload?.()); },
      });
    });
    vi.stubGlobal('Image', FakeImage);
  });

  it('resolves to a JPEG data URL string', async () => {
    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
    const result = await compressImage(file);
    expect(typeof result).toBe('string');
    expect(result.startsWith('data:image/jpeg')).toBe(true);
  });

  it('scales image down so the long edge equals maxDim', async () => {
    // Image is 640×480; maxDim=320 → scale 0.5 → 320×240
    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
    await compressImage(file, 320);
    expect(mockCanvas.width).toBe(320);
    expect(mockCanvas.height).toBe(240);
  });

  it('does not upscale images smaller than maxDim', async () => {
    // Override Image size to be smaller than maxDim
    const SmallImage = vi.fn(function () {
      this.width  = 100;
      this.height = 80;
      Object.defineProperty(this, 'src', {
        set: (_v) => { Promise.resolve().then(() => this.onload?.()); },
      });
    });
    vi.stubGlobal('Image', SmallImage);

    const file = new File([''], 'small.jpg', { type: 'image/jpeg' });
    await compressImage(file, 320);
    // scale = min(1, 320/100) = 1 → dimensions unchanged
    expect(mockCanvas.width).toBe(100);
    expect(mockCanvas.height).toBe(80);
  });
});

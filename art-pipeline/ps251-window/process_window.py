"""PS-251B: turn the window renders into runtime overlays.

Usage:
    python3 process_window.py <render_dir> [--write-runtime]

Reads <render_dir>/exterior-<band>.png (Q style, 1536 x 1024) and
exterior-<band>-pixel.png (384 x 256) from render_window.py and writes:

- workspace/window/exterior-<band>.webp: lossy WebP with alpha (a VP8X file,
  which art-pipeline/ps242/build-manifest.mjs reads);
- workspace/pixel/window/exterior-<band>.png: the pixel render with its colours
  reduced like the pixel room and every art pixel scaled up to 4 x 4, with a
  hard alpha edge;
- outputs.json: the size and SHA-256 of each file.

Every overlay is checked to be opaque only inside the window. Previews are
written by preview_window.py.
"""
import argparse
import hashlib
import io
import json
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PWA = os.path.join(REPO, 'pwa')
OUTPUTS = os.path.join(HERE, 'outputs.json')
V2 = 'assets/personal-space/v2'
BANDS = ('morning', 'evening')
FRAME = (1536, 1024)
SCALE = 4
# The window of the canonical camera (the right wall). Anything opaque outside
# it means a holdout is missing.
WINDOW = (1200, 100, 1536, 620)
PIXEL_COLOURS = 32
WEBP_QUALITY = 86


def q_path(band):
    return f'{V2}/workspace/window/exterior-{band}.webp'


def pixel_path(band):
    return f'{V2}/workspace/pixel/window/exterior-{band}.png'


def check_window(im, scale=1):
    left, top, right, bottom = (round(v / scale) for v in WINDOW)
    bbox = im.getchannel('A').getbbox()
    if bbox is None:
        raise SystemExit('overlay is empty')
    if bbox[0] < left or bbox[1] < top or bbox[2] > right or bbox[3] > bottom:
        raise SystemExit(f'overlay reaches outside the window: {bbox}')


def encode_q(im):
    buffer = io.BytesIO()
    im.save(buffer, 'WEBP', quality=WEBP_QUALITY, method=6)
    blob = buffer.getvalue()
    if blob[12:16] != b'VP8X':
        raise SystemExit('expected a lossy WebP with alpha (VP8X)')
    return blob


def encode_pixel(im):
    alpha = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    # Only the window's colours count; what is transparent is stored as black,
    # so it compresses to almost nothing.
    opaque = Image.new('RGB', im.size)
    opaque.paste(im.convert('RGB'), mask=alpha)
    rgb = opaque.quantize(colors=PIXEL_COLOURS, method=Image.Quantize.MEDIANCUT,
                          dither=Image.Dither.NONE).convert('RGB')
    rgb.putalpha(alpha)
    big = rgb.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)
    buffer = io.BytesIO()
    big.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--write-runtime', action='store_true')
    args = parser.parse_args()

    files = {}
    for band in BANDS:
        q = Image.open(os.path.join(args.render_dir, f'exterior-{band}.png')).convert('RGBA')
        if q.size != FRAME:
            raise SystemExit(f'{band}: Q render is {q.size}, expected {FRAME}')
        check_window(q)
        files[q_path(band)] = encode_q(q)
        pixel = Image.open(os.path.join(args.render_dir, f'exterior-{band}-pixel.png')).convert('RGBA')
        if pixel.size != (FRAME[0] // SCALE, FRAME[1] // SCALE):
            raise SystemExit(f'{band}: pixel render is {pixel.size}')
        check_window(pixel, SCALE)
        files[pixel_path(band)] = encode_pixel(pixel)

    for path, blob in files.items():
        print(f'{path}: {len(blob)} B')
        if args.write_runtime:
            target = os.path.join(PWA, path)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(blob)
    if args.write_runtime:
        data = {
            'schemaVersion': 1,
            'taskId': 'PS-251B',
            'files': {path: {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
                      for path, blob in sorted(files.items())},
        }
        with open(OUTPUTS, 'w', encoding='utf-8') as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write('\n')


if __name__ == '__main__':
    main()

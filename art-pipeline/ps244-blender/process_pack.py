"""Turn PS-244 Blender renders into runtime assets, placements and previews.

Usage:
    python3 process_pack.py <render_dir> [--write-runtime] [--preview-dir DIR]
                            [--lighting day|night]

- Composites room.png over the designed backdrop and encodes the background
  WebP (1536x1024).
- Trims every prop render to its solid core plus a shadow margin, drops
  sampling noise below ALPHA_FLOOR, and derives the runtime placement
  (centre x, bottom y, width; all % of the frame) from the trimmed box. A prop
  drawn with that placement lands pixel-exact on the background.
- Writes placements.json next to this script and rewrites PROP_DEFINITIONS in
  assetManifest.js from it (tests/unit/ps244WorkspacePlacements.test.js keeps
  the two in sync).
- Builds one composite preview per Workspace Upgrade phase, including the
  protagonist and Companion at their runtime placements, for visual QA.
- --lighting night (PS-250E1) processes a night render of the same scene:
  the background and props get a -night suffix, the placements go under
  "night" in placements.json (each night prop has its own trim box, since its
  shadows fall another way) and the day data is kept as it is. Previews are
  night-phase-XXX.jpg.

Requires Pillow and numpy.
"""
import argparse
import json
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PWA = os.path.join(REPO, 'pwa')
V2 = 'assets/personal-space/v2'
ASSET_MANIFEST = os.path.join(PWA, 'js', 'personalSpace', 'v2', 'content', 'assetManifest.js')
BACKGROUND_PATHS = {
    'day': f'{V2}/workspace/backgrounds/building-formal-workstation-room-v2.webp',
    'night': f'{V2}/workspace/backgrounds/building-formal-workstation-room-v2-night.webp',
}
PROP_DIR = f'{V2}/workspace/props'
PLACEMENTS = os.path.join(HERE, 'placements.json')
FRAME = (1536, 1024)
ALPHA_FLOOR = 14          # below this the catcher output is sampling noise
CORE_ALPHA = 200          # solid geometry
SHADOW_MARGIN = 0.25      # of frame width; low sun casts long shadows
SPECK_WINDOW = 7          # px; isolated noise below this density is dropped
SPECK_DENSITY = 0.35

# Phases and draw order for PROP_DEFINITIONS in assetManifest.js. z follows
# depth from the camera: the chair stands in front of the desk, the monitors,
# the keyboard and the lamp, so it is drawn after all of them.
PROPS = {
    'corner-desk':    {'min': 25,  'max': 100, 'z': 24},
    'office-chair':   {'min': 25,  'max': 100, 'z': 30},
    'office-shelf':   {'min': 50,  'max': 100, 'z': 22},
    'desk-lamp':      {'min': 50,  'max': 100, 'z': 29},
    'planning-board': {'min': 75,  'max': 100, 'z': 10},
    'single-monitor': {'min': 75,  'max': 99,  'z': 28},
    'dual-monitor':   {'min': 100, 'max': 100, 'z': 28},
    'office-plant':   {'min': 100, 'max': 100, 'z': 23},
}
# Mirrors protagonist/Companion placements in getWorkspaceSceneAssets(). The
# committed day previews predate PS-250B and show the PS-242 pixel pair; night
# previews show the default Q-style pair.
CHARACTERS = {
    'protagonist': {'path': {'day': f'{V2}/characters/protagonist/player-default-idle-left.png',
                             'night': f'{V2}/characters/toon/protagonist/office-idle-left.webp'},
                    'x': lambda p: 58 if p >= 25 else 51, 'y': 87, 'width': 24, 'anchor': 'center-bottom'},
    'companion': {'path': {'day': f'{V2}/characters/companion/orbit-guide-observe.png',
                           'night': f'{V2}/characters/toon/companion/orbit-observe.webp'},
                  'x': lambda p: 69 if p >= 75 else 73, 'y': 73, 'width': 13, 'anchor': 'center'},
}
PHASES = (0, 25, 50, 75, 100)
# Mirrors .orbit-window-achievement-frame in pwa/assets/style.css (HW-105). The
# DOM frame is drawn over every phase, so previews show it to catch overlaps.
# Size is its 86px cap on the 960px logical frame; 4:3 plus 3px padding.
PHOTO_FRAME = {'left': 47, 'top': 20, 'width': 86 / 960 * 100}
# Mirrors the frame's brightness filter under the night room (orbitWindow.js).
PHOTO_FRAME_NIGHT_BRIGHTNESS = 0.65


def backdrop(size):
    """Soft navy stage behind the cut-away diorama."""
    w, h = size
    base = Image.new('RGB', size, (14, 19, 41))
    glow = Image.new('L', size, 0)
    ImageDraw.Draw(glow).ellipse((int(w * 0.08), int(h * 0.05), int(w * 0.92), int(h * 1.05)), fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(w * 0.08))
    return Image.composite(Image.new('RGB', size, (36, 48, 92)), base, glow)


def load_frame(path):
    im = Image.open(path).convert('RGBA')
    return im if im.size == FRAME else im.resize(FRAME, Image.LANCZOS)


def trim_prop(im):
    rgba = np.array(im)
    alpha = rgba[:, :, 3]
    core = np.argwhere(alpha >= CORE_ALPHA)
    if not len(core):
        raise ValueError('prop render has no solid pixels')
    (top, left), (bottom, right) = core.min(0), core.max(0)
    margin = int(FRAME[0] * SHADOW_MARGIN)
    y0, y1 = max(0, top - margin), min(FRAME[1] - 1, bottom + margin)
    x0, x1 = max(0, left - margin), min(FRAME[0] - 1, right + margin)
    window = alpha[y0:y1 + 1, x0:x1 + 1]
    # Real shadows are contiguous; catcher sampling noise is isolated specks.
    # Solid geometry is always kept, so thin parts (a lamp arm, a monitor pole)
    # and convex corners survive the density test.
    keep = (window >= ALPHA_FLOOR) & (box_mean(window >= ALPHA_FLOOR, SPECK_WINDOW) >= SPECK_DENSITY)
    keep |= window >= CORE_ALPHA
    kept = np.argwhere(keep)
    (ty, tx), (by, bx) = kept.min(0), kept.max(0)
    box = tuple(int(v) for v in (x0 + tx, y0 + ty, x0 + bx + 1, y0 + by + 1))
    cropped = rgba[box[1]:box[3], box[0]:box[2]].copy()
    cropped[:, :, 3][~keep[ty:by + 1, tx:bx + 1]] = 0
    return Image.fromarray(cropped, 'RGBA'), box


def box_mean(mask, size):
    """Mean of a boolean mask over a size×size neighbourhood (edge-padded)."""
    pad = size // 2
    padded = np.pad(mask.astype(np.float32), pad, mode='edge')
    integral = padded.cumsum(0).cumsum(1)
    integral = np.pad(integral, ((1, 0), (1, 0)))
    h, w = mask.shape
    total = (integral[size:size + h, size:size + w] - integral[:h, size:size + w]
             - integral[size:size + h, :w] + integral[:h, :w])
    return total / (size * size)


def placement_for(box):
    left, top, right, bottom = box
    return {
        'x': round((left + right) / 2 / FRAME[0] * 100, 3),
        'y': round(bottom / FRAME[1] * 100, 3),
        'width': round((right - left) / FRAME[0] * 100, 3),
    }


def place(canvas, sprite, x, y, width, anchor='center-bottom'):
    w = round(canvas.width * width / 100)
    h = round(sprite.height * w / sprite.width)
    sprite = sprite.resize((w, h), Image.LANCZOS)
    cx, cy = canvas.width * x / 100, canvas.height * y / 100
    top = cy - h / 2 if anchor == 'center' else cy - h
    canvas.alpha_composite(sprite, (round(cx - w / 2), round(top)))


def draw_photo_frame(canvas, brightness=1.0):
    w = canvas.width * PHOTO_FRAME['width'] / 100
    left, top = canvas.width * PHOTO_FRAME['left'] / 100, canvas.height * PHOTO_FRAME['top'] / 100
    pad = w * 3 / 86
    draw = ImageDraw.Draw(canvas)
    dim = lambda rgb: tuple(round(c * brightness) for c in rgb)
    draw.rectangle((left, top, left + w, top + w * 3 / 4 + 2 * pad), fill=dim((214, 165, 92)))
    draw.rectangle((left + pad, top + pad, left + w - pad, top + w * 3 / 4 + pad), fill=dim((233, 223, 198)))


def prop_path(prop_id, lighting):
    return f"{PROP_DIR}/{prop_id}{'-night' if lighting == 'night' else ''}.png"


def write_placements(lighting, placements):
    """Writes one lighting's placements and keeps the other's as it is."""
    try:
        with open(PLACEMENTS, encoding='utf-8') as fh:
            data = json.load(fh)
    except FileNotFoundError:
        data = {}
    section = {
        'background': BACKGROUND_PATHS[lighting],
        'props': {pid: {'path': prop_path(pid, lighting), **pl} for pid, pl in placements.items()},
    }
    if lighting == 'day':
        data = {'frame': {'width': FRAME[0], 'height': FRAME[1]}, **section,
                **({'night': data['night']} if 'night' in data else {})}
    else:
        data[lighting] = section
    with open(PLACEMENTS, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')
    return data


def sync_asset_manifest(data):
    """Rewrites PROP_DEFINITIONS from both lightings in placements.json."""
    day, night = data['props'], data['night']['props']
    lines = ['const PROP_DEFINITIONS = Object.freeze([']
    for pid, spec in PROPS.items():
        pl, npl = day[pid], night[pid]
        place = f"{{ x: {pl['x']}, y: {pl['y']}, width: {pl['width']}, z: {spec['z']} }}"
        night_place = f"{{ x: {npl['x']}, y: {npl['y']}, width: {npl['width']} }}"
        until = f", {spec['max']}" if spec['max'] != 100 else ''
        lines.append(f"  prop('{pid}', {spec['min']}, {place},")
        lines.append(f"    {night_place}{until}),")
    lines.append(']);')
    with open(ASSET_MANIFEST, encoding='utf-8') as fh:
        source = fh.read()
    updated, count = re.subn(r'const PROP_DEFINITIONS = Object\.freeze\(\[\n.*?\n\]\);',
                             '\n'.join(lines), source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError('PROP_DEFINITIONS block not found in assetManifest.js')
    with open(ASSET_MANIFEST, 'w', encoding='utf-8') as fh:
        fh.write(updated)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--write-runtime', action='store_true')
    parser.add_argument('--preview-dir', default=os.path.join(HERE, 'previews'))
    parser.add_argument('--lighting', choices=('day', 'night'), default='day')
    args = parser.parse_args()
    lighting = args.lighting

    room = load_frame(os.path.join(args.render_dir, 'room.png'))
    background = backdrop(FRAME).convert('RGBA')
    background.alpha_composite(room)
    background = background.convert('RGB')

    sprites, placements = {}, {}
    for prop_id in PROPS:
        sprite, box = trim_prop(load_frame(os.path.join(args.render_dir, f'{prop_id}.png')))
        sprites[prop_id] = sprite
        placements[prop_id] = {**placement_for(box), 'z': PROPS[prop_id]['z'], 'bbox': list(box)}

    if args.write_runtime:
        bg_out = os.path.join(PWA, *BACKGROUND_PATHS[lighting].split('/'))
        os.makedirs(os.path.dirname(bg_out), exist_ok=True)
        background.save(bg_out, 'WEBP', quality=86, method=6)
        prop_out = os.path.join(PWA, *PROP_DIR.split('/'))
        os.makedirs(prop_out, exist_ok=True)
        for prop_id, sprite in sprites.items():
            sprite.save(os.path.join(PWA, *prop_path(prop_id, lighting).split('/')), optimize=True)
        data = write_placements(lighting, placements)
        if 'night' in data:
            sync_asset_manifest(data)

    os.makedirs(args.preview_dir, exist_ok=True)
    for progress in PHASES:
        canvas = background.convert('RGBA')
        layers = [(PROPS[pid]['z'], pid) for pid in PROPS
                  if PROPS[pid]['min'] <= progress <= PROPS[pid]['max']]
        for _, pid in sorted(layers):
            pl = placements[pid]
            place(canvas, sprites[pid], pl['x'], pl['y'], pl['width'])
        for spec in CHARACTERS.values():
            sprite = Image.open(os.path.join(PWA, *spec['path'][lighting].split('/'))).convert('RGBA')
            place(canvas, sprite, spec['x'](progress), spec['y'], spec['width'], spec['anchor'])
        draw_photo_frame(canvas, PHOTO_FRAME_NIGHT_BRIGHTNESS if lighting == 'night' else 1.0)
        prefix = '' if lighting == 'day' else f'{lighting}-'
        canvas.convert('RGB').resize((768, 512), Image.LANCZOS).save(
            os.path.join(args.preview_dir, f'{prefix}phase-{progress:03d}.jpg'), quality=86)
    print(json.dumps({pid: {k: v for k, v in pl.items() if k != 'bbox'} for pid, pl in placements.items()}, indent=1))


if __name__ == '__main__':
    main()

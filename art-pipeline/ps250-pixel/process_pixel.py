"""Turn the PS-250D quarter-size renders into the runtime pixel set.

Usage:
    python3 process_pixel.py <render_dir> [--write-runtime] [--preview-dir DIR]
                             [--lighting day|night]

- Room: composited over the PS-244 backdrop, reduced to its own 64-colour
  palette, scaled x4 with nearest neighbour to the 1536 x 1024 frame.
- Props: cropped to the Q-style prop's trim box (placements.json, divided by
  4 and rounded outward), scaled x4, then cut to exactly that box, so each
  pixel prop has the same size and runtime placement as its Q-style twin.
  Solid parts get the prop's own 32-colour palette; shadows become one navy
  tone at two opacities, with isolated noise pixels dropped.
- Characters: made from the committed PS-250C Q-style sprites, reduced to
  the room's pixel size (the protagonist is drawn ~369 room px wide, so 92
  art pixels; the Companion ~200, so 50), with a little contrast and
  sharpening, the character's own palette, hard alpha, a one-pixel dark
  outline and a pixel contact shadow under each protagonist, then scaled x4
  (368 and 200 px canvases). The framing is the PS-250C one, so the anchors
  and runtime placements are the same as the Q style. Rendering the rigs at
  this size directly lost the faces; reducing the full-size sprites keeps
  the eyes and outlines readable (the approach of the approved prototype).
- With --write-runtime, writes the PNGs under pwa/ and outputs.json (sizes
  and SHA-256). Previews are always written, by default into previews/.
- --lighting night (PS-250E1) processes only the night room and props
  (<render_dir>/scene-night/), cropped to the Q-style night trim boxes
  ("night" in placements.json), with a -night suffix. outputs.json keeps the
  day files and characters; the characters have no night version.

Requires Pillow and numpy.
"""
import argparse
import hashlib
import io
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PWA = os.path.join(REPO, 'pwa')
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-characters'))
import catalog  # noqa: E402
from process_pack import PROPS, backdrop  # noqa: E402

SCALE = 4
FRAME = (1536, 1024)
V2 = 'assets/personal-space/v2'
ROOM_PATHS = {
    'day': f'{V2}/workspace/pixel/backgrounds/building-formal-workstation-room-pixel.png',
    'night': f'{V2}/workspace/pixel/backgrounds/building-formal-workstation-room-pixel-night.png',
}
PROP_DIR = f'{V2}/workspace/pixel/props'
SCENE_DIRS = {'day': 'scene', 'night': 'scene-night'}
OUTPUTS = os.path.join(HERE, 'outputs.json')
PROTAGONIST_DIR = f'{V2}/characters/pixel/protagonist'
COMPANION_DIR = f'{V2}/characters/pixel/companion'
PLACEMENTS = os.path.join(REPO, 'art-pipeline', 'ps244-blender', 'placements.json')

ROOM_COLOURS = 64
PROP_COLOURS = 32
PROTAGONIST_COLOURS = 32
COMPANION_COLOURS = 24
PROTAGONIST_GRID = 92        # round(0.24 * 1536 / 4)
COMPANION_GRID = 50          # round(0.13 * 1536 / 4)
OUTLINE_COLOUR = (14, 16, 30)
SOLID_ALPHA = 200            # prop geometry; below this a prop pixel is shadow
SHADOW_FLOOR = 24            # fainter shadow pixels are sampling noise
SHADOW_COLOUR = (11, 16, 34)
SHADOW_LEVELS = (96, 160)    # light and dark shadow opacity
CHARACTER_ALPHA = 110        # hard character edge after reduction
GROUND_Y = 241 / 256
CONTACT_SHADOW = {'rx': 0.13, 'ry': 0.03, 'alpha': 84}
SHEET_BG = (150, 110, 80)
PROTAGONIST_PLACEMENT = {'x': 58, 'y': 87, 'width': 24, 'anchor': 'center-bottom'}
COMPANION_PLACEMENT = {'x': 69, 'y': 73, 'width': 13, 'anchor': 'center'}


def quantize(rgb, colours):
    return rgb.quantize(colors=colours, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')


def upscale(im):
    return im.resize((im.width * SCALE, im.height * SCALE), Image.NEAREST)


def encode(im):
    buffer = io.BytesIO()
    im.save(buffer, 'PNG', optimize=True)
    return buffer.getvalue()


def prop_path(prop_id, lighting):
    return f"{PROP_DIR}/{prop_id}{'-night' if lighting == 'night' else ''}.png"


def process_room(render_dir, lighting='day'):
    room = Image.open(os.path.join(render_dir, SCENE_DIRS[lighting], 'room.png')).convert('RGBA')
    expected = (FRAME[0] // SCALE, FRAME[1] // SCALE)
    if room.size != expected:
        raise SystemExit(f'room render is {room.size}, expected {expected}')
    canvas = backdrop(room.size).convert('RGBA')
    canvas.alpha_composite(room)
    return upscale(quantize(canvas.convert('RGB'), ROOM_COLOURS))


def neighbours(mask):
    padded = np.pad(mask, 1)
    return sum(padded[1 + dy:padded.shape[0] - 1 + dy, 1 + dx:padded.shape[1] - 1 + dx]
               for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx)


def process_prop(render_dir, prop_id, bbox, lighting='day'):
    render = Image.open(os.path.join(render_dir, SCENE_DIRS[lighting], f'{prop_id}.png')).convert('RGBA')
    left, top, right, bottom = bbox
    small_box = (left // SCALE, top // SCALE, math.ceil(right / SCALE), math.ceil(bottom / SCALE))
    rgba = np.array(render.crop(small_box))
    alpha = rgba[:, :, 3]
    solid = alpha >= SOLID_ALPHA
    shadow = (alpha >= SHADOW_FLOOR) & ~solid
    shadow &= neighbours(shadow | solid) >= 3
    out = np.zeros_like(rgba)
    if solid.any():
        # The palette comes from the solid pixels only: transparent and shadow
        # pixels would take palette entries that are never shown.
        solid_rgb = Image.fromarray(rgba[solid][:, :3].reshape(-1, 1, 3))
        out[solid, :3] = np.array(quantize(solid_rgb, PROP_COLOURS)).reshape(-1, 3)
        out[solid, 3] = 255
    out[shadow, :3] = SHADOW_COLOUR
    out[shadow, 3] = np.where(alpha[shadow] >= 110, SHADOW_LEVELS[1], SHADOW_LEVELS[0])
    big = upscale(Image.fromarray(out, 'RGBA'))
    dx, dy = left - small_box[0] * SCALE, top - small_box[1] * SCALE
    return big.crop((dx, dy, dx + right - left, dy + bottom - top))


def process_character(path, grid, colours, contact_shadow):
    source = Image.open(path).convert('RGBA')
    rgba = np.array(source.resize((grid, grid), Image.BOX))
    solid = rgba[:, :, 3] >= CHARACTER_ALPHA
    if solid[0].any() or solid[-1].any() or solid[:, 0].any() or solid[:, -1].any():
        raise SystemExit(f'{path}: touches the canvas edge')
    rgb = Image.fromarray(rgba[:, :, :3])
    rgb = ImageEnhance.Contrast(rgb).enhance(1.15).filter(ImageFilter.UnsharpMask(radius=1, percent=80, threshold=1))
    out = np.zeros_like(rgba)
    out[solid, :3] = np.array(quantize(rgb, colours))[solid]
    out[solid, 3] = 255
    outline = (neighbours(solid) > 0) & ~solid
    out[outline, :3] = OUTLINE_COLOUR
    out[outline, 3] = 255
    sprite = Image.fromarray(out, 'RGBA')
    if contact_shadow:
        cx, cy = grid / 2, grid * GROUND_Y - 1
        rx, ry = grid * CONTACT_SHADOW['rx'], max(1.5, grid * CONTACT_SHADOW['ry'])
        shadow = Image.new('RGBA', sprite.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse((cx - rx, cy - ry, cx + rx, cy + ry),
                                       fill=(*SHADOW_COLOUR, CONTACT_SHADOW['alpha']))
        sprite = Image.alpha_composite(shadow, sprite)
    return upscale(sprite)


def place(canvas, sprite, placement):
    w = round(canvas.width * placement['width'] / 100)
    h = round(sprite.height * w / sprite.width)
    sprite = sprite.resize((w, h), Image.NEAREST)
    cx, cy = canvas.width * placement['x'] / 100, canvas.height * placement['y'] / 100
    top = cy - h / 2 if placement['anchor'] == 'center' else cy - h
    canvas.alpha_composite(sprite, (round(cx - w / 2), round(top)))


def sheet(cells, rows, cols, cell):
    out = Image.new('RGBA', (cols * cell, rows * cell), (*SHEET_BG, 255))
    for (row, col), sprite in cells.items():
        out.alpha_composite(sprite.resize((cell, cell), Image.NEAREST), (col * cell, row * cell))
    return out.convert('RGB')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--write-runtime', action='store_true')
    parser.add_argument('--preview-dir', default=os.path.join(HERE, 'previews'))
    parser.add_argument('--lighting', choices=tuple(SCENE_DIRS), default='day')
    args = parser.parse_args()
    lighting = args.lighting

    with open(PLACEMENTS, encoding='utf-8') as fh:
        placements = json.load(fh)
    if lighting != 'day':
        placements = placements[lighting]
    placements = placements['props']

    images = {ROOM_PATHS[lighting]: process_room(args.render_dir, lighting)}
    for prop_id in PROPS:
        images[prop_path(prop_id, lighting)] = process_prop(
            args.render_dir, prop_id, placements[prop_id]['bbox'], lighting)
    if lighting == 'day':
        for spec_id in catalog.PROTAGONISTS:
            for pose in catalog.POSES:
                for facing in catalog.FACINGS:
                    name = f'{spec_id}-{pose}-{facing}'
                    images[f'{PROTAGONIST_DIR}/{name}.png'] = process_character(
                        os.path.join(PWA, catalog.protagonist_path(spec_id, pose, facing)),
                        PROTAGONIST_GRID, PROTAGONIST_COLOURS, True)
        for kind in catalog.COMPANIONS:
            for state in catalog.STATES:
                name = f'{kind}-{state}'
                images[f'{COMPANION_DIR}/{name}.png'] = process_character(
                    os.path.join(PWA, catalog.companion_path(kind, state)), COMPANION_GRID, COMPANION_COLOURS, False)

    files = {}
    for path, image in images.items():
        data = encode(image)
        files[path] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        if args.write_runtime:
            target = os.path.join(PWA, *path.split('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(data)

    if args.write_runtime:
        try:
            with open(OUTPUTS, encoding='utf-8') as fh:
                previous = json.load(fh)
        except FileNotFoundError:
            previous = {'files': {}}
        night = {'room': ROOM_PATHS['night'], 'props': {prop_id: prop_path(prop_id, 'night') for prop_id in PROPS}}
        if lighting == 'day':
            # Keep the night set that an earlier --lighting night run wrote.
            kept = previous.get('night')
            kept_files = {path: entry for path, entry in previous['files'].items()
                          if kept and (path == kept['room'] or path in kept['props'].values())}
        else:
            kept = night
            kept_files = {path: entry for path, entry in previous['files'].items() if path not in files}
        outputs = {
            'schemaVersion': 1,
            'taskId': 'PS-250D',
            'scale': SCALE,
            'encoding': {'format': 'png', 'colours': {
                'room': ROOM_COLOURS, 'prop': PROP_COLOURS,
                'protagonist': PROTAGONIST_COLOURS, 'companion': COMPANION_COLOURS,
            }},
            'room': ROOM_PATHS['day'],
            'props': {prop_id: prop_path(prop_id, 'day') for prop_id in PROPS},
            **({'night': {**kept, 'taskId': 'PS-250E1'}} if kept else {}),
            'protagonist': {'ids': list(catalog.PROTAGONISTS), 'poses': catalog.POSES, 'facings': catalog.FACINGS},
            'companion': {'ids': list(catalog.COMPANIONS), 'states': catalog.STATES},
            'files': dict(sorted({**kept_files, **files}.items())),
        }
        with open(OUTPUTS, 'w', encoding='utf-8') as fh:
            json.dump(outputs, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    os.makedirs(args.preview_dir, exist_ok=True)
    character = lambda path: images.get(path) or Image.open(os.path.join(PWA, *path.split('/'))).convert('RGBA')
    if lighting == 'day':
        columns = [(pose, facing) for pose in catalog.POSES for facing in catalog.FACINGS]
        sheet({(row, col): images[f'{PROTAGONIST_DIR}/{spec_id}-{pose}-{facing}.png']
               for row, spec_id in enumerate(catalog.PROTAGONISTS)
               for col, (pose, facing) in enumerate(columns)},
              len(catalog.PROTAGONISTS), len(columns), 128).save(
            os.path.join(args.preview_dir, 'protagonists.png'), optimize=True)
        sheet({(row, col): images[f'{COMPANION_DIR}/{kind}-{state}.png']
               for row, kind in enumerate(catalog.COMPANIONS)
               for col, state in enumerate(catalog.STATES)},
              len(catalog.COMPANIONS), len(catalog.STATES), 128).save(
            os.path.join(args.preview_dir, 'companions.png'), optimize=True)
    for progress in (0, 100):
        room = images[ROOM_PATHS[lighting]].convert('RGBA')
        shown = [prop_id for prop_id, spec in PROPS.items() if spec['min'] <= progress <= spec['max']]
        for prop_id in sorted(shown, key=lambda prop_id: PROPS[prop_id]['z']):
            place(room, images[prop_path(prop_id, lighting)], {**placements[prop_id], 'anchor': 'center-bottom'})
        place(room, character(f'{PROTAGONIST_DIR}/office-idle-left.png'),
              {**PROTAGONIST_PLACEMENT, 'x': 58 if progress >= 25 else 51})
        place(room, character(f'{COMPANION_DIR}/orbit-observe.png'),
              {**COMPANION_PLACEMENT, 'x': 69 if progress >= 75 else 73})
        prefix = 'room' if lighting == 'day' else f'room-{lighting}'
        room.convert('RGB').save(os.path.join(args.preview_dir, f'{prefix}-phase-{progress:03d}.png'), optimize=True)
    total = sum(entry['bytes'] for entry in files.values())
    print(f'{len(files)} files, {total:,} bytes')


if __name__ == '__main__':
    main()

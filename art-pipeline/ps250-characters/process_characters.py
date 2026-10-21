"""Turn PS-250C renders into runtime sprites, a hash list and QA previews.

Usage:
    python3 process_characters.py <render_dir> [--write-runtime] [--reuse-committed]
        [--preview-dir DIR]

- Checks that nothing touches the canvas edge (a clipped pose or mark).
- Adds a soft contact shadow under each protagonist at the ground point, so
  the figure stands on the floor; a jump (celebrate) leaves it on the ground.
- Encodes every sprite as lossy WebP with a lossless alpha plane. At quality
  90 it cannot be told apart from the PNG at 2x zoom and is about a tenth of
  the size (~17 KB per protagonist, ~7 KB per Companion).
- With --write-runtime, writes the sprites under pwa/ and outputs.json (ids,
  labels, canvas and SHA-256 of every file); otherwise only checks and
  previews. Previews are always written, by default into the committed
  previews/ folder.
- With --reuse-committed, a sprite without a render keeps the committed
  runtime file (hashed as it is on disk), so changing one character only
  needs that character's renders.
- Previews: every protagonist pose and Companion state on contact sheets, and
  the default pair in the phase-100 room at the runtime placements.

Requires Pillow (and numpy through ps244-blender/process_pack.py).
"""
import argparse
import hashlib
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PWA = os.path.join(REPO, 'pwa')
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
import catalog  # noqa: E402
from process_pack import PROPS  # noqa: E402  (phases and draw order of the props)

EDGE = 2                 # px checked along each canvas edge
EDGE_ALPHA = 8           # anything above this on the edge is clipped content
WEBP = {'quality': 90, 'alpha_quality': 100, 'method': 6}
PROTAGONIST_CANVAS = (512, 512)
COMPANION_CANVAS = (256, 256)
GROUND_Y = 241 / 256     # rig.PROTAGONIST_GROUND
SHADOW = {'rx': 0.13, 'ry': 0.03, 'lift': 4, 'blur': 6, 'alpha': 78, 'color': (11, 16, 34)}

ROOM = 'assets/personal-space/v2/workspace/backgrounds/building-formal-workstation-room-v2.webp'
PLACEMENTS = os.path.join(REPO, 'art-pipeline', 'ps244-blender', 'placements.json')
# getWorkspaceSceneAssets() placements at 100%.
PROTAGONIST_PLACEMENT = {'x': 58, 'y': 87, 'width': 24, 'anchor': 'center-bottom'}
COMPANION_PLACEMENT = {'x': 69, 'y': 73, 'width': 13, 'anchor': 'center'}
DEFAULT_PAIR = ('office', 'orbit')
SHEET_BG = (150, 110, 80)


def expected():
    files = []
    for spec_id in catalog.PROTAGONISTS:
        for pose in catalog.POSES:
            for facing in catalog.FACINGS:
                files.append(('protagonist', f'{spec_id}-{pose}-{facing}', catalog.protagonist_path(spec_id, pose, facing)))
    for kind in catalog.COMPANIONS:
        for state in catalog.STATES:
            files.append(('companion', f'{kind}-{state}', catalog.companion_path(kind, state)))
    return files


def edge_alpha(im):
    alpha = im.getchannel('A')
    w, h = im.size
    boxes = [(0, 0, w, EDGE), (0, h - EDGE, w, h), (0, 0, EDGE, h), (w - EDGE, 0, w, h)]
    return max(alpha.crop(box).getextrema()[1] for box in boxes)


def contact_shadow(size):
    w, h = size
    cx, cy = w / 2, h * GROUND_Y - SHADOW['lift']
    rx, ry = w * SHADOW['rx'], w * SHADOW['ry']
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=SHADOW['alpha'])
    mask = mask.filter(ImageFilter.GaussianBlur(SHADOW['blur']))
    shadow = Image.new('RGBA', size, (*SHADOW['color'], 0))
    shadow.putalpha(mask)
    return shadow


def encode(im):
    buffer = io.BytesIO()
    im.save(buffer, 'WEBP', **WEBP)
    return buffer.getvalue()


def place(canvas, sprite, placement):
    w = round(canvas.width * placement['width'] / 100)
    h = round(sprite.height * w / sprite.width)
    sprite = sprite.resize((w, h), Image.LANCZOS)
    cx, cy = canvas.width * placement['x'] / 100, canvas.height * placement['y'] / 100
    top = cy - h / 2 if placement['anchor'] == 'center' else cy - h
    canvas.alpha_composite(sprite, (round(cx - w / 2), round(top)))


def room_at_full_progress():
    """The phase-100 room: background plus every prop at its PS-244 placement."""
    canvas = Image.open(os.path.join(PWA, ROOM)).convert('RGBA')
    with open(PLACEMENTS, encoding='utf-8') as fh:
        placements = json.load(fh)['props']
    shown = [prop_id for prop_id, spec in PROPS.items() if spec['min'] <= 100 <= spec['max']]
    for prop_id in sorted(shown, key=lambda prop_id: PROPS[prop_id]['z']):
        entry = placements[prop_id]
        sprite = Image.open(os.path.join(PWA, entry['path'])).convert('RGBA')
        place(canvas, sprite, {**entry, 'anchor': 'center-bottom'})
    return canvas


def sheet(sprites, rows, cols, cell):
    out = Image.new('RGBA', (cols * cell, rows * cell), (*SHEET_BG, 255))
    for (row, col), sprite in sprites.items():
        out.alpha_composite(sprite.resize((cell, cell), Image.LANCZOS), (col * cell, row * cell))
    return out.convert('RGB')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--write-runtime', action='store_true')
    parser.add_argument('--reuse-committed', action='store_true')
    parser.add_argument('--preview-dir', default=os.path.join(HERE, 'previews'))
    args = parser.parse_args()

    sprites, problems, files = {}, [], {}
    for kind, name, path in expected():
        source = os.path.join(args.render_dir, kind, f'{name}.png')
        if not os.path.exists(source):
            committed = os.path.join(PWA, path)
            if not (args.reuse_committed and os.path.exists(committed)):
                problems.append(f'missing render: {source}')
                continue
            with open(committed, 'rb') as fh:
                data = fh.read()
            sprites[name] = Image.open(io.BytesIO(data)).convert('RGBA')
            files[path] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
            continue
        im = Image.open(source).convert('RGBA')
        canvas = PROTAGONIST_CANVAS if kind == 'protagonist' else COMPANION_CANVAS
        if im.size != canvas:
            problems.append(f'{name}: {im.size} is not {canvas}')
        if edge_alpha(im) > EDGE_ALPHA:
            problems.append(f'{name}: touches the canvas edge')
        if kind == 'protagonist':
            im = Image.alpha_composite(contact_shadow(im.size), im)
        data = encode(im)
        sprites[name] = Image.open(io.BytesIO(data)).convert('RGBA')
        files[path] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        if args.write_runtime:
            target = os.path.join(PWA, path)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(data)
    if problems:
        raise SystemExit('\n'.join(problems))

    if args.write_runtime:
        outputs = {
            'schemaVersion': 1,
            'taskId': 'PS-250C',
            'encoding': {'format': 'webp', **WEBP},
            'protagonist': {
                'canvas': list(PROTAGONIST_CANVAS),
                'ground': [0.5, round(GROUND_Y, 6)],
                'ids': [{'id': key, 'label': label} for key, label in catalog.PROTAGONISTS.items()],
                'poses': catalog.POSES,
                'facings': catalog.FACINGS,
            },
            'companion': {
                'canvas': list(COMPANION_CANVAS),
                'ids': [{'id': key, 'label': label} for key, label in catalog.COMPANIONS.items()],
                'states': catalog.STATES,
            },
            'files': dict(sorted(files.items())),
        }
        with open(os.path.join(HERE, 'outputs.json'), 'w', encoding='utf-8') as fh:
            json.dump(outputs, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    os.makedirs(args.preview_dir, exist_ok=True)
    columns = [(pose, facing) for pose in catalog.POSES for facing in catalog.FACINGS]
    sheet({(row, col): sprites[f'{spec_id}-{pose}-{facing}']
           for row, spec_id in enumerate(catalog.PROTAGONISTS)
           for col, (pose, facing) in enumerate(columns)},
          len(catalog.PROTAGONISTS), len(columns), 128).save(
        os.path.join(args.preview_dir, 'protagonists.jpg'), quality=86)
    sheet({(row, col): sprites[f'{kind}-{state}']
           for row, kind in enumerate(catalog.COMPANIONS)
           for col, state in enumerate(catalog.STATES)},
          len(catalog.COMPANIONS), len(catalog.STATES), 128).save(
        os.path.join(args.preview_dir, 'companions.jpg'), quality=86)
    room = room_at_full_progress()
    protagonist, companion = DEFAULT_PAIR
    place(room, sprites[f'{protagonist}-idle-left'], PROTAGONIST_PLACEMENT)
    place(room, sprites[f'{companion}-observe'], COMPANION_PLACEMENT)
    room.convert('RGB').save(os.path.join(args.preview_dir, 'room-phase-100.jpg'), quality=86)
    total = sum(entry['bytes'] for entry in files.values())
    print(f'{len(files)} sprites, {total:,} bytes')


if __name__ == '__main__':
    main()

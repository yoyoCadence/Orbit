"""Turn the PS-250F decoration renders into runtime sprites, placements and previews.

Usage:
    python3 process_decor.py <render_dir> <pixel_render_dir> [--lighting day|night]
                             [--write-runtime]

<render_dir> holds the Q-style renders of
    ps244-blender/render_pack.py <render_dir> --only decor [--lighting night]
and <pixel_render_dir> the pixel renders of
    ps250-pixel/render_pixel.py <pixel_render_dir> --only decor [--lighting night]
(in its scene/ or scene-night/ folder).

- Q style: each decoration is trimmed like a prop (process_pack.trim_prop:
  solid core plus shadow margin, sampling noise dropped), and its trim box
  gives the runtime placement. Placements go into placements.json here (the
  night ones under "night"), not into ps244-blender/placements.json, which
  process_pack.py rewrites.
- Pixel: cut to the Q-style box the way ps250-pixel cuts a prop
  (process_pixel.process_prop), so both styles share one set of placements.
- With --write-runtime: the PNGs under pwa/, outputs.json (sizes and
  SHA-256) and, once placements.json has both lightings, DECOR_DEFINITIONS
  in assetManifest.js (tests/unit/ps250fDecorations.test.js keeps the two
  in sync).
- Previews (always): the committed background and props of the phases where
  decorations appear, with every decoration and the default pair (Q style),
  and the pixel room at 100%.

Requires Pillow and numpy.
"""
import argparse
import hashlib
import json
import os
import re
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-pixel'))
import process_pack as Q  # noqa: E402
import process_pixel as P  # noqa: E402

PLACEMENTS = os.path.join(HERE, 'placements.json')
OUTPUTS = os.path.join(HERE, 'outputs.json')
PREVIEWS = os.path.join(HERE, 'previews')
V2 = 'assets/personal-space/v2'

# In scene.DECOR_IDS order (the user's order: shelf, floor, desk). A
# decoration on a prop shows from that prop's phase and moves with it; one on
# the floor shows from the start. z puts each just above its support: only
# its support overlaps it (the floor lamp stands behind everything, the
# beanbag in front of the desk and chair, and below the characters).
DECOR = {
    'deco-trophy':     {'support': 'office-shelf', 'z': 23},
    'deco-globe':      {'support': 'office-shelf', 'z': 23},
    'deco-beanbag':    {'support': None, 'z': 31},
    'deco-floor-lamp': {'support': None, 'z': 21},
    'deco-succulent':  {'support': 'corner-desk', 'z': 25},
    'deco-coffee':     {'support': 'corner-desk', 'z': 25},
}
PREVIEW_PHASES = (0, 25, 50, 100)


def min_progress(decor_id):
    support = DECOR[decor_id]['support']
    return Q.PROPS[support]['min'] if support else 0


def decor_path(decor_id, lighting, pixel=False):
    return f"{V2}/workspace/{'pixel/' if pixel else ''}decor/{decor_id}{'-night' if lighting == 'night' else ''}.png"


def write_placements(lighting, placements):
    """Writes one lighting's placements and keeps the other's as it is."""
    try:
        with open(PLACEMENTS, encoding='utf-8') as fh:
            data = json.load(fh)
    except FileNotFoundError:
        data = {'frame': {'width': Q.FRAME[0], 'height': Q.FRAME[1]}}
    section = {did: {'path': decor_path(did, lighting), **pl} for did, pl in placements.items()}
    if lighting == 'day':
        data = {'frame': data['frame'], 'decor': section, **({'night': data['night']} if 'night' in data else {})}
    else:
        data[lighting] = {'decor': section}
    with open(PLACEMENTS, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, indent=2)
        fh.write('\n')
    return data


def sync_asset_manifest(data):
    """Rewrites DECOR_DEFINITIONS from both lightings in placements.json."""
    day, night = data['decor'], data['night']['decor']
    lines = ['const DECOR_DEFINITIONS = Object.freeze([']
    for did, spec in DECOR.items():
        pl, npl = day[did], night[did]
        support = f"'{spec['support']}'" if spec['support'] else 'null'
        place = f"{{ x: {pl['x']}, y: {pl['y']}, width: {pl['width']}, z: {spec['z']} }}"
        night_place = f"{{ x: {npl['x']}, y: {npl['y']}, width: {npl['width']} }}"
        lines.append(f"  decoration('{did}', {support}, {min_progress(did)}, {place},")
        lines.append(f"    {night_place}),")
    lines.append(']);')
    with open(Q.ASSET_MANIFEST, encoding='utf-8') as fh:
        source = fh.read()
    updated, count = re.subn(r'const DECOR_DEFINITIONS = Object\.freeze\(\[\n.*?\n\]\);',
                             '\n'.join(lines), source, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError('DECOR_DEFINITIONS block not found in assetManifest.js')
    with open(Q.ASSET_MANIFEST, 'w', encoding='utf-8') as fh:
        fh.write(updated)


def record(files):
    """Adds {path: bytes} to outputs.json with sizes and SHA-256, keeping the rest."""
    try:
        with open(OUTPUTS, encoding='utf-8') as fh:
            data = json.load(fh)
    except FileNotFoundError:
        data = {'schemaVersion': 1, 'taskId': 'PS-250F', 'files': {}}
    for path, blob in files.items():
        data['files'][path] = {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
    data['files'] = dict(sorted(data['files'].items()))
    with open(OUTPUTS, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def load_runtime(path):
    return Image.open(os.path.join(Q.PWA, *path.split('/'))).convert('RGBA')


def previews(lighting, sprites, placements, pixel_sprites):
    """The committed room of each phase, with the decorations of that phase."""
    with open(Q.PLACEMENTS, encoding='utf-8') as fh:
        room = json.load(fh)
    room = room if lighting == 'day' else room[lighting]
    suffix = '-night' if lighting == 'night' else ''
    os.makedirs(PREVIEWS, exist_ok=True)
    for progress in PREVIEW_PHASES:
        canvas = load_runtime(Q.BACKGROUND_PATHS[lighting])
        layers = [(spec['z'], 0, pid, room['props'][pid], load_runtime(room['props'][pid]['path']))
                  for pid, spec in Q.PROPS.items() if spec['min'] <= progress <= spec['max']]
        layers += [(DECOR[did]['z'], 1, did, placements[did], sprites[did])
                   for did in DECOR if min_progress(did) <= progress]
        for _, _, _, pl, sprite in sorted(layers, key=lambda layer: layer[:3]):
            Q.place(canvas, sprite, pl['x'], pl['y'], pl['width'])
        for spec in Q.CHARACTERS.values():
            Q.place(canvas, load_runtime(spec['path']['night']), spec['x'](progress), spec['y'], spec['width'],
                    spec['anchor'])
        Q.draw_photo_frame(canvas, Q.PHOTO_FRAME_NIGHT_BRIGHTNESS if lighting == 'night' else 1.0)
        canvas.convert('RGB').resize((768, 512), Image.LANCZOS).save(
            os.path.join(PREVIEWS, f'decor{suffix}-phase-{progress:03d}.jpg'), quality=86)

    canvas = load_runtime(P.ROOM_PATHS[lighting])
    layers = [(spec['z'], 0, pid, room['props'][pid], load_runtime(P.prop_path(pid, lighting)))
              for pid, spec in Q.PROPS.items() if spec['min'] <= 100 <= spec['max']]
    layers += [(DECOR[did]['z'], 1, did, placements[did], pixel_sprites[did]) for did in DECOR]
    for _, _, _, pl, sprite in sorted(layers, key=lambda layer: layer[:3]):
        P.place(canvas, sprite, {**pl, 'anchor': 'center-bottom'})
    P.place(canvas, load_runtime(f'{P.PROTAGONIST_DIR}/office-idle-left.png'), {**P.PROTAGONIST_PLACEMENT, 'x': 58})
    P.place(canvas, load_runtime(f'{P.COMPANION_DIR}/orbit-observe.png'), {**P.COMPANION_PLACEMENT, 'x': 69})
    canvas.convert('RGB').save(os.path.join(PREVIEWS, f'decor{suffix}-pixel-phase-100.png'), optimize=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('pixel_render_dir')
    parser.add_argument('--lighting', choices=('day', 'night'), default='day')
    parser.add_argument('--write-runtime', action='store_true')
    args = parser.parse_args()
    lighting = args.lighting

    sprites, placements = {}, {}
    for decor_id, spec in DECOR.items():
        sprite, box = Q.trim_prop(Q.load_frame(os.path.join(args.render_dir, f'{decor_id}.png')))
        sprites[decor_id] = sprite
        placements[decor_id] = {**Q.placement_for(box), 'z': spec['z'], 'bbox': list(box)}
    pixel_sprites = {decor_id: P.process_prop(args.pixel_render_dir, decor_id, placements[decor_id]['bbox'], lighting)
                     for decor_id in DECOR}

    if args.write_runtime:
        files = {}
        for decor_id in DECOR:
            files[decor_path(decor_id, lighting)] = P.encode(sprites[decor_id])
            files[decor_path(decor_id, lighting, pixel=True)] = P.encode(pixel_sprites[decor_id])
        for path, blob in files.items():
            target = os.path.join(Q.PWA, *path.split('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(blob)
        record(files)
        data = write_placements(lighting, placements)
        if 'decor' in data and 'night' in data:
            sync_asset_manifest(data)
        else:
            print('DECOR_DEFINITIONS not updated: run both lightings (day first).')

    previews(lighting, sprites, placements, pixel_sprites)
    print(json.dumps({did: {k: v for k, v in pl.items() if k != 'bbox'} for did, pl in placements.items()}, indent=1))


if __name__ == '__main__':
    main()

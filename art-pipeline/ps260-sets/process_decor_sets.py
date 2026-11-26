"""PS-260C: each set's two decorations, as runtime sprites in both styles.

Usage:
    python3 process_decor_sets.py <render_dir> <pixel_render_dir> --style <room>
        [--lighting day|night] [--write-runtime]

<render_dir> holds the Q-style renders of
    ps244-blender/render_pack.py <render_dir> --only <decor>,<decor> --style <room> [--lighting night]
and <pixel_render_dir> the pixel renders of
    ps250-pixel/render_pixel.py <pixel_render_dir> --only <decor>,<decor> --style <room> [--lighting night]
(in its scene-<room>[-night] folder).

A set's decorations stand only in its own room, so unlike the PS-250F ones
they have no default box to be cut to: each is trimmed like a prop
(process_pack.trim_prop after the room's shadow_floor), its own trim box gives
its placement, and the pixel sprite is cut to that box with the room's pixel
shadow (process_pixel.process_prop), so both styles share the placement.

- With --write-runtime: the PNGs under workspace/[pixel/]decor/styles/<room>/,
  decor-placements.json (placement and box by room, decoration and lighting)
  and decor-outputs.json (sizes and SHA-256), both next to this script.
- Previews (always): the whole set in its room at 100%, by Q style and pixels:
  the room's props, the six PS-250F decorations of that room when they exist,
  the set's two decorations, the photo frame, its protagonist and Orbit
  (previews/sets/<room>[-night][-pixel].jpg).

Requires Pillow and numpy.
"""
import argparse
import hashlib
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-pixel'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-rooms'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-decor'))
import process_pack as Q  # noqa: E402
import process_pixel as P  # noqa: E402
import rooms  # noqa: E402
import sets_catalog  # noqa: E402
from process_decor import DECOR, decor_path  # noqa: E402

PLACEMENTS = os.path.join(HERE, 'decor-placements.json')
OUTPUTS = os.path.join(HERE, 'decor-outputs.json')
PREVIEWS = os.path.join(HERE, 'previews', 'sets')
STANDARD_PLACEMENTS = os.path.join(HERE, '..', 'ps250-decor', 'placements.json')
SET_OF_ROOM = {entry['room'][0]: entry for entry in sets_catalog.SETS}


def load_json(path, fallback):
    try:
        with open(path, encoding='utf-8') as fh:
            return json.load(fh)
    except FileNotFoundError:
        return fallback


def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')


def load_runtime(path):
    return Image.open(os.path.join(Q.PWA, *path.split('/'))).convert('RGBA')


def previews(room, lighting, sprites, pixel_sprites, placements):
    entry = SET_OF_ROOM[room]
    suffix = '-night' if lighting == 'night' else ''
    props = load_json(Q.PLACEMENTS, None)
    props = (props if lighting == 'day' else props[lighting])['props']
    standard = load_json(STANDARD_PLACEMENTS, None)
    standard = (standard if lighting == 'day' else standard[lighting])['decor']
    os.makedirs(PREVIEWS, exist_ok=True)
    for pixel in (False, True):
        canvas = load_runtime(rooms.background_path(room, lighting, pixel=pixel))
        layers = [(spec['z'], 0, pid, props[pid], load_runtime(rooms.prop_path(room, pid, lighting, pixel=pixel)))
                  for pid, spec in Q.PROPS.items() if spec['min'] <= 100 <= spec['max']]
        for did, spec in DECOR.items():
            path = decor_path(did, lighting, pixel=pixel, style=room)
            if os.path.exists(os.path.join(Q.PWA, *path.split('/'))):
                layers.append((spec['z'], 1, did, standard[did], load_runtime(path)))
        for did, pl in placements.items():
            layers.append((pl['z'], 1, did, pl, (pixel_sprites if pixel else sprites)[did]))
        for _, _, _, pl, sprite in sorted(layers, key=lambda layer: layer[:3]):
            if pixel:
                P.place(canvas, sprite, {**pl, 'anchor': 'center-bottom'})
            else:
                Q.place(canvas, sprite, pl['x'], pl['y'], pl['width'])
        Q.draw_photo_frame(canvas, Q.PHOTO_FRAME_NIGHT_BRIGHTNESS if lighting == 'night' else 1.0)
        protagonist = sets_catalog.protagonist_path(entry['id'], 'idle', 'left')
        if pixel:
            # PS-260D: the set's pixel protagonist.
            P.place(canvas, load_runtime(f"{P.PROTAGONIST_DIR}/{entry['id']}-idle-left.png"), {**P.PROTAGONIST_PLACEMENT, 'x': 58})
            P.place(canvas, load_runtime(f'{P.COMPANION_DIR}/orbit-observe.png'), {**P.COMPANION_PLACEMENT, 'x': 69})
        else:
            spec = Q.CHARACTERS['protagonist']
            Q.place(canvas, load_runtime(protagonist), spec['x'](100), spec['y'], spec['width'], spec['anchor'])
            spec = Q.CHARACTERS['companion']
            Q.place(canvas, load_runtime(spec['path']['night']), spec['x'](100), spec['y'], spec['width'], spec['anchor'])
        name = f"{room}{suffix}{'-pixel' if pixel else ''}.jpg"
        canvas.convert('RGB').resize((768, 512), Image.NEAREST if pixel else Image.LANCZOS).save(
            os.path.join(PREVIEWS, name), quality=86)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('pixel_render_dir')
    parser.add_argument('--style', choices=sorted(SET_OF_ROOM), required=True)
    parser.add_argument('--lighting', choices=('day', 'night'), default='day')
    parser.add_argument('--write-runtime', action='store_true')
    args = parser.parse_args()
    room, lighting = args.style, args.lighting
    colours = Q.ROOM_STYLES[room]
    decor_ids = [did for did, _ in SET_OF_ROOM[room]['decor']]

    sprites, pixel_sprites, placements = {}, {}, {}
    for did in decor_ids:
        spot = sets_catalog.DECOR_SPOTS[did]
        z = sets_catalog.DECOR_Z[spot]
        frame = Q.lift_shadow_floor(Q.load_frame(os.path.join(args.render_dir, f'{did}.png')),
                                    colours.get('shadow_floor', 0))
        sprite, box = Q.trim_prop(frame)
        sprites[did] = sprite
        placements[did] = {**Q.placement_for(box), 'z': z, 'spot': spot, 'bbox': list(box)}
        pixel_sprites[did] = P.process_prop(
            args.pixel_render_dir, did, box, lighting, rooms.scene_folder(room, lighting),
            colours.get('pixel_shadow'), colours.get('shadow_floor', 0))

    if args.write_runtime:
        files = {}
        for did in decor_ids:
            files[decor_path(did, lighting, style=room)] = P.encode(sprites[did])
            files[decor_path(did, lighting, pixel=True, style=room)] = P.encode(pixel_sprites[did])
        for path, blob in files.items():
            target = os.path.join(Q.PWA, *path.split('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(blob)
        outputs = load_json(OUTPUTS, {'schemaVersion': 1, 'taskId': 'PS-260C', 'files': {}})
        for path, blob in files.items():
            outputs['files'][path] = {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
        outputs['files'] = dict(sorted(outputs['files'].items()))
        save_json(OUTPUTS, outputs)
        data = load_json(PLACEMENTS, {'schemaVersion': 1, 'frame': {'width': Q.FRAME[0], 'height': Q.FRAME[1]},
                                      'rooms': {}})
        section = data['rooms'].setdefault(room, {})
        for did, pl in placements.items():
            section.setdefault(did, {})[lighting] = {'path': decor_path(did, lighting, style=room), **pl}
        data['rooms'] = {key: data['rooms'][key] for key in sorted(data['rooms'])}
        save_json(PLACEMENTS, data)

    previews(room, lighting, sprites, pixel_sprites, placements)
    print(json.dumps({did: {k: v for k, v in pl.items() if k != 'bbox'} for did, pl in placements.items()}, indent=1))


if __name__ == '__main__':
    main()

"""Turn PS-260 protagonist renders into runtime sprites, a hash list and previews.

Usage:
    python3 process_sets.py <render_dir> [--write-runtime] [--reuse-committed]
        [--preview-dir DIR]

The same steps as ps250-characters/process_characters.py, with its helpers:
the clip check, the contact shadow at the ground point and the WebP encoding
(quality 90, lossless alpha). With --write-runtime the sprites go beside the
PS-250C ones under pwa/ and outputs.json lists them with their hashes. With
--reuse-committed a sprite without a render keeps its committed file.

Previews (always written, by default into previews/): every pose and facing
of every set on one sheet, and a line-up of the ten in idle.

Requires Pillow (and numpy through ps244-blender/process_pack.py).
"""
import argparse
import hashlib
import io
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-characters'))
import sets_catalog as catalog  # noqa: E402
from process_characters import (  # noqa: E402
    EDGE_ALPHA, GROUND_Y, PROTAGONIST_CANVAS, PWA, WEBP, contact_shadow, edge_alpha, encode, sheet,
)


def expected():
    return [(f'{spec_id}-{pose}-{facing}', catalog.protagonist_path(spec_id, pose, facing))
            for spec_id in catalog.PROTAGONISTS for pose in catalog.POSES for facing in catalog.FACINGS]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--write-runtime', action='store_true')
    parser.add_argument('--reuse-committed', action='store_true')
    parser.add_argument('--preview-dir', default=os.path.join(HERE, 'previews'))
    args = parser.parse_args()

    sprites, problems, files = {}, [], {}
    for name, path in expected():
        source = os.path.join(args.render_dir, 'protagonist', f'{name}.png')
        if not os.path.exists(source):
            committed = os.path.join(PWA, path)
            if not (args.reuse_committed and os.path.exists(committed)):
                problems.append(f'missing render: {source}')
                continue
            with open(committed, 'rb') as fh:
                data = fh.read()
        else:
            im = Image.open(source).convert('RGBA')
            if im.size != PROTAGONIST_CANVAS:
                problems.append(f'{name}: {im.size} is not {PROTAGONIST_CANVAS}')
            if edge_alpha(im) > EDGE_ALPHA:
                problems.append(f'{name}: touches the canvas edge')
            data = encode(Image.alpha_composite(contact_shadow(im.size), im))
            if args.write_runtime:
                target = os.path.join(PWA, path)
                os.makedirs(os.path.dirname(target), exist_ok=True)
                with open(target, 'wb') as fh:
                    fh.write(data)
        sprites[name] = Image.open(io.BytesIO(data)).convert('RGBA')
        files[path] = {'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
    if problems:
        raise SystemExit('\n'.join(problems))

    if args.write_runtime:
        outputs = {
            'schemaVersion': 1,
            'taskId': 'PS-260',
            'encoding': {'format': 'webp', **WEBP},
            'protagonist': {
                'canvas': list(PROTAGONIST_CANVAS),
                'ground': [0.5, round(GROUND_Y, 6)],
                'ids': [{'id': s['id'], 'label': s['label'], 'gender': s['gender']} for s in catalog.SETS],
                'poses': catalog.POSES,
                'facings': catalog.FACINGS,
            },
            'sets': [{'protagonist': s['id'], 'room': s['room'][0], 'decorations': [d for d, _ in s['decor']]}
                     for s in catalog.SETS],
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
    # The line-up: male sets on the top row, female below, each in idle.
    half = len(catalog.SETS) // 2
    sheet({(i // half, i % half): sprites[f'{s["id"]}-idle-{"right" if i % half < half / 2 else "left"}']
           for i, s in enumerate(catalog.SETS)}, 2, half, 256).save(
        os.path.join(args.preview_dir, 'lineup.jpg'), quality=88)
    total = sum(entry['bytes'] for entry in files.values())
    print(f'{len(files)} sprites, {total:,} bytes')


if __name__ == '__main__':
    main()

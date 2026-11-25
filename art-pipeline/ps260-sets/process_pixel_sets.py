"""PS-260D: the pixel versions of the ten themed protagonists.

Usage:
    python3 process_pixel_sets.py [--write-runtime] [--preview-dir DIR]

Exactly the PS-250D treatment of a PS-250C sprite (ps250-pixel/
process_pixel.process_character): the committed Q-style sprite reduced to the
room's pixel size (92 art pixels), a little contrast and sharpening, its own
32-colour palette, hard alpha, a one-pixel dark outline and a pixel contact
shadow, scaled x4 to 368 x 368. No render is needed, and the framing,
anchors and runtime placements are those of the Q style.

- With --write-runtime: the PNGs beside the PS-250D pixel protagonists
  (characters/pixel/protagonist/<id>-<pose>-<facing>.png) and
  pixel-outputs.json next to this script (sizes and SHA-256).
- Previews (always, by default into previews/): every pose and facing on one
  sheet (pixel-protagonists.png) and the ten in idle (pixel-lineup.png).

Requires Pillow and numpy.
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
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-pixel'))
import process_pixel as P  # noqa: E402
import sets_catalog as catalog  # noqa: E402

OUTPUTS = os.path.join(HERE, 'pixel-outputs.json')


def pixel_path(spec_id, pose, facing):
    return f'{P.PROTAGONIST_DIR}/{spec_id}-{pose}-{facing}.png'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--write-runtime', action='store_true')
    parser.add_argument('--preview-dir', default=os.path.join(HERE, 'previews'))
    args = parser.parse_args()

    images, files = {}, {}
    for spec_id in catalog.PROTAGONISTS:
        for pose in catalog.POSES:
            for facing in catalog.FACINGS:
                source = os.path.join(P.PWA, *catalog.protagonist_path(spec_id, pose, facing).split('/'))
                # Raises SystemExit if the reduced sprite touches the canvas edge.
                image = P.process_character(source, P.PROTAGONIST_GRID, P.PROTAGONIST_COLOURS, True)
                path = pixel_path(spec_id, pose, facing)
                images[path] = image
                files[path] = P.encode(image)

    if args.write_runtime:
        for path, blob in files.items():
            target = os.path.join(P.PWA, *path.split('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(blob)
        outputs = {
            'schemaVersion': 1,
            'taskId': 'PS-260D',
            'scale': P.SCALE,
            'protagonist': {
                'grid': P.PROTAGONIST_GRID,
                'colours': P.PROTAGONIST_COLOURS,
                'ids': list(catalog.PROTAGONISTS),
                'poses': catalog.POSES,
                'facings': catalog.FACINGS,
            },
            'files': {path: {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
                      for path, blob in sorted(files.items())},
        }
        with open(OUTPUTS, 'w', encoding='utf-8') as fh:
            json.dump(outputs, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    os.makedirs(args.preview_dir, exist_ok=True)
    columns = [(pose, facing) for pose in catalog.POSES for facing in catalog.FACINGS]
    P.sheet({(row, col): images[pixel_path(spec_id, pose, facing)]
             for row, spec_id in enumerate(catalog.PROTAGONISTS)
             for col, (pose, facing) in enumerate(columns)},
            len(catalog.PROTAGONISTS), len(columns), 92).save(
        os.path.join(args.preview_dir, 'pixel-protagonists.png'), optimize=True)
    half = len(catalog.SETS) // 2
    P.sheet({(i // half, i % half): images[pixel_path(s['id'], 'idle', 'right' if i % half < half / 2 else 'left')]
             for i, s in enumerate(catalog.SETS)}, 2, half, 184).save(
        os.path.join(args.preview_dir, 'pixel-lineup.png'), optimize=True)
    total = sum(len(blob) for blob in files.values())
    print(f'{len(files)} pixel sprites, {total:,} bytes')


if __name__ == '__main__':
    main()

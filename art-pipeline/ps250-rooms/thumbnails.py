"""PS-250G: small thumbnails of every room for the Edit Mode picker.

Usage:
    python3 thumbnails.py

The picker used to show each room's full 1536 x 1024 background as a
108 x 72 thumbnail, so opening it downloaded four other rooms' backgrounds
(about 280 KB in the Q style, 350 KB in pixels). This makes a 216 x 144 WebP
(twice the display size) of each room's committed day background, in both
character styles, and records their size and SHA-256 in thumbnails.json
(tests/unit/ps250gPickerThumbnails.test.js checks the files against it):

    pwa/assets/personal-space/v2/workspace/thumbnails/<room>.webp        Q style
    pwa/assets/personal-space/v2/workspace/pixel/thumbnails/<room>.webp  pixel

Run it again after re-rendering a room. Requires Pillow.
"""
import hashlib
import io
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-pixel'))
import rooms  # noqa: E402
from process_pack import BACKGROUND_PATHS, PWA  # noqa: E402
from process_pixel import ROOM_PATHS  # noqa: E402
from room_styles import ROOM_STYLES  # noqa: E402

SIZE = (216, 144)
QUALITY = 82
RECORD = os.path.join(HERE, 'thumbnails.json')


def source_path(room, pixel):
    if room == 'default':
        return ROOM_PATHS['day'] if pixel else BACKGROUND_PATHS['day']
    return rooms.background_path(room, 'day', pixel=pixel)


def thumbnail_path(room, pixel):
    return f"{rooms.V2}/workspace/{'pixel/' if pixel else ''}thumbnails/{room}.webp"


def main():
    files = {}
    for room in ROOM_STYLES:
        for pixel in (False, True):
            image = Image.open(os.path.join(PWA, *source_path(room, pixel).split('/'))).convert('RGB')
            buffer = io.BytesIO()
            image.resize(SIZE, Image.LANCZOS).save(buffer, 'WEBP', quality=QUALITY, method=6)
            path = thumbnail_path(room, pixel)
            target = os.path.join(PWA, *path.split('/'))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with open(target, 'wb') as fh:
                fh.write(buffer.getvalue())
            files[path] = {'bytes': len(buffer.getvalue()), 'sha256': hashlib.sha256(buffer.getvalue()).hexdigest()}
    with open(RECORD, 'w', encoding='utf-8') as fh:
        json.dump({'schemaVersion': 1, 'taskId': 'PS-250G', 'size': list(SIZE), 'files': dict(sorted(files.items()))},
                  fh, ensure_ascii=False, indent=2)
        fh.write('\n')
    print(f"{len(files)} thumbnails, {sum(entry['bytes'] for entry in files.values()):,} bytes")


if __name__ == '__main__':
    main()

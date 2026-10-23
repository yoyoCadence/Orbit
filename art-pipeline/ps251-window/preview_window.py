"""PS-251B: preview the window overlays in every room, before and after.

Usage:
    python3 preview_window.py <render_dir> <out_dir>

Reads the renders of render_window.py and composites, for each room style and
art style: the room background of the band's lighting (morning: day room,
evening: night room), then the overlay, then the furniture of the finished
project (100%), then the runtime light layer (the Pixi colours). Writes one
contact sheet of window crops per art style (now and after, per band) and the
default room's full frame with the overlay.
"""
import json
import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
PWA = os.path.join(REPO, 'pwa')
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-rooms'))

import rooms  # noqa: E402

STYLES = ('default', 'nordic', 'washitsu', 'nightowl', 'study')
STYLE_NAMES = {'default': '藍色工作室', 'nordic': '明亮北歐', 'washitsu': '日式和風', 'nightowl': '夜貓工作室', 'study': '深木書房'}
BAND_LIGHTING = {'morning': 'day', 'evening': 'night'}
# assetManifest.js / pixiSceneRuntime.js: the day room gets a faint warm
# layer, the night room a light navy one.
LIGHT_LAYER = {'morning': ((0xf6, 0xd5, 0x8b), 0.05), 'evening': ((0x17, 0x24, 0x49), 0.10)}
# The finished project: every prop but the single monitor (shown 75-99%).
PROPS = ('corner-desk', 'office-chair', 'office-shelf', 'desk-lamp', 'planning-board', 'dual-monitor', 'office-plant')
CROP = (1100, 60, 1536, 660)
V2 = 'assets/personal-space/v2'


def placements():
    with open(os.path.join(HERE, '..', 'ps244-blender', 'placements.json'), encoding='utf-8') as fh:
        data = json.load(fh)
    return {'day': data['props'], 'night': data['night']['props']}


def background(style, lighting, pixel):
    if style != 'default':
        return rooms.background_path(style, lighting, pixel)
    night = '-night' if lighting == 'night' else ''
    if pixel:
        return f'{V2}/workspace/pixel/backgrounds/building-formal-workstation-room-pixel{night}.png'
    return f'{V2}/workspace/backgrounds/building-formal-workstation-room-v2{night}.webp'


def prop(style, prop_id, lighting, pixel):
    if style != 'default':
        return rooms.prop_path(style, prop_id, lighting, pixel)
    night = '-night' if lighting == 'night' else ''
    return f"{V2}/workspace/{'pixel/' if pixel else ''}props/{prop_id}{night}.png"


def load(path):
    return Image.open(os.path.join(PWA, path)).convert('RGBA')


def place(canvas, sprite, entry, pixel):
    w = round(canvas.width * entry['width'] / 100)
    h = round(sprite.height * w / sprite.width)
    sprite = sprite.resize((w, h), Image.NEAREST if pixel else Image.LANCZOS)
    cx, bottom = canvas.width * entry['x'] / 100, canvas.height * entry['y'] / 100
    canvas.alpha_composite(sprite, (round(cx - w / 2), round(bottom - h)))


def overlay(render_dir, band, pixel):
    im = Image.open(os.path.join(render_dir, f"exterior-{band}{'-pixel' if pixel else ''}.png")).convert('RGBA')
    if not pixel:
        return im
    # The pixel room's 64-colour palette: quantize what is opaque, then 4x.
    rgb = im.convert('RGB').quantize(colors=32, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    alpha = im.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    rgb.putalpha(alpha)
    return rgb.resize((im.width * 4, im.height * 4), Image.NEAREST)


def compose(style, band, pixel, exterior, places):
    lighting = BAND_LIGHTING[band]
    canvas = load(background(style, lighting, pixel))
    if exterior is not None:
        canvas.alpha_composite(exterior)
    for prop_id in sorted(PROPS, key=lambda pid: places[lighting][pid]['z']):
        place(canvas, load(prop(style, prop_id, lighting, pixel)), places[lighting][prop_id], pixel)
    colour, alpha = LIGHT_LAYER[band]
    layer = Image.new('RGBA', canvas.size, (*colour, round(alpha * 255)))
    canvas.alpha_composite(layer)
    return canvas.convert('RGB')


def label(im, text):
    draw = ImageDraw.Draw(im)
    draw.rectangle((0, 0, im.width, 18), fill=(0, 0, 0))
    draw.text((4, 3), text, fill=(255, 255, 255))
    return im


def main():
    render_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    places = placements()
    for pixel in (False, True):
        art = 'pixel' if pixel else 'q'
        exteriors = {band: overlay(render_dir, band, pixel) for band in BAND_LIGHTING}
        cw, ch = (CROP[2] - CROP[0]) // 2, (CROP[3] - CROP[1]) // 2
        sheet = Image.new('RGB', (cw * 4 + 30, (ch + 4) * len(STYLES)), (40, 40, 40))
        for row, style in enumerate(STYLES):
            for col, (band, after) in enumerate(((b, a) for b in BAND_LIGHTING for a in (False, True))):
                frame = compose(style, band, pixel, exteriors[band] if after else None, places)
                crop = frame.crop(CROP).resize((cw, ch), Image.NEAREST if pixel else Image.LANCZOS)
                label(crop, f"{style} {band} {'after' if after else 'now'}")
                sheet.paste(crop, (col * cw + (col // 2) * 30, row * (ch + 4)))
                if style == 'default' and after:
                    name = f"default-{art}-{band}.jpg"
                    frame.resize((768, 512), Image.NEAREST if pixel else Image.LANCZOS).save(
                        os.path.join(out_dir, name), quality=88)
        sheet.save(os.path.join(out_dir, f'window-{art}.jpg'), quality=90)
        print('wrote', art, flush=True)


if __name__ == '__main__':
    main()

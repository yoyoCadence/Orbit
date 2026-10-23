"""PS-251B: render the view outside the window for one time band, alone.

Usage:
    python3 render_window.py <out_dir> --band morning|evening [--pixel] [--samples N]

Builds the PS-244 scene (the same camera, window and skyline as every room
style), gives the `outside` group the band's colours (BANDS), hides the props
and decorations, and makes every other object a holdout through the object's
`is_holdout` flag. The Holdout material of render_pack.set_occluder() would let
Freestyle draw the room's outlines into the image. With a transparent film the
result is the room-sized RGBA image of only what the window shows; drawn over
any room background, below the furniture, it replaces the baked-in view.

--pixel renders at a quarter of the size with the PS-250D pixel settings; the
result is scaled up 4x by process_window.py.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-pixel'))

import bpy  # noqa: E402
import scene as S  # noqa: E402
import render_pack as R  # noqa: E402

# The window shows the towers almost only (the sky is about 0.1% of it), so
# the band is carried by the tower colours and the lit windows (S1, user
# decision 2026-10-23). Proposal §4; the values are the reviewed draft.
BANDS = {
    'morning': {
        'sky': {'bottom': '#f7c9a0', 'top': '#9ec3ea', 'strength': 1.3},
        'skyline': {'near': ('#8a7fa0', 0.9), 'far': ('#c4a8b8', 1.0), 'glints': ('#ffe2b0', 1.6, 0.10)},
    },
    'evening': {
        'sky': {'bottom': '#f39a62', 'top': '#4b4f8f', 'strength': 1.2},
        'skyline': {'near': ('#4a3f6b', 0.8), 'far': ('#a3708a', 0.9), 'glints': ('#ffd27a', 3.0, 0.40)},
    },
}
PIXEL_WIDTH = 1536 // 4


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('out_dir')
    parser.add_argument('--band', choices=tuple(BANDS), required=True)
    parser.add_argument('--pixel', action='store_true')
    parser.add_argument('--samples', type=int, default=64)
    # Only to check that the overlay is the same for every room style (the
    # styles change materials, never geometry): the runtime uses 'default'.
    parser.add_argument('--style', choices=tuple(S.ROOM_STYLES), default='default')
    args = parser.parse_args(argv)

    # The outside group reads SKY/SKYLINE[lighting]; the room's own lighting
    # does not matter, since the room is a holdout.
    S.SKY['day'] = BANDS[args.band]['sky']
    S.SKYLINE['day'] = BANDS[args.band]['skyline']
    groups = S.build_scene(width=PIXEL_WIDTH if args.pixel else 1536, samples=args.samples, lighting='day',
                           style=args.style)
    scene = bpy.context.scene
    if args.pixel:
        import render_pixel  # noqa: E402
        render_pixel.pixel_settings(scene)
    scene.cycles.use_denoising = False
    scene.render.film_transparent = True
    scene.render.use_freestyle = False

    hidden = set(S.PROP_IDS) | set(S.DECOR_IDS)
    for name, objects in groups.items():
        for obj in objects:
            if name in hidden:
                obj.hide_render = True
            elif name != 'outside':
                obj.is_holdout = True

    os.makedirs(args.out_dir, exist_ok=True)
    style = '' if args.style == 'default' else f'-{args.style}'
    R.render(os.path.join(args.out_dir, f"exterior-{args.band}{'-pixel' if args.pixel else ''}{style}.png"))


if __name__ == '__main__':
    main()

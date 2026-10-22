"""Render the PS-250D pixel room and props with Blender (bpy), at a quarter of
the runtime resolution with no anti-aliasing, so every rendered pixel is one
art pixel.

Usage:
    python3 render_pixel.py <render_dir> [--samples N] [--lighting day|night]
                            [--style <room style>] [--only id,id]

Writes <render_dir>/scene/room.png and <render_dir>/scene/<prop-id>.png at
384 x 256 (<render_dir>/scene-night/ for the PS-250E1 night lighting, and
<render_dir>/scene-<style>[-night]/ for a PS-250E2 room style), and the PS-250F
decorations as <decor-id>.png (--only decor renders just those; --only takes the
same ids as render_pack.py). They come from ps244-blender (the same scene, camera, lights,
shadow catchers and occluders as the Q-style room); only the render settings
change: a quarter of the size, a pixel filter of almost zero, and one-pixel
outlines. The pixel characters need no render: process_pixel.py makes them
from the committed PS-250C sprites.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-rooms'))

import render_pack  # noqa: E402
import rooms  # noqa: E402
import scene as S  # noqa: E402

SCALE = 4                      # room pixels per art pixel
SCENE_WIDTH = 1536 // SCALE    # 384 x 256


def pixel_settings(scene):
    # Almost no pixel filter: each pixel takes one sample position, so edges
    # stay hard instead of blending into the background.
    scene.cycles.filter_width = 0.01
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.0


def render_scene(out_dir, samples, lighting='day', style='default', only=''):
    # render_pack builds the scene through scene.configure_render, so wrapping
    # it applies the pixel settings to the room and every prop render.
    configure = S.configure_render

    def configure_pixel(scene, width, samples):
        configure(scene, width, samples)
        pixel_settings(scene)

    S.configure_render = configure_pixel
    sys.argv = [sys.argv[0], out_dir, '--width', str(SCENE_WIDTH), '--samples', str(samples),
                '--lighting', lighting, '--style', style, '--only', only]
    render_pack.main()


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--lighting', choices=S.LIGHTINGS, default='day')
    parser.add_argument('--style', choices=tuple(S.ROOM_STYLES), default='default')
    parser.add_argument('--only', default='')
    args = parser.parse_args(argv)
    render_scene(os.path.join(args.render_dir, rooms.scene_folder(args.style, args.lighting)),
                 args.samples, args.lighting, args.style, args.only)


if __name__ == '__main__':
    main()

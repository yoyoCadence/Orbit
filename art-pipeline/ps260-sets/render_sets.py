"""Render the PS-260 protagonist sprites with Blender (bpy).

Usage:
    python3 render_sets.py <render_dir> [--samples N] [--protagonists id,...] [--poses id,...]
        [--facings left,right]

Writes <render_dir>/protagonist/<id>-<pose>-<facing>.png with the PS-250C
camera, lights, outline and facings (ps250-characters/rig.py), so the new
sprites sit beside the PS-250C ones. process_sets.py turns them into runtime
sprites.
"""
import argparse
import math
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-characters'))
import sets_catalog as catalog  # noqa: E402
import characters  # noqa: E402
import rig  # noqa: E402
from render_characters import FACING_YAW, parse_list  # noqa: E402

assert list(FACING_YAW) == catalog.FACINGS
assert set(characters.SPECS) == set(catalog.PROTAGONISTS)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--protagonists', default='')
    parser.add_argument('--poses', default='')
    parser.add_argument('--facings', default='')
    args = parser.parse_args(argv)

    out = os.path.join(args.render_dir, 'protagonist')
    os.makedirs(out, exist_ok=True)
    for spec_id in parse_list(args.protagonists, catalog.PROTAGONISTS):
        for pose_id in parse_list(args.poses, catalog.POSES):
            for facing in parse_list(args.facings, catalog.FACINGS):
                scene = rig.protagonist_scene(args.samples)
                root = characters.build(spec_id, pose_id)
                root.rotation_euler = (0, 0, math.radians(FACING_YAW[facing]))
                path = os.path.join(out, f'{spec_id}-{pose_id}-{facing}.png')
                scene.render.filepath = path
                started = time.time()
                bpy.ops.render.render(write_still=True)
                print(f'{os.path.relpath(path)}  {time.time() - started:.1f}s', flush=True)


if __name__ == '__main__':
    main()

"""Render every PS-250C character sprite with Blender (bpy).

Usage:
    python3 render_characters.py <render_dir> [--samples N]
        [--protagonists id,...] [--companions id,...] [--poses id,...] [--states id,...]

Writes <render_dir>/protagonist/<id>-<pose>-<facing>.png and
<render_dir>/companion/<id>-<state>.png as full-canvas renders with a
transparent film. process_characters.py turns them into runtime sprites.
"""
import argparse
import math
import os
import sys
import time

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import catalog  # noqa: E402
import companions  # noqa: E402
import protagonists  # noqa: E402
import rig  # noqa: E402

# Three-quarter turns toward each side of the room. The room camera looks
# slightly from the left, so the turn is not symmetric on screen; the same
# angle on both sides keeps the body proportions identical.
FACING_YAW = {'left': -28, 'right': 28}
assert list(FACING_YAW) == catalog.FACINGS
COMPANION_YAW = -15


def parse_list(value, allowed):
    if not value:
        return list(allowed)
    items = value.split(',')
    unknown = [item for item in items if item not in allowed]
    if unknown:
        raise SystemExit(f'unknown: {", ".join(unknown)} (expected {", ".join(allowed)})')
    return items


def render(scene, path):
    scene.render.filepath = path
    started = time.time()
    bpy.ops.render.render(write_still=True)
    print(f'{os.path.relpath(path)}  {time.time() - started:.1f}s', flush=True)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('render_dir')
    parser.add_argument('--samples', type=int, default=64)
    parser.add_argument('--protagonists', default='')
    parser.add_argument('--companions', default='')
    parser.add_argument('--poses', default='')
    parser.add_argument('--states', default='')
    parser.add_argument('--skip-protagonists', action='store_true')
    parser.add_argument('--skip-companions', action='store_true')
    args = parser.parse_args(argv)

    if not args.skip_protagonists:
        out = os.path.join(args.render_dir, 'protagonist')
        os.makedirs(out, exist_ok=True)
        for spec_id in parse_list(args.protagonists, catalog.PROTAGONISTS):
            for pose_id in parse_list(args.poses, catalog.POSES):
                for facing, yaw in FACING_YAW.items():
                    scene = rig.protagonist_scene(args.samples)
                    root = protagonists.build(spec_id, pose_id)
                    root.rotation_euler = (0, 0, math.radians(yaw))
                    render(scene, os.path.join(out, f'{spec_id}-{pose_id}-{facing}.png'))

    if not args.skip_companions:
        out = os.path.join(args.render_dir, 'companion')
        os.makedirs(out, exist_ok=True)
        for kind in parse_list(args.companions, catalog.COMPANIONS):
            for state in parse_list(args.states, catalog.STATES):
                scene = rig.companion_scene(args.samples)
                root = companions.build(kind, state)
                root.rotation_euler = (0, 0, math.radians(COMPANION_YAW))
                render(scene, os.path.join(out, f'{kind}-{state}.png'))


if __name__ == '__main__':
    main()

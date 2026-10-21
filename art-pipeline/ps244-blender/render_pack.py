"""Render the PS-244 workstation pack with Blender (bpy).

Usage:
    python render_pack.py <out_dir> [--width 1536] [--samples 96] [--only id,id]
                          [--lighting day|night]

Writes full-frame RGBA PNGs to <out_dir>:
    room.png          empty room, transparent outside the diorama
    <prop-id>.png     one prop; floor, walls and its support surface are shadow
                      catchers, so contact shadows stay in the PNG, and any
                      PROP_OCCLUDERS are holdouts that cut out its hidden parts

Every file comes from the same scene, camera and lights in scene.py, so a prop
lands pixel-exact on the room once process_pack.py trims it and derives its
placement. Run process_pack.py next.
"""
import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bpy  # noqa: E402

import scene as S  # noqa: E402


def parse_args():
    argv = sys.argv[1:]
    parser = argparse.ArgumentParser()
    parser.add_argument('out_dir')
    parser.add_argument('--width', type=int, default=1536)
    parser.add_argument('--samples', type=int, default=96)
    parser.add_argument('--only', default='')
    parser.add_argument('--lighting', choices=S.LIGHTINGS, default='day')
    return parser.parse_args(argv)


def set_visible(objects, visible):
    for obj in objects:
        obj.hide_render = not visible


_HOLDOUT_MATERIAL = None
# Saved state of active occluders: materials per data block, keyed by the
# block itself (meshes and curves have separate name spaces; slots are
# DATA-linked, so objects sharing a mesh are swapped once) and ray visibility
# per object.
_ORIGINAL_MATERIALS = {}
_ORIGINAL_VISIBILITY = {}
_RAY_FLAGS = ('visible_shadow', 'visible_diffuse', 'visible_glossy',
              'visible_transmission', 'visible_volume_scatter')


def holdout_material():
    global _HOLDOUT_MATERIAL
    if _HOLDOUT_MATERIAL is None:
        mat = bpy.data.materials.new('occluder-holdout')
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        holdout = nodes.new('ShaderNodeHoldout')
        output = nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(holdout.outputs['Holdout'], output.inputs['Surface'])
        _HOLDOUT_MATERIAL = mat
    return _HOLDOUT_MATERIAL


def set_occluder(obj, enabled):
    """Cut the occluded parts out of this prop without drawing the occluder.

    A Holdout material rather than `is_holdout`: Freestyle leaves holdout
    objects out of its visibility test, so the hidden edges of this prop were
    still outlined over the occluder. With only the material swapped, Freestyle
    still sees the geometry and hides those lines. No shadows, bounces or
    reflections, so the occluder's own shadows are not baked in twice. Both
    the materials and the ray flags are restored exactly when it stops being
    an occluder (the desk is the support surface in later renders).
    """
    data = getattr(obj, 'data', None)
    materials = getattr(data, 'materials', None)
    if enabled:
        if obj.name not in _ORIGINAL_VISIBILITY:
            _ORIGINAL_VISIBILITY[obj.name] = {flag: getattr(obj, flag) for flag in _RAY_FLAGS}
            for flag in _RAY_FLAGS:
                setattr(obj, flag, False)
        if materials is not None and data not in _ORIGINAL_MATERIALS:
            _ORIGINAL_MATERIALS[data] = list(materials)
            if len(materials):
                for index in range(len(materials)):
                    materials[index] = holdout_material()
            else:
                materials.append(holdout_material())
    else:
        saved = _ORIGINAL_VISIBILITY.pop(obj.name, None)
        if saved:
            for flag, value in saved.items():
                setattr(obj, flag, value)
        if materials is not None and data in _ORIGINAL_MATERIALS:
            originals = _ORIGINAL_MATERIALS.pop(data)
            if originals:
                for index, material in enumerate(originals):
                    materials[index] = material
            else:
                materials.clear()


def render(path):
    scene = bpy.context.scene
    scene.render.filepath = path
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.image_settings.color_depth = '8'
    bpy.ops.render.render(write_still=True)
    print('rendered', path, flush=True)


def main():
    args = parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    groups = S.build_scene(width=args.width, samples=args.samples, lighting=args.lighting)
    scene = bpy.context.scene
    scene.render.film_transparent = True
    only = {item for item in args.only.split(',') if item}
    no_lines = S.no_line_collection()

    # The ceiling is invisible to the camera but still blocks light; as a
    # non-catcher its shadow would be recorded over most of the room.
    room = groups['room'] + groups.get('ceiling', [])
    outside = groups.get('outside', [])
    props = {prop_id: groups[prop_id] for prop_id in S.PROP_IDS}

    # 1. Empty room: every prop hidden.
    if not only or 'room' in only:
        for objects in props.values():
            set_visible(objects, False)
        render(os.path.join(args.out_dir, 'room.png'))

    # 2. Each prop alone. Room surfaces and the prop's support become shadow
    #    catchers (transparent except for the shadows cast on them) and are
    #    excluded from outlines; the skyline is hidden.
    set_visible(outside, False)
    for obj in room:
        obj.is_shadow_catcher = True
        if obj.name not in no_lines.objects:
            no_lines.objects.link(obj)
    for prop_id, objects in props.items():
        if only and prop_id not in only:
            continue
        supports = S.PROP_SUPPORTS.get(prop_id, ())
        occluders = S.PROP_OCCLUDERS.get(prop_id, ())
        for other_id, other in props.items():
            is_support = other_id in supports
            is_occluder = other_id in occluders
            set_visible(other, other_id == prop_id or is_support or is_occluder)
            for obj in other:
                obj.is_shadow_catcher = is_support
                set_occluder(obj, is_occluder)
                linked = obj.name in no_lines.objects
                hide_lines = is_support or is_occluder
                if hide_lines and not linked:
                    no_lines.objects.link(obj)
                elif not hide_lines and linked:
                    no_lines.objects.unlink(obj)
        render(os.path.join(args.out_dir, f'{prop_id}.png'))


if __name__ == '__main__':
    main()

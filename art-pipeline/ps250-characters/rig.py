"""Shared primitives, lighting and cameras for the PS-250 Q-style characters.

Characters are built from primitives parented to empties that act as joints,
so a pose is a dict of joint rotations. Materials, Freestyle outlines and the
sun come from the PS-244 room (`ps244-blender/scene.py`), so the characters
read as part of the same diorama.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ps244-blender'))
import scene as S  # noqa: E402

D = math.radians

# Sprite framing. The protagonist is drawn at 24% of the frame, ~369 px of the
# 1536 px room, so the 512 px canvas has about 1.4x the room's texel density
# (the asset pipeline asks for 2x the runtime size). The ground point sits
# where the PS-242 pixel sprites put the feet (241/256), so the runtime
# placement (centre-bottom anchor) needs no change.
PROTAGONIST_SIZE = 512
PROTAGONIST_DRAWN = 0.24 * 1536
PROTAGONIST_GROUND = (0.5, 241 / 256)
PROTAGONIST_ORTHO = 1.16
# The Companion is drawn centred at 13% of the frame (~200 px of the room).
COMPANION_SIZE = 256
COMPANION_DRAWN = 0.13 * 1536
# The room's outline is 1.25 px at 1536; characters get a little more presence
# (2.13 px on the protagonist canvas, 1.97 px on the Companion canvas).
# Thickness is in canvas pixels, so it scales by how large the canvas is drawn.
OUTLINE_IN_ROOM_PX = 1.536
COMPANION_CENTRE_Z = 0.42
COMPANION_ORTHO = 0.86


def mat(name, hex_color, **kw):
    return S.toon_material(name, S.srgb(hex_color), **kw)


def glow(name, hex_color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*S.srgb(hex_color), 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    return o


def smooth(o):
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.shade_smooth()
    return o


def capsule(name, length, r, material, r_end=None):
    """Limb from its joint at the origin down -Z."""
    r_end = r if r_end is None else r_end
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r_end, depth=length,
                                    location=(0, 0, -length / 2), vertices=24)
    c = bpy.context.object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(0, 0, 0), segments=24, ring_count=12)
    a = bpy.context.object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r_end, location=(0, 0, -length), segments=24, ring_count=12)
    b = bpy.context.object
    o = smooth(join([c, a, b], name))
    o.data.materials.append(material)
    return o


def sphere(name, r, loc, material, scale=(1, 1, 1), segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segments, ring_count=segments // 2)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    smooth(o)
    if material is not None:
        o.data.materials.append(material)
    return o


def cone(name, r, depth, loc, rot, material, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0.0, depth=depth, location=loc, rotation=rot, vertices=24)
    o = smooth(bpy.context.object)
    o.name = name
    o.scale = scale
    o.data.materials.append(material)
    return o


def torus(name, major, minor, loc, rot, material):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                     major_segments=40, minor_segments=12)
    o = smooth(bpy.context.object)
    o.name = name
    o.data.materials.append(material)
    return o


def rbox(name, size, loc, material, bevel=0.03, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = o.modifiers.new('bevel', 'BEVEL')
        m.width = bevel
        m.segments = 4
    smooth(o)
    o.data.materials.append(material)
    return o


def tube(name, points, radius, material):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.use_fill_caps = True
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points) - 1)
    for p, co in zip(spline.bezier_points, points):
        p.co = co
        p.handle_left_type = p.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material)
    return o


def parent(child, par):
    child.parent = par
    return child


def empty(name, loc, par=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if par is not None:
        o.parent = par
    return o


def boolean_cut(target, cutter):
    m = target.modifiers.new('cut', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.solver = 'EXACT'
    m.object = cutter
    cutter.hide_render = True
    cutter.hide_viewport = True


def setup(size, drawn, samples, ortho_scale, anchor_world, anchor_pixel):
    """An empty scene with the room's look and an orthographic camera.

    The camera looks along the canonical room camera's direction, so the
    characters are seen from the same angle as the furniture. It is placed so
    that `anchor_world` lands on `anchor_pixel` (fractions of the canvas from
    the top-left), which keeps every pose on the same ground point.
    """
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    S.configure_render(scene, 1536, samples)
    scene.render.resolution_x = scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.line_thickness = OUTLINE_IN_ROOM_PX * size / drawn
    scene.view_layers[0].freestyle_settings.linesets[0].linestyle.alpha = 0.85

    world = bpy.data.worlds.new('world')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (*S.srgb('#1a2348'), 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.4

    # The room's warm sun from the window side (scene.build_lights), turned
    # toward the camera: in the room it comes from behind the characters and
    # would leave every face in shadow. Plus the room's cool front fill.
    bpy.ops.object.light_add(type='SUN', location=(12, 0, 8))
    sun = bpy.context.object
    sun.data.energy = 4.6
    sun.data.color = (1.0, 0.86, 0.68)
    sun.data.angle = D(2.5)
    sun.rotation_euler = (D(52), 0, D(68))
    bpy.ops.object.light_add(type='AREA', location=(-1.2, -3.2, 2.6))
    fill = bpy.context.object
    fill.data.energy = 260
    fill.data.size = 3
    fill.data.color = (0.8, 0.85, 1.0)
    fill.data.use_shadow = False
    fill.rotation_euler = (D(55), 0, D(-22))

    direction = (Vector(S.CAMERA['target']) - Vector(S.CAMERA['location'])).normalized()
    rotation = direction.to_track_quat('-Z', 'Y')
    right = rotation @ Vector((1, 0, 0))
    up = rotation @ Vector((0, 1, 0))
    # Offset of the anchor from the canvas centre, in world units.
    dx = (anchor_pixel[0] - 0.5) * ortho_scale
    dy = (0.5 - anchor_pixel[1]) * ortho_scale
    centre = Vector(anchor_world) - right * dx - up * dy
    bpy.ops.object.camera_add(location=centre - direction * 8)
    cam = bpy.context.object
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = ortho_scale
    cam.rotation_euler = rotation.to_euler()
    scene.camera = cam
    return scene


def protagonist_scene(samples):
    # The soles sit about 2 cm below the rig's origin.
    return setup(PROTAGONIST_SIZE, PROTAGONIST_DRAWN, samples, PROTAGONIST_ORTHO, (0, 0, -0.018),
                 PROTAGONIST_GROUND)


def companion_scene(samples):
    return setup(COMPANION_SIZE, COMPANION_DRAWN, samples, COMPANION_ORTHO, (0, 0, COMPANION_CENTRE_Z),
                 (0.5, 0.5))

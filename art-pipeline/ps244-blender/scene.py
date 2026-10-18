"""PS-244 Formal Workstation scene, built procedurally with Blender's bpy.

Everything in the room comes from this file: geometry, toon materials,
lighting, outline style and the canonical camera. `render_pack.py` imports
`build_scene()` and renders the empty room plus each Workspace Upgrade prop
from the same camera, so every output shares one perspective, scale and light.

Units are metres. Axes: +x right, +y into the room (back wall), +z up.
The front wall and ceiling are cut away for the diorama view.
"""
import math
import random

import bpy
import numpy as np
from mathutils import Euler, Vector

# ── room dimensions ──────────────────────────────────────────────────────────
W, D, H = 8.4, 5.8, 3.0
BACK_Y = D / 2
OUTSIDE_GROUND_Z = -1.0
RIGHT_X = W / 2
LEFT_X = -W / 2

# Desk anchor: centre of the main desktop.
DESK_X, DESK_Y, DESK_TOP = -0.7, 1.75, 0.76

PROP_IDS = (
    'corner-desk', 'office-chair', 'office-shelf', 'desk-lamp',
    'planning-board', 'single-monitor', 'dual-monitor', 'office-plant',
)
# Props whose renders need another prop as the surface they stand on.
PROP_SUPPORTS = {
    'desk-lamp': ('corner-desk',),
    'single-monitor': ('corner-desk',),
    'dual-monitor': ('corner-desk',),
}


# ── colour helpers ───────────────────────────────────────────────────────────
def srgb(hex_color):
    h = hex_color.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)


# ── materials: toon diffuse softened with a little PBR ───────────────────────
def toon_material(name, color, rough=0.55, metal=0.0, gloss=0.0, emission=None, strength=0.0):
    """Illustrated look: a banded Toon BSDF carries the shading, a weaker
    Principled BSDF keeps soft bounce light so shadows never go flat black."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nodes, links = nt.nodes, nt.links
    out = nodes['Material Output']
    pbr = nodes['Principled BSDF']
    pbr.inputs['Base Color'].default_value = (*color, 1)
    pbr.inputs['Roughness'].default_value = rough
    pbr.inputs['Metallic'].default_value = metal
    if emission:
        pbr.inputs['Emission Color'].default_value = (*emission, 1)
        pbr.inputs['Emission Strength'].default_value = strength

    toon = nodes.new('ShaderNodeBsdfToon')
    toon.component = 'DIFFUSE'
    toon.inputs['Color'].default_value = (*color, 1)
    toon.inputs['Size'].default_value = 0.72
    toon.inputs['Smooth'].default_value = 0.18

    mix = nodes.new('ShaderNodeMixShader')
    mix.inputs['Fac'].default_value = 0.42 if metal < 0.5 else 0.7
    links.new(toon.outputs['BSDF'], mix.inputs[1])
    links.new(pbr.outputs['BSDF'], mix.inputs[2])
    shader = mix
    if gloss:
        spec = nodes.new('ShaderNodeBsdfToon')
        spec.component = 'GLOSSY'
        spec.inputs['Color'].default_value = (1, 0.93, 0.82, 1)
        spec.inputs['Size'].default_value = 0.25
        spec.inputs['Smooth'].default_value = 0.1
        add = nodes.new('ShaderNodeMixShader')
        add.inputs['Fac'].default_value = gloss
        links.new(mix.outputs['Shader'], add.inputs[1])
        links.new(spec.outputs['BSDF'], add.inputs[2])
        shader = add
    links.new(shader.outputs[0], out.inputs['Surface'])
    return m


def emission_material(name, color, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*color, 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    return m


def plank_material():
    m = toon_material('floor', srgb('#9a6235'), rough=0.35, gloss=0.18)
    nt = m.node_tree
    coord = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    mapping.inputs['Scale'].default_value = (0.42, 1.55, 1)
    brick = nt.nodes.new('ShaderNodeTexBrick')
    brick.offset = 0.41
    brick.inputs['Color1'].default_value = (*srgb('#a56a3a'), 1)
    brick.inputs['Color2'].default_value = (*srgb('#8d5730'), 1)
    brick.inputs['Mortar'].default_value = (*srgb('#5c3519'), 1)
    brick.inputs['Mortar Size'].default_value = 0.006
    brick.inputs['Scale'].default_value = 1.0
    brick.inputs['Brick Width'].default_value = 1.6
    brick.inputs['Row Height'].default_value = 0.22
    nt.links.new(coord.outputs['Object'], mapping.inputs['Vector'])
    nt.links.new(mapping.outputs['Vector'], brick.inputs['Vector'])
    # Wood grain: distorted bands along each plank, multiplied in lightly so
    # the toon shading still reads as flat colour at card size.
    grain = nt.nodes.new('ShaderNodeTexWave')
    grain.wave_type = 'BANDS'
    grain.bands_direction = 'Y'
    grain.inputs['Scale'].default_value = 9.0
    grain.inputs['Distortion'].default_value = 7.0
    grain.inputs['Detail'].default_value = 3.0
    nt.links.new(coord.outputs['Object'], grain.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*srgb('#c9b39c'), 1)
    ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
    nt.links.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    planks = mix_color(nt, 0.55, brick.outputs['Color'], ramp.outputs['Color'], 'MULTIPLY')
    link_diffuse_color(nt, planks)
    return m


def mix_color(nt, factor, a, b, blend):
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = blend
    mix.inputs['Factor'].default_value = factor
    nt.links.new(a, next(s for s in mix.inputs if s.name == 'A' and s.type == 'RGBA'))
    nt.links.new(b, next(s for s in mix.inputs if s.name == 'B' and s.type == 'RGBA'))
    return next(s for s in mix.outputs if s.type == 'RGBA')


def link_diffuse_color(nt, socket):
    for node in nt.nodes:
        if node.type in ('BSDF_TOON', 'BSDF_PRINCIPLED') and getattr(node, 'component', 'DIFFUSE') == 'DIFFUSE':
            target = 'Color' if node.type == 'BSDF_TOON' else 'Base Color'
            nt.links.new(socket, node.inputs[target])


def cork_material():
    m = toon_material('cork', srgb('#d7b98c'), 0.95)
    nt = m.node_tree
    noise = nt.nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 140.0
    noise.inputs['Detail'].default_value = 4.0
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*srgb('#b38f5f'), 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (*srgb('#e2c79c'), 1)
    nt.links.new(noise.outputs['Fac'], ramp.inputs['Fac'])
    link_diffuse_color(nt, ramp.outputs['Color'])
    return m


def hex_rgb(hex_color):
    h = hex_color.lstrip('#')
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def screen_ui_image(name, layout):
    """A small desktop UI drawn with numpy: title bar, sidebar, and either
    code lines or a dashboard. Byte images are sRGB, so colours go in as-is."""
    # The editor is a bright navy and the dashboard a light theme, so the two
    # screens stay distinct and luminous at Orbit Window card size.
    theme = {
        'code': {'bg': '#1e3566', 'bar': '#2b4a86', 'side': '#19305c', 'item': '#4b67a3'},
        'dashboard': {'bg': '#e9eef6', 'bar': '#c9d6ea', 'side': '#d6e0ef', 'item': '#9fb3d4'},
    }[layout]
    w, h = 384, 216
    img = np.zeros((h, w, 3), np.float32)
    img[:] = hex_rgb(theme['bg'])
    rng = np.random.default_rng(244 if layout == 'code' else 245)

    def rect(x0, y0, x1, y1, color):
        img[y0:y1, x0:x1] = hex_rgb(color)

    rect(0, 0, w, 14, theme['bar'])
    for i, color in enumerate(('#ee6b5f', '#f4c552', '#62c48a')):
        rect(8 + i * 10, 4, 14 + i * 10, 10, color)
    rect(0, 14, 74, h, theme['side'])
    for i in range(9):
        rect(10, 26 + i * 18, 10 + rng.integers(30, 56), 32 + i * 18, theme['item'] if i != 2 else '#4f86d6')
    if layout == 'code':
        palette = ('#8fbcff', '#a6e3d2', '#f5c07f', '#dfe5f2', '#dfe5f2', '#f09cbd')
        for row in range(15):
            y = 24 + row * 12
            x = 88 + 14 * int(rng.integers(0, 4))
            for _ in range(int(rng.integers(1, 4))):
                length = int(rng.integers(14, 70))
                if x + length > w - 12:
                    break
                rect(x, y, x + length, y + 5, palette[int(rng.integers(0, len(palette)))])
                x += length + 6
    else:
        for i, color in enumerate(('#4f86d6', '#2fa597', '#e8964a')):
            rect(88 + i * 98, 24, 176 + i * 98, 58, '#ffffff')
            rect(96 + i * 98, 32, 96 + i * 98 + int(rng.integers(30, 70)), 40, color)
            rect(96 + i * 98, 46, 140 + i * 98, 50, '#b4c2da')
        rect(88, 70, w - 12, h - 12, '#ffffff')
        bars = rng.integers(20, 110, size=12)
        for i, bar in enumerate(bars):
            x = 100 + i * 22
            rect(x, h - 22 - int(bar), x + 12, h - 22, '#2fa597' if i % 3 else '#4f86d6')
    rgba = np.concatenate([img[::-1], np.ones((h, w, 1), np.float32)], axis=2)
    image = bpy.data.images.new(name, w, h)
    image.pixels.foreach_set(rgba.ravel())
    return image


def screen_ui_material(name, layout):
    """Emissive screen showing a drawn UI; use on a plane (UV 0–1)."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    tex = nt.nodes.new('ShaderNodeTexImage')
    tex.image = screen_ui_image(name, layout)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.1
    nt.links.new(tex.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    return m


def screen_material(name, accent):
    """Emissive monitor screen with a simple dashboard layout."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    grad = nt.nodes.new('ShaderNodeValToRGB')
    grad.color_ramp.elements[0].color = (*srgb('#16244a'), 1)
    grad.color_ramp.elements[1].color = (*srgb(accent), 1)
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(coord.outputs['UV'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Y'], grad.inputs['Fac'])
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.4
    nt.links.new(grad.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    return m


def build_materials():
    return {
        'wall': toon_material('wall', srgb('#22305c'), 0.85),
        'wall_low': toon_material('wall_low', srgb('#1b2650'), 0.8),
        'wall_side': toon_material('wall_side', srgb('#1e2a55'), 0.85),
        'trim': toon_material('trim', srgb('#c79a52'), 0.32, metal=0.65, gloss=0.25),
        'floor': plank_material(),
        'ceiling': toon_material('ceiling', srgb('#141b33'), 0.9),
        'slat': toon_material('slat', srgb('#7a4b27'), 0.5),
        'oak': toon_material('oak', srgb('#c3843f'), 0.38, gloss=0.2),
        'oak_dark': toon_material('oak_dark', srgb('#7c4a26'), 0.5),
        'walnut': toon_material('walnut', srgb('#5a3620'), 0.55),
        'steel': toon_material('steel', srgb('#3a3f48'), 0.35, metal=0.85, gloss=0.2),
        'brass': toon_material('brass', srgb('#d9a85a'), 0.3, metal=0.9, gloss=0.3),
        'fabric': toon_material('fabric', srgb('#3a4560'), 0.85),
        'fabric_mesh': toon_material('fabric_mesh', srgb('#46526f'), 0.9),
        'plastic': toon_material('plastic', srgb('#1d2028'), 0.45),
        'bezel': toon_material('bezel', srgb('#15171d'), 0.35, gloss=0.15),
        'screen_a': screen_ui_material('screen_a', 'code'),
        'screen_b': screen_ui_material('screen_b', 'dashboard'),
        'cork': cork_material(),
        'felt': toon_material('felt', srgb('#2c3346'), 0.95),
        'rubber': toon_material('rubber', srgb('#17191f'), 0.8),
        'keycap': toon_material('keycap', srgb('#e9e5dc'), 0.45),
        'kb_base': toon_material('kb_base', srgb('#2a2e38'), 0.45),
        'mug': toon_material('mug', srgb('#e2875f'), 0.35, gloss=0.2),
        'coffee': toon_material('coffee', srgb('#3b2416'), 0.25, gloss=0.3),
        'notebook': toon_material('notebook', srgb('#2f5694'), 0.7),
        'yarn': toon_material('yarn', srgb('#d1453b'), 0.8),
        'rug_field': toon_material('rug_field', srgb('#2f4f63'), 0.95),
        'rug_border': toon_material('rug_border', srgb('#d9c49a'), 0.95),
        'clock_face': toon_material('clock_face', srgb('#f3ecdc'), 0.6),
        'blind': toon_material('blind', srgb('#ddd5c4'), 0.85),
        'curtain': toon_material('curtain', srgb('#41618a'), 0.9),
        'outlet': toon_material('outlet', srgb('#e6e2d8'), 0.5),
        'fixture': toon_material('fixture', srgb('#1a1d24'), 0.35, metal=0.7, gloss=0.2),
        'saucer': toon_material('saucer', srgb('#cfc6b4'), 0.45),
        'paper': toon_material('paper', srgb('#f4ecdb'), 0.9),
        'ink': toon_material('ink', srgb('#4a5572'), 0.9),
        'note_y': toon_material('note_y', srgb('#f4c552'), 0.9),
        'note_b': toon_material('note_b', srgb('#79b4d8'), 0.9),
        'note_r': toon_material('note_r', srgb('#ee8b6f'), 0.9),
        'note_g': toon_material('note_g', srgb('#8fcf8a'), 0.9),
        'pin': toon_material('pin', srgb('#d6443b'), 0.4, gloss=0.3),
        'ceramic': toon_material('ceramic', srgb('#e9e2d4'), 0.4, gloss=0.2),
        'soil': toon_material('soil', srgb('#3b2a1e'), 0.95),
        'leaf': toon_material('leaf', srgb('#3f9a4a'), 0.5, gloss=0.12),
        'leaf_dark': toon_material('leaf_dark', srgb('#2f7a3d'), 0.55),
        'stem': toon_material('stem', srgb('#5a4630'), 0.8),
        'bulb': emission_material('bulb', srgb('#ffe2b0'), 18),
        'window_frame': toon_material('window_frame', srgb('#141a2a'), 0.4, metal=0.6),
        'sill': toon_material('sill', srgb('#c79a52'), 0.35, metal=0.5, gloss=0.2),
        'books': [toon_material(f'book{i}', srgb(c), 0.7) for i, c in enumerate(
            ['#8c3b3b', '#2f5694', '#3f7a52', '#d4a548', '#6a568f', '#a5683f', '#e6dcc4', '#2c6f7a'])],
    }


# ── geometry helpers ─────────────────────────────────────────────────────────
class Builder:
    def __init__(self, materials):
        self.m = materials
        self.groups = {}

    def _finish(self, obj, material, group):
        if material is not None:
            obj.data.materials.append(material)
        self.groups.setdefault(group, []).append(obj)
        return obj

    def box(self, group, size, loc, material, rot=(0, 0, 0), bevel=0.0, segments=3):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
        o = bpy.context.object
        o.scale = size
        bpy.ops.object.transform_apply(scale=True)
        if bevel:
            mod = o.modifiers.new('bevel', 'BEVEL')
            mod.width = bevel
            mod.segments = segments
            mod.limit_method = 'ANGLE'
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
        return self._finish(o, material, group)

    def cyl(self, group, r, depth, loc, material, rot=(0, 0, 0), verts=32, r2=None):
        if r2 is None:
            bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
        else:
            bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
        o = bpy.context.object
        bpy.ops.object.shade_smooth()
        return self._finish(o, material, group)

    def sphere(self, group, r, loc, material, scale=(1, 1, 1), rot=(0, 0, 0), segments=24):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, rotation=rot, segments=segments, ring_count=segments // 2)
        o = bpy.context.object
        o.scale = scale
        bpy.ops.object.shade_smooth()
        return self._finish(o, material, group)

    def torus(self, group, major, minor, loc, material, rot=(0, 0, 0)):
        bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, location=loc, rotation=rot,
                                         major_segments=32, minor_segments=12)
        o = bpy.context.object
        bpy.ops.object.shade_smooth()
        return self._finish(o, material, group)

    def leaf(self, group, loc, length, width, yaw, pitch, material):
        """A curved leaf: a subdivided plane bent along its length."""
        bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0, 0))
        o = bpy.context.object
        o.scale = (width, length, 1)
        bpy.ops.object.transform_apply(scale=True)
        mesh = o.data
        for v in mesh.vertices:
            v.co.y += length / 2
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.subdivide(number_cuts=6)
        bpy.ops.object.mode_set(mode='OBJECT')
        for v in mesh.vertices:
            t = v.co.y / length
            taper = math.sin(math.pi * min(1.0, max(0.0, t))) ** 0.7
            v.co.x *= max(0.05, taper)
            v.co.z = -0.35 * length * t * t + 0.06 * abs(v.co.x) / max(width, 1e-6)
        o.location = loc
        o.rotation_euler = (pitch, 0, yaw)
        mod = o.modifiers.new('thick', 'SOLIDIFY')
        mod.thickness = 0.004
        bpy.ops.object.shade_smooth()
        return self._finish(o, material, group)

    def tube(self, group, points, radius, material):
        """A round cable through `points` (smooth Bezier with auto handles)."""
        curve = bpy.data.curves.new('tube', 'CURVE')
        curve.dimensions = '3D'
        curve.bevel_depth = radius
        curve.bevel_resolution = 3
        curve.use_fill_caps = True
        spline = curve.splines.new('BEZIER')
        spline.bezier_points.add(len(points) - 1)
        for point, co in zip(spline.bezier_points, points):
            point.co = co
            point.handle_left_type = point.handle_right_type = 'AUTO'
        obj = bpy.data.objects.new('tube', curve)
        bpy.context.scene.collection.objects.link(obj)
        return self._finish(obj, material, group)

    def panel(self, group, width, height, thickness, loc, material, rot=(0, 0, 0),
              bend=0.0, wave=(0.0, 0.0), cuts=16):
        """A vertical sheet in the XZ plane, curved toward +y by `bend` at its
        edges and rippled by `wave` = (amplitude, folds), then solidified."""
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=cuts, y_subdivisions=4, size=1, location=(0, 0, 0))
        o = bpy.context.object
        amp, folds = wave
        for v in o.data.vertices:
            u, t = v.co.x, v.co.y
            depth = bend * (2 * u) ** 2 + amp * math.sin(u * folds * 2 * math.pi)
            v.co = (u * width, depth, t * height)
        o.location = loc
        o.rotation_euler = rot
        mod = o.modifiers.new('thick', 'SOLIDIFY')
        mod.thickness = thickness
        mod.offset = 0
        bpy.ops.object.shade_smooth()
        return self._finish(o, material, group)

    def screen(self, group, width, height, loc, yaw, material):
        """A UV 0–1 plane facing −y (toward the camera) after `yaw`."""
        bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(math.pi / 2, 0, yaw))
        o = bpy.context.object
        o.scale = (width, height, 1)
        return self._finish(o, material, group)


# ── room ─────────────────────────────────────────────────────────────────────
def build_room(b):
    m = b.m
    g = 'room'
    b.box(g, (W, D, 0.1), (0, 0, -0.05), m['floor'])
    ceiling = b.box('ceiling', (W, D, 0.1), (0, 0, H + 0.05), m['ceiling'])
    ceiling.visible_camera = False

    # back wall with wainscoting and a chair rail
    b.box(g, (W, 0.1, H), (0, BACK_Y + 0.05, H / 2), m['wall'])
    b.box(g, (W, 0.03, 0.95), (0, BACK_Y - 0.015, 0.475), m['wall_low'])
    b.box(g, (W, 0.05, 0.04), (0, BACK_Y - 0.03, 0.97), m['trim'], bevel=0.008)
    # Wainscot panels as raised moulding frames rather than flat plates.
    for i in range(10):
        x = LEFT_X + 0.47 + i * 0.83
        for dz in (-0.29, 0.29):
            b.box(g, (0.62, 0.016, 0.03), (x, BACK_Y - 0.038, 0.5 + dz), m['wall'], bevel=0.006)
        for dx in (-0.295, 0.295):
            b.box(g, (0.03, 0.016, 0.55), (x + dx, BACK_Y - 0.038, 0.5), m['wall'], bevel=0.006)
    # left wall
    b.box(g, (0.1, D, H), (LEFT_X - 0.05, 0, H / 2), m['wall_side'])
    b.box(g, (0.03, D, 0.95), (LEFT_X + 0.015, 0, 0.475), m['wall_low'])
    b.box(g, (0.05, D, 0.04), (LEFT_X + 0.03, 0, 0.97), m['trim'], bevel=0.008)
    for i in range(2):
        b.box(g, (0.012, 1.5, 1.35), (LEFT_X + 0.035, -1.2 + i * 1.75, 1.85), m['wall_side'], bevel=0.006)
        b.box(g, (0.014, 1.56, 0.03), (LEFT_X + 0.04, -1.2 + i * 1.75, 2.54), m['trim'])
        b.box(g, (0.014, 1.56, 0.03), (LEFT_X + 0.04, -1.2 + i * 1.75, 1.16), m['trim'])
    # baseboards and crown
    b.box(g, (W, 0.03, 0.12), (0, BACK_Y - 0.05, 0.06), m['trim'])
    b.box(g, (0.03, D, 0.12), (LEFT_X + 0.05, 0, 0.06), m['trim'])
    b.box(g, (W, 0.14, 0.09), (0, BACK_Y - 0.07, H - 0.06), m['trim'], bevel=0.01)
    b.box(g, (0.14, D, 0.09), (LEFT_X + 0.07, 0, H - 0.06), m['trim'], bevel=0.01)
    # walnut slat feature on the back wall, left of the desk
    for i in range(10):
        b.box(g, (0.055, 0.05, H - 0.32), (LEFT_X + 0.75 + i * 0.105, BACK_Y - 0.06, (H - 0.32) / 2 + 0.05), m['slat'], bevel=0.006)

    # right wall: floor-to-ceiling window bay
    sill_h, head_h = 0.55, H - 0.35
    b.box(g, (0.1, D, sill_h), (RIGHT_X + 0.05, 0, sill_h / 2), m['wall_side'])
    b.box(g, (0.1, D, H - head_h), (RIGHT_X + 0.05, 0, (H + head_h) / 2), m['wall_side'])
    b.box(g, (0.1, 0.5, H), (RIGHT_X + 0.05, BACK_Y - 0.25, H / 2), m['wall_side'])
    b.box(g, (0.1, 0.5, H), (RIGHT_X + 0.05, -BACK_Y + 0.25, H / 2), m['wall_side'])
    b.box(g, (0.22, D - 1.0, 0.05), (RIGHT_X - 0.06, 0, sill_h + 0.025), m['sill'], bevel=0.01)
    span = D - 1.0
    for i in range(5):
        y = -span / 2 + i * span / 4
        b.box(g, (0.07, 0.06, head_h - sill_h), (RIGHT_X - 0.01, y, (head_h + sill_h) / 2), m['window_frame'])
    b.box(g, (0.07, span, 0.06), (RIGHT_X - 0.01, 0, sill_h + 0.03), m['window_frame'])
    b.box(g, (0.07, span, 0.06), (RIGHT_X - 0.01, 0, head_h - 0.03), m['window_frame'])
    b.box(g, (0.07, span, 0.04), (RIGHT_X - 0.01, 0, 1.75), m['window_frame'])
    b.box(g, (0.03, D, 0.12), (RIGHT_X - 0.02, 0, 0.06), m['trim'])

    build_room_details(b)

    # skyline outside the window (no outlines)
    sky = bpy.data.materials.new('sky')
    sky.use_nodes = True
    nt = sky.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*srgb('#f5c58a'), 1)
    ramp.color_ramp.elements[1].color = (*srgb('#5f94d6'), 1)
    ramp.color_ramp.elements[0].position = 0.35
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = 1.6
    nt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], em.inputs['Color'])
    nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
    # Outside geometry exists only inside the cone the canonical camera can see
    # through the window. Anything else shows above the cut-away walls, so each
    # tower is placed along a camera ray through the window opening and kept
    # under the sightline that grazes the top of the right wall.
    cam_x, cam_y, cam_z = CAMERA['location']
    def through_window(y_window, x):
        slope = (y_window - cam_y) / (RIGHT_X - cam_x)
        return y_window + (x - RIGHT_X) * slope
    def over_wall_z(x):
        return H - (cam_z - H) / (RIGHT_X - cam_x) * (x - RIGHT_X)

    sky_x = RIGHT_X + 9
    y_lo, y_hi = through_window(-D / 2, sky_x), through_window(D / 2, sky_x)
    # Rays through the window reach the sky plane between the bottom of the
    # window ray fan and the over-wall sightline; anything lower is only seen
    # past the cut-away floor edge, so the plane stops there.
    sky_bottom = cam_z + (0.45 - cam_z) * (sky_x - cam_x) / (RIGHT_X - cam_x)
    sky_top = over_wall_z(sky_x) - 0.05
    b.box('outside', (0.1, y_hi - y_lo + 4, sky_top - sky_bottom), (sky_x, (y_lo + y_hi) / 2, (sky_top + sky_bottom) / 2), sky)
    # daylight skyline: flat, hazy silhouettes read as distance
    city_near = emission_material('city_near', srgb('#56729f'), 0.9)
    city_far = emission_material('city_far', srgb('#8aa6cf'), 1.0)
    glints = emission_material('city_glints', srgb('#e8f1ff'), 1.4)
    rng = random.Random(11)
    span = D - 1.0
    for i in range(18):
        x = RIGHT_X + rng.uniform(1.4, 6.5)
        y = through_window(-span / 2 + (i + rng.uniform(0, 0.8)) * span / 18, x)
        w = rng.uniform(1.0, 1.6)
        top = over_wall_z(x) - 0.4 - rng.uniform(0, 1.6)
        h = top - OUTSIDE_GROUND_Z
        far = x > RIGHT_X + 4
        b.box('outside', (1.2, w, h), (x, y, OUTSIDE_GROUND_Z + h / 2), city_far if far else city_near)
        for k in range(int(h / 0.5)):
            if rng.random() < 0.25:
                b.box('outside', (0.02, w * 0.7, 0.05), (x - 0.61, y, OUTSIDE_GROUND_Z + 0.3 + k * 0.5), glints)

    # Holdouts: nothing below the floor line may ever reach the frame. The
    # background is rendered with a transparent film and composited over a
    # designed backdrop, so these read as clean empty space around the diorama.
    under = b.box('holdout', (W + 0.2, D + 0.2, 30), (0.05, 0, -15.02), None)
    under.is_holdout = True
    ground = b.box('holdout', (60, 120, 0.02), (RIGHT_X + 30.06, 30, OUTSIDE_GROUND_Z - 0.01), None)
    ground.is_holdout = True


def build_room_details(b):
    m, g = b.m, 'room'
    # Rug under the characters' standing area, in front of the workstation.
    rx, ry, rw, rd = 1.0, -1.85, 2.8, 2.0
    b.box(g, (rw, rd, 0.01), (rx, ry, 0.005), m['rug_border'], bevel=0.004)
    b.box(g, (rw - 0.16, rd - 0.16, 0.012), (rx, ry, 0.006), m['rug_field'], bevel=0.003)
    inset = 0.28
    for dy in (-1, 1):
        b.box(g, (rw - 2 * inset, 0.035, 0.013), (rx, ry + dy * (rd / 2 - inset), 0.0065), m['rug_border'])
    for dx in (-1, 1):
        b.box(g, (0.035, rd - 2 * inset, 0.013), (rx + dx * (rw / 2 - inset), ry, 0.0065), m['rug_border'])

    # Wall sconces under the crown, one above each warm light pool. The spot
    # lights sit in front of and above them, so the fixtures cast no shadow;
    # otherwise each would print a dark wedge into its own pool.
    for x in (-2.4, -0.8, 0.8, 2.4):
        parts = (
            b.box(g, (0.07, 0.02, 0.12), (x, BACK_Y - 0.01, H - 0.28), m['fixture'], bevel=0.006),
            b.cyl(g, 0.008, 0.2, (x, BACK_Y - 0.11, H - 0.26), m['fixture'], rot=(math.pi / 2, 0, 0), verts=10),
            b.cyl(g, 0.045, 0.1, (x, BACK_Y - 0.23, H - 0.29), m['fixture'], rot=(math.radians(-35), 0, 0), r2=0.03),
        )
        for part in parts:
            part.visible_shadow = False

    # Wall clock above the shelf, below the fourth sconce.
    ccx, ccy, ccz = RIGHT_X - 1.75, BACK_Y - 0.03, 2.28
    b.cyl(g, 0.19, 0.04, (ccx, ccy, ccz), m['walnut'], rot=(math.pi / 2, 0, 0))
    b.cyl(g, 0.165, 0.006, (ccx, ccy - 0.022, ccz), m['clock_face'], rot=(math.pi / 2, 0, 0))
    for k in range(12):
        a = k * math.pi / 6
        length = 0.03 if k % 3 == 0 else 0.016
        b.box(g, (0.008, 0.003, length), (ccx + 0.14 * math.sin(a), ccy - 0.026, ccz + 0.14 * math.cos(a)),
              m['ink'], rot=(0, a, 0))
    b.box(g, (0.012, 0.003, 0.09), (ccx + 0.03, ccy - 0.028, ccz + 0.03), m['ink'], rot=(0, math.radians(45), 0))
    b.box(g, (0.008, 0.003, 0.13), (ccx - 0.045, ccy - 0.03, ccz + 0.045), m['ink'], rot=(0, math.radians(-45), 0))
    b.cyl(g, 0.012, 0.01, (ccx, ccy - 0.031, ccz), m['brass'], rot=(math.pi / 2, 0, 0), verts=12)

    # Power outlets on the wainscot.
    for x in (DESK_X + 1.3, RIGHT_X - 2.55):
        b.box(g, (0.08, 0.012, 0.12), (x, BACK_Y - 0.05, 0.3), m['outlet'], bevel=0.004)
        for dz in (-0.025, 0.025):
            b.box(g, (0.03, 0.004, 0.012), (x, BACK_Y - 0.057, 0.3 + dz), m['plastic'])

    # Roller blinds on the two back window bays, and a curtain at the corner.
    head = H - 0.35
    for (y0, y1), drop in (((1.2, 2.4), 0.95), ((0.0, 1.2), 0.45)):
        cy, width = (y0 + y1) / 2, y1 - y0 - 0.08
        b.cyl(g, 0.035, width + 0.04, (RIGHT_X - 0.09, cy, head - 0.05), m['blind'], rot=(math.pi / 2, 0, 0))
        b.box(g, (0.01, width, drop), (RIGHT_X - 0.08, cy, head - 0.05 - drop / 2), m['blind'])
        b.box(g, (0.02, width, 0.025), (RIGHT_X - 0.08, cy, head - 0.05 - drop), m['walnut'], bevel=0.004)
    b.cyl(g, 0.015, 1.1, (RIGHT_X - 0.16, BACK_Y - 0.55, H - 0.2), m['brass'], rot=(math.pi / 2, 0, 0), verts=12)
    b.panel(g, 0.5, H - 0.32, 0.02, (RIGHT_X - 0.16, BACK_Y - 0.5, (H - 0.32) / 2 + 0.06), m['curtain'],
            rot=(0, 0, math.pi / 2), wave=(0.035, 3.5), cuts=48)


# ── props ────────────────────────────────────────────────────────────────────
def build_desk(b):
    m, g = b.m, 'corner-desk'
    x0, y0, top = DESK_X, DESK_Y, DESK_TOP
    # Main top and the return wing: oak slab over a walnut edge band.
    for cx, cy, sx, sy in ((x0, y0, 2.0, 0.78), (x0 + 0.66, y0 - 0.95, 0.68, 1.15)):
        b.box(g, (sx, sy, 0.032), (cx, cy, top - 0.016), m['oak'], bevel=0.01)
        b.box(g, (sx - 0.03, sy - 0.03, 0.016), (cx, cy, top - 0.04), m['walnut'], bevel=0.004)

    # Left drawer pedestal on a recessed plinth.
    px, body_h = x0 - 0.74, top - 0.12
    b.box(g, (0.46, 0.7, body_h), (px, y0, 0.06 + body_h / 2), m['oak_dark'], bevel=0.008)
    b.box(g, (0.42, 0.64, 0.06), (px, y0 + 0.02, 0.03), m['walnut'])
    for i in range(3):
        z = 0.17 + i * 0.2
        b.box(g, (0.42, 0.02, 0.18), (px, y0 - 0.355, z), m['oak'], bevel=0.006)
        b.cyl(g, 0.008, 0.16, (px, y0 - 0.39, z + 0.045), m['brass'], rot=(0, math.pi / 2, 0), verts=12)
        for side in (-1, 1):
            b.cyl(g, 0.005, 0.03, (px + side * 0.07, y0 - 0.375, z + 0.045), m['brass'], rot=(math.pi / 2, 0, 0), verts=8)

    # Return cabinet: door on the end that faces the room.
    cx, cy = x0 + 0.66, y0 - 1.22
    b.box(g, (0.62, 0.55, body_h), (cx, cy, 0.06 + body_h / 2), m['oak_dark'], bevel=0.008)
    b.box(g, (0.58, 0.5, 0.06), (cx, cy + 0.02, 0.03), m['walnut'])
    b.box(g, (0.56, 0.02, 0.56), (cx, cy - 0.285, 0.38), m['oak'], bevel=0.006)
    b.cyl(g, 0.008, 0.2, (cx + 0.2, cy - 0.31, 0.44), m['brass'], verts=12)

    # Modesty panel, steel legs with rubber feet, and a cable tray.
    b.box(g, (1.5, 0.02, 0.45), (x0 + 0.2, y0 + 0.33, top - 0.3), m['walnut'], bevel=0.004)
    for lx, ly in ((x0 + 0.28, y0 + 0.3), (x0 + 0.95, y0 + 0.3), (x0 + 0.95, y0 - 0.25)):
        b.box(g, (0.05, 0.05, top - 0.07), (lx, ly, (top - 0.07) / 2 + 0.02), m['steel'], bevel=0.006)
        b.box(g, (0.075, 0.075, 0.02), (lx, ly, 0.01), m['rubber'], bevel=0.005)
    tray_z = top - 0.2
    b.box(g, (1.0, 0.12, 0.008), (x0 + 0.3, y0 + 0.24, tray_z), m['steel'])
    for dy in (-0.06, 0.06):
        b.box(g, (1.0, 0.006, 0.05), (x0 + 0.3, y0 + 0.24 + dy, tray_z + 0.025), m['steel'])
    b.tube(g, [(x0 - 0.15, y0 + 0.24, tray_z + 0.015), (x0 + 0.3, y0 + 0.25, tray_z + 0.02),
               (x0 + 0.78, y0 + 0.26, tray_z + 0.015), (x0 + 0.86, y0 + 0.3, 0.3), (x0 + 0.9, y0 + 0.36, 0.01)],
           0.01, m['rubber'])
    b.cyl(g, 0.03, 0.05, (x0 + 0.55, y0 + 0.25, top - 0.02), m['plastic'])

    # Desk dressing: felt mat, notebook and pen, a mug on the return.
    b.box(g, (0.9, 0.42, 0.004), (x0 + 0.2, y0 - 0.13, top + 0.002), m['felt'], bevel=0.008)
    b.box(g, (0.21, 0.29, 0.014), (x0 - 0.42, y0 - 0.1, top + 0.007), m['notebook'], rot=(0, 0, 0.25), bevel=0.004)
    b.box(g, (0.19, 0.27, 0.004), (x0 - 0.415, y0 - 0.1, top + 0.016), m['paper'], rot=(0, 0, 0.25))
    b.cyl(g, 0.005, 0.14, (x0 - 0.36, y0 - 0.12, top + 0.022), m['steel'], rot=(math.pi / 2, 0, 0.6), verts=8)
    mx, my = x0 + 0.74, y0 - 1.2
    b.cyl(g, 0.042, 0.095, (mx, my, top + 0.0475), m['mug'])
    b.cyl(g, 0.036, 0.004, (mx, my, top + 0.088), m['coffee'])
    b.torus(g, 0.028, 0.008, (mx + 0.045, my, top + 0.05), m['mug'], rot=(math.pi / 2, 0, 0))


def build_chair(b):
    m, g = b.m, 'office-chair'
    cx, cy = DESK_X + 0.1, DESK_Y - 0.82
    back_tilt = math.radians(-10)
    # Seat cushion on a plastic shell.
    b.box(g, (0.5, 0.48, 0.08), (cx, cy, 0.48), m['fabric'], bevel=0.035)
    b.box(g, (0.46, 0.44, 0.03), (cx, cy, 0.425), m['plastic'], bevel=0.01)
    # Curved mesh back on a plastic frame, lumbar pad and headrest.
    b.panel(g, 0.46, 0.56, 0.03, (cx, cy - 0.27, 0.86), m['fabric_mesh'], rot=(back_tilt, 0, 0), bend=0.05)
    b.panel(g, 0.5, 0.6, 0.02, (cx, cy - 0.3, 0.86), m['plastic'], rot=(back_tilt, 0, 0), bend=0.05)
    b.box(g, (0.34, 0.05, 0.1), (cx, cy - 0.235, 0.72), m['fabric'], rot=(back_tilt, 0, 0), bevel=0.02)
    for side in (-1, 1):
        b.cyl(g, 0.008, 0.08, (cx + side * 0.08, cy - 0.33, 1.18), m['steel'], verts=10)
    b.box(g, (0.3, 0.06, 0.12), (cx, cy - 0.34, 1.26), m['fabric'], rot=(math.radians(-14), 0, 0), bevel=0.03)
    # Armrests: post, support arm, pad.
    for side in (-1, 1):
        ax = cx + side * 0.28
        b.box(g, (0.035, 0.05, 0.22), (ax, cy - 0.06, 0.58), m['plastic'], bevel=0.01)
        b.box(g, (0.03, 0.2, 0.03), (ax, cy - 0.02, 0.68), m['plastic'], bevel=0.008)
        b.box(g, (0.075, 0.28, 0.035), (ax, cy + 0.0, 0.71), m['fabric'], bevel=0.015)
    # Gas lift with a shroud, five-star base and casters.
    b.cyl(g, 0.025, 0.3, (cx, cy, 0.29), m['steel'])
    b.cyl(g, 0.045, 0.14, (cx, cy, 0.19), m['plastic'], r2=0.034)
    for i in range(5):
        a = i * 2 * math.pi / 5 + 0.3
        ca, sa = math.cos(a), math.sin(a)
        b.box(g, (0.3, 0.045, 0.035), (cx + 0.15 * ca, cy + 0.15 * sa, 0.085), m['plastic'], rot=(0, 0, a), bevel=0.01)
        wx, wy = cx + 0.3 * ca, cy + 0.3 * sa
        b.box(g, (0.03, 0.03, 0.03), (wx, wy, 0.065), m['plastic'], bevel=0.006)
        for off in (-0.012, 0.012):
            b.cyl(g, 0.026, 0.016, (wx - off * sa, wy + off * ca, 0.027), m['rubber'], rot=(math.pi / 2, 0, a), verts=16)


def build_shelf(b):
    m, g = b.m, 'office-shelf'
    sx, sy, sw, sd, sh = RIGHT_X - 1.75, BACK_Y - 0.22, 1.15, 0.36, 1.95
    for side in (-1, 1):
        b.box(g, (0.04, sd, sh), (sx + side * (sw / 2), sy, sh / 2), m['walnut'], bevel=0.006)
    b.box(g, (sw + 0.04, 0.02, sh), (sx, sy + sd / 2 - 0.01, sh / 2), m['oak_dark'])
    for i in range(1, 9):
        b.box(g, (0.006, 0.004, sh - 0.1), (sx - sw / 2 + i * sw / 9, sy + sd / 2 - 0.022, sh / 2), m['walnut'])
    b.box(g, (sw + 0.08, sd + 0.04, 0.04), (sx, sy - 0.01, sh + 0.02), m['walnut'], bevel=0.008)
    b.box(g, (sw - 0.04, sd - 0.04, 0.06), (sx, sy + 0.01, 0.03), m['oak_dark'])
    rng = random.Random(7)
    for row in range(5):
        z0 = 0.08 + row * 0.38
        b.box(g, (sw, sd, 0.03), (sx, sy, z0 - 0.015), m['walnut'], bevel=0.004)
        if row == 4:
            # Top shelf decor: framed photo, a small trophy and a plant.
            b.box(g, (0.18, 0.03, 0.22), (sx - 0.36, sy + 0.05, z0 + 0.11), m['steel'], rot=(math.radians(-8), 0, 0), bevel=0.006)
            b.box(g, (0.14, 0.01, 0.17), (sx - 0.36, sy + 0.03, z0 + 0.115), m['note_b'], rot=(math.radians(-8), 0, 0))
            b.box(g, (0.09, 0.07, 0.03), (sx - 0.06, sy, z0 + 0.015), m['walnut'], bevel=0.004)
            b.cyl(g, 0.01, 0.07, (sx - 0.06, sy, z0 + 0.065), m['brass'], verts=12)
            b.cyl(g, 0.05, 0.08, (sx - 0.06, sy, z0 + 0.135), m['brass'], r2=0.025)
            b.cyl(g, 0.07, 0.12, (sx + 0.32, sy, z0 + 0.06), m['ceramic'])
            for k in range(7):
                b.leaf(g, (sx + 0.32, sy, z0 + 0.11), 0.17, 0.07, k * 0.9, math.radians(-35), m['leaf'])
            continue
        x = sx - sw / 2 + 0.04
        end = sx + sw / 2 - 0.04
        decor = row % 2
        limit = end - (0.26 if decor else 0.16)
        while x < limit:
            w = rng.uniform(0.028, 0.055)
            hgt = rng.uniform(0.2, 0.33)
            depth = rng.uniform(0.19, 0.25)
            lean = rng.choice([0, 0, 0, 0, 0.12]) if x < limit - 0.12 else 0
            book = rng.choice(m['books'])
            yb = sy - sd / 2 + depth / 2 + 0.03
            b.box(g, (w, depth, hgt), (x + w / 2, yb, z0 + hgt / 2), book, rot=(0, lean, 0), bevel=0.004)
            if not lean and rng.random() < 0.7:
                band = m['brass'] if rng.random() < 0.5 else m['paper']
                b.box(g, (w * 0.9, 0.003, 0.02), (x + w / 2, yb - depth / 2 - 0.001, z0 + hgt * 0.72), band, bevel=0.0)
            x += w + 0.005
        # bookend, then a lying stack or a storage box
        b.box(g, (0.006, 0.12, 0.14), (x + 0.01, sy - 0.05, z0 + 0.07), m['steel'])
        b.box(g, (0.1, 0.12, 0.006), (x + 0.06, sy - 0.05, z0 + 0.003), m['steel'])
        if decor:
            b.box(g, (0.2, 0.24, 0.13), (end - 0.11, sy - 0.03, z0 + 0.065), m['oak'], bevel=0.008)
            b.box(g, (0.09, 0.004, 0.04), (end - 0.11, sy - 0.152, z0 + 0.07), m['paper'])
        else:
            for k in range(3):
                b.box(g, (0.24 - k * 0.02, 0.17, 0.035), (end - 0.1, sy - 0.04, z0 + 0.018 + k * 0.036),
                      rng.choice(m['books']), rot=(0, 0, rng.uniform(-0.12, 0.12)), bevel=0.004)


def build_lamp(b):
    m, g = b.m, 'desk-lamp'
    lx, ly = DESK_X - 0.75, DESK_Y + 0.18
    base_z = DESK_TOP
    b.cyl(g, 0.08, 0.025, (lx, ly, base_z + 0.0125), m['steel'])
    b.torus(g, 0.068, 0.006, (lx, ly, base_z + 0.026), m['brass'])
    p1 = Vector((lx, ly, base_z + 0.03))
    p2 = Vector((lx + 0.02, ly - 0.08, base_z + 0.42))
    p3 = Vector((lx + 0.2, ly - 0.24, base_z + 0.52))
    for a, c in ((p1, p2), (p2, p3)):
        d = c - a
        rot = d.to_track_quat('Z', 'Y').to_euler()
        for off in (-0.013, 0.013):
            mid = (a + c) / 2 + Vector((off, 0, 0))
            b.cyl(g, 0.007, d.length, mid, m['steel'], rot=rot, verts=12)
    for joint in (p1 + Vector((0, 0, 0.01)), p2, p3):
        b.cyl(g, 0.02, 0.04, joint, m['brass'], rot=(0, math.pi / 2, 0), verts=16)
    shade_dir = Vector((0.15, -0.3, -0.75)).normalized()
    shade_rot = (-shade_dir).to_track_quat('Z', 'Y').to_euler()
    b.cyl(g, 0.085, 0.13, p3 + shade_dir * 0.05, m['steel'], rot=shade_rot, r2=0.03)
    b.torus(g, 0.085, 0.006, p3 + shade_dir * 0.115, m['brass'], rot=shade_rot)
    b.sphere(g, 0.03, p3 + shade_dir * 0.1, m['bulb'])
    b.tube(g, [(lx, ly + 0.07, base_z + 0.008), (lx + 0.08, ly + 0.16, base_z + 0.006),
               (lx + 0.14, DESK_Y + 0.39, base_z - 0.01), (lx + 0.16, DESK_Y + 0.42, 0.35)], 0.005, m['rubber'])


def build_board(b):
    m, g = b.m, 'planning-board'
    bx, bz, bw, bh = DESK_X + 0.05, 1.78, 1.25, 0.82
    y = BACK_Y - 0.03
    b.box(g, (bw, 0.025, bh), (bx, y - 0.01, bz), m['cork'], bevel=0.002)
    for dz in (-1, 1):
        b.box(g, (bw + 0.1, 0.045, 0.05), (bx, y - 0.015, bz + dz * (bh / 2 + 0.025)), m['oak'], bevel=0.008)
    for dx in (-1, 1):
        b.box(g, (0.05, 0.045, bh), (bx + dx * (bw / 2 + 0.025), y - 0.015, bz), m['oak'], bevel=0.008)
    notes = [(-0.46, 0.2, 'paper', 0.24, 0.28), (-0.16, 0.24, 'note_y', 0.14, 0.14), (0.06, 0.18, 'note_b', 0.14, 0.14),
             (-0.44, -0.19, 'note_g', 0.14, 0.14), (-0.14, -0.17, 'paper', 0.24, 0.18), (0.12, -0.21, 'note_r', 0.14, 0.14)]
    rng = random.Random(3)
    pins = []
    for nx, nz, mat, w, h in notes:
        tilt = math.radians(rng.uniform(-6, 6))
        b.box(g, (w, 0.004, h), (bx + nx, y - 0.025, bz + nz), m[mat], rot=(0, tilt, 0))
        if mat == 'paper':
            for k in range(3):
                b.box(g, (w * 0.7, 0.002, 0.012), (bx + nx, y - 0.028, bz + nz + h * 0.25 - k * 0.05), m['ink'], rot=(0, tilt, 0))
        pin = Vector((bx + nx, y - 0.033, bz + nz + h / 2 - 0.02))
        b.sphere(g, 0.014, pin, m['pin'])
        pins.append(pin)
    for chain in ((0, 1, 2), (3, 4, 5)):
        b.tube(g, [tuple(pins[i] + Vector((0, -0.006, 0))) for i in chain], 0.0025, m['yarn'])
    # Month calendar and a pinned photo.
    cxp, czp = bx + 0.42, bz + 0.16
    b.box(g, (0.3, 0.004, 0.3), (cxp, y - 0.025, czp), m['paper'])
    b.box(g, (0.3, 0.005, 0.05), (cxp, y - 0.027, czp + 0.125), m['note_r'])
    for r in range(4):
        for c in range(5):
            mat = m['note_r'] if (r, c) == (2, 3) else m['ink']
            b.box(g, (0.035, 0.002, 0.03), (cxp - 0.11 + c * 0.055, y - 0.028, czp + 0.06 - r * 0.055), mat)
    b.sphere(g, 0.014, (cxp, y - 0.033, czp + 0.13), m['pin'])
    tilt = math.radians(5)
    b.box(g, (0.15, 0.004, 0.17), (bx + 0.42, y - 0.025, bz - 0.21), m['paper'], rot=(0, tilt, 0))
    b.box(g, (0.12, 0.002, 0.11), (bx + 0.42, y - 0.028, bz - 0.195), m['note_b'], rot=(0, tilt, 0))
    b.sphere(g, 0.014, (bx + 0.42, y - 0.033, bz - 0.135), m['pin'])


def build_monitor(b, g, x, y, yaw, screen_mat):
    m = b.m
    top = DESK_TOP
    rot = (0, 0, yaw)

    def at(dx, dy):
        v = Vector((dx, dy, 0))
        v.rotate(Euler(rot))
        return x + v.x, y + v.y

    b.box(g, (0.64, 0.022, 0.4), (x, y, top + 0.465), m['bezel'], rot=rot, bevel=0.006)
    hx, hy = at(0, 0.03)
    b.box(g, (0.5, 0.04, 0.28), (hx, hy, top + 0.47), m['plastic'], rot=rot, bevel=0.03)
    sx, sy = at(0, -0.0115)
    b.screen(g, 0.615, 0.345, (sx, sy, top + 0.477), yaw, screen_mat)
    lx, ly = at(0, -0.0112)
    b.box(g, (0.03, 0.002, 0.006), (lx, ly, top + 0.282), m['steel'], rot=rot)


def build_keyboard(b, g, x, y):
    m = b.m
    top = DESK_TOP
    b.box(g, (0.44, 0.14, 0.016), (x, y, top + 0.008), m['kb_base'], bevel=0.006)
    pitch = 0.0265
    for r in range(4):
        cols = 15 if r < 3 else 12
        for c in range(cols):
            kx = x - 0.185 + c * pitch + (0.008 if r == 2 else 0) + (0.014 if r == 3 else 0)
            b.box(g, (0.022, 0.022, 0.009), (kx, y + 0.042 - r * pitch, top + 0.02), m['keycap'], bevel=0.003, segments=2)
    b.box(g, (0.14, 0.022, 0.009), (x + 0.02, y + 0.042 - 4 * pitch, top + 0.02), m['keycap'], bevel=0.003, segments=2)
    b.sphere(g, 0.03, (x + 0.33, y, top + 0.014), m['keycap'], scale=(0.7, 1.1, 0.45))


def build_single_monitor(b):
    g = 'single-monitor'
    x, y = DESK_X + 0.15, DESK_Y + 0.12
    build_monitor(b, g, x, y, 0.0, b.m['screen_a'])
    b.box(g, (0.06, 0.04, 0.26), (x, y + 0.06, DESK_TOP + 0.14), b.m['steel'], rot=(math.radians(6), 0, 0), bevel=0.01)
    b.box(g, (0.25, 0.19, 0.012), (x, y + 0.04, DESK_TOP + 0.006), b.m['steel'], bevel=0.006)
    build_keyboard(b, g, x, DESK_Y - 0.17)


def build_dual_monitor(b):
    g = 'dual-monitor'
    x, y = DESK_X + 0.15, DESK_Y + 0.12
    for side, mat in ((-1, b.m['screen_a']), (1, b.m['screen_b'])):
        yaw = math.radians(-12 * side)
        build_monitor(b, g, x + side * 0.33, y - 0.03, yaw, mat)
        b.box(g, (0.1, 0.02, 0.1), (x + side * 0.31, y + 0.035, DESK_TOP + 0.47), b.m['steel'], rot=(0, 0, yaw), bevel=0.004)
    b.cyl(g, 0.022, 0.46, (x, y + 0.08, DESK_TOP + 0.23), b.m['steel'], verts=16)
    b.box(g, (0.62, 0.03, 0.03), (x, y + 0.06, DESK_TOP + 0.47), b.m['steel'], bevel=0.006)
    b.box(g, (0.08, 0.06, 0.06), (x, y + 0.08, DESK_TOP + 0.47), b.m['plastic'], bevel=0.01)
    b.box(g, (0.1, 0.1, 0.02), (x, y + 0.08, DESK_TOP + 0.01), b.m['steel'], bevel=0.006)
    build_keyboard(b, g, x, DESK_Y - 0.17)


def build_plant(b):
    m, g = b.m, 'office-plant'
    px, py = RIGHT_X - 0.75, 0.75
    b.cyl(g, 0.23, 0.025, (px, py, 0.0125), m['saucer'])
    b.cyl(g, 0.2, 0.42, (px, py, 0.235), m['ceramic'], r2=0.16)
    b.torus(g, 0.2, 0.018, (px, py, 0.445), m['ceramic'])
    b.cyl(g, 0.185, 0.02, (px, py, 0.425), m['soil'])
    rng = random.Random(5)
    stems = [(0.0, 0.0, 1.4), (0.06, 0.04, 1.15), (-0.05, 0.03, 1.0), (0.03, -0.05, 0.85)]
    for sx, sy, sh in stems:
        b.cyl(g, 0.012, sh - 0.42, (px + sx, py + sy, 0.42 + (sh - 0.42) / 2), m['stem'], verts=10)
        count = 11
        for k in range(count):
            z = 0.62 + (sh - 0.62) * k / (count - 1)
            yaw = rng.uniform(0, 2 * math.pi)
            mat = m['leaf'] if k % 3 else m['leaf_dark']
            size = 1.15 - 0.35 * k / (count - 1)
            b.leaf(g, (px + sx, py + sy, z), rng.uniform(0.2, 0.27) * size, rng.uniform(0.11, 0.15) * size, yaw,
                   math.radians(rng.uniform(-55, -25)), mat)


PROP_BUILDERS = {
    'corner-desk': build_desk,
    'office-chair': build_chair,
    'office-shelf': build_shelf,
    'desk-lamp': build_lamp,
    'planning-board': build_board,
    'single-monitor': build_single_monitor,
    'dual-monitor': build_dual_monitor,
    'office-plant': build_plant,
}


# ── lights, camera, render style ─────────────────────────────────────────────
def build_lighting(scene):
    world = bpy.data.worlds.new('world')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (*srgb('#1a2348'), 1)
    bg.inputs['Strength'].default_value = 1.4

    bpy.ops.object.light_add(type='SUN', location=(12, 0, 8))
    sun = bpy.context.object
    sun.data.energy = 6.5
    sun.data.color = (1.0, 0.86, 0.68)
    sun.data.angle = math.radians(2.5)
    sun.rotation_euler = (math.radians(58), 0, math.radians(104))

    bpy.ops.object.light_add(type='AREA', location=(-0.5, -3.5, H + 1.5))
    fill = bpy.context.object
    fill.data.energy = 1100
    fill.data.size = 6
    fill.data.color = (0.78, 0.82, 1.0)
    # Fill lights the room but casts no shadow: a 6 m soft shadow would smear
    # across every prop render and inflate its transparent bounding box.
    fill.data.use_shadow = False
    fill.rotation_euler = (math.radians(20), 0, 0)

    for x in (-2.4, -0.8, 0.8, 2.4):
        bpy.ops.object.light_add(type='SPOT', location=(x, BACK_Y - 0.55, H - 0.05))
        spot = bpy.context.object
        spot.data.energy = 220
        spot.data.spot_size = math.radians(75)
        spot.data.spot_blend = 0.7
        spot.data.color = (1.0, 0.8, 0.58)
        spot.rotation_euler = (math.radians(18), 0, 0)


CAMERA = {
    'location': (-1.05, -10.4, 4.15),
    'target': (0.35, 1.2, 0.7),
    'lens': 44,
}


def build_camera(scene):
    bpy.ops.object.camera_add(location=CAMERA['location'])
    cam = bpy.context.object
    cam.name = 'canonical-camera'
    cam.data.lens = CAMERA['lens']
    cam.data.sensor_width = 36
    direction = Vector(CAMERA['target']) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    return cam


def configure_render(scene, width, samples):
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.cycles.seed = 244
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'AgX - Punchy'
    scene.view_settings.exposure = 0.75
    scene.render.resolution_x = width
    scene.render.resolution_y = width * 2 // 3
    scene.render.resolution_percentage = 100

    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.25 * width / 1536
    fs = scene.view_layers[0].freestyle_settings
    fs.crease_angle = math.radians(140)
    lineset = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('outline')
    if lineset.linestyle is None:
        lineset.linestyle = bpy.data.linestyles.new('outline')
    lineset.select_by_visibility = True
    lineset.select_by_edge_types = True
    lineset.select_silhouette = True
    lineset.select_border = True
    lineset.select_crease = True
    lineset.select_external_contour = True
    lineset.select_by_collection = True
    lineset.collection = no_line_collection()
    lineset.collection_negation = 'EXCLUSIVE'
    style = lineset.linestyle
    style.color = srgb('#0b1022')
    style.alpha = 0.72
    style.thickness = 1.0


def no_line_collection():
    col = bpy.data.collections.get('no-lines')
    if col is None:
        col = bpy.data.collections.new('no-lines')
        bpy.context.scene.collection.children.link(col)
    return col


def build_scene(width=1536, samples=96):
    """Builds the full room and every prop. Returns {group: [objects]}."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    materials = build_materials()
    builder = Builder(materials)
    build_room(builder)
    for prop_id in PROP_IDS:
        PROP_BUILDERS[prop_id](builder)
    build_lighting(scene)
    build_camera(scene)
    configure_render(scene, width, samples)
    lines_off = no_line_collection()
    for obj in builder.groups.get('outside', []) + builder.groups.get('holdout', []):
        lines_off.objects.link(obj)
        obj.visible_shadow = False
    # Freestyle ignores camera visibility, so the hidden ceiling would still
    # draw its edges across the back wall. It keeps casting shadows.
    for obj in builder.groups.get('ceiling', []):
        lines_off.objects.link(obj)
    bpy.context.view_layer.update()
    return builder.groups

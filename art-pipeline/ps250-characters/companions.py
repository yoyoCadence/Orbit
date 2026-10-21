"""PS-250C: AI Companion forms, each in the six Companion states.

`build(kind, state)` builds one form in one state. The forms share the state
language: eyes and tilt carry the expression, and the same glowing marks
(sparks, a reminder, sleep marks, a work hologram) are added per state.
"""
import math

import bpy
from mathutils import Vector

import rig as C
from rig import glow

D = math.radians


def toon(name, hex_color, **kw):
    return C.mat(name, hex_color, **kw)


def hologram():
    """Translucent cyan glass: emission mixed with transparency."""
    m = bpy.data.materials.new('hologram')
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != 'OUTPUT_MATERIAL':
            nt.nodes.remove(n)
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*C.S.srgb('#5fd2ff'), 1)
    em.inputs['Strength'].default_value = 1.4
    clear = nt.nodes.new('ShaderNodeBsdfTransparent')
    mix = nt.nodes.new('ShaderNodeMixShader')
    mix.inputs['Fac'].default_value = 0.55
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    return m


def eyes(parent_obj, centers, state, material, shine=None, size=0.026):
    """Eyes at `centers` (front surface points); the expression follows the state."""
    for i, c in enumerate(centers):
        c = Vector(c)
        if state == 'congratulate':
            pts = [c + Vector((-0.024, 0.006, -0.008)), c + Vector((0, 0, 0.016)), c + Vector((0.024, 0.006, -0.008))]
            C.parent(C.tube(f'eye{i}', pts, size * 0.36, material), parent_obj)
        elif state == 'rest':
            pts = [c + Vector((-0.024, 0.006, 0.006)), c + Vector((0, 0, -0.012)), c + Vector((0.024, 0.006, 0.006))]
            C.parent(C.tube(f'eye{i}', pts, size * 0.3, material), parent_obj)
        else:
            tall = {'approach': 1.35, 'work': 0.7, 'remind': 1.2}.get(state, 1.0)
            C.parent(C.sphere(f'eye{i}', size, c, material, scale=(0.78, 0.4, 1.3 * tall)), parent_obj)
            if shine is not None:
                C.parent(C.sphere(f'shine{i}', size * 0.32, c + Vector((0.008, -0.008, 0.012)), shine), parent_obj)


def extras(root, state, mark):
    """State marks, kept inside the canvas (top edge ~0.85 m, sides ±0.43 m)."""
    if state == 'work':
        # A small hologram panel beside the Companion, tilted toward it.
        panel = C.empty('holo', (0.27, -0.12, 0.5), root)
        panel.rotation_euler = (D(8), 0, D(-24))
        C.parent(C.rbox('holo_glass', (0.15, 0.012, 0.11), (0, 0, 0), hologram(), 0.012), panel)
        for i, (width, z) in enumerate([(0.1, 0.03), (0.07, 0.005), (0.09, -0.02)]):
            C.parent(C.rbox(f'holo_line{i}', (width, 0.004, 0.009), (-(0.1 - width) / 2, -0.009, z), mark, 0.0), panel)
    if state == 'remind':
        C.parent(C.rbox('bang', (0.035, 0.035, 0.12), (0.26, -0.05, 0.70), mark, 0.012), root)
        C.parent(C.sphere('dot', 0.022, (0.26, -0.05, 0.61), mark), root)
    if state == 'congratulate':
        for x, z, s in [(-0.3, 0.66, 0.03), (0.32, 0.6, 0.025), (0.25, 0.75, 0.018), (-0.2, 0.76, 0.02)]:
            C.parent(C.sphere('spark', s, (x, -0.1, z), mark), root)
    if state == 'rest':
        for i, (x, z, s) in enumerate([(0.2, 0.62, 0.05), (0.29, 0.72, 0.036)]):
            letter = C.empty(f'z{i}', (x, -0.08, z), root)
            letter.rotation_euler = (0, D(-12), 0)
            C.parent(C.rbox(f'z{i}_top', (s, 0.008, s * 0.2), (0, 0, s / 2), mark, 0.003), letter)
            C.parent(C.rbox(f'z{i}_bottom', (s, 0.008, s * 0.2), (0, 0, -s / 2), mark, 0.003), letter)
            C.parent(C.rbox(f'z{i}_slash', (s * 1.25, 0.008, s * 0.2), (0, 0, 0), mark, 0.003,
                            rot=(0, D(-40), 0)), letter)


TILT = {'approach': (-12, 0, 0), 'rest': (8, 0, -12), 'congratulate': (-6, 0, 8), 'work': (6, 0, 0)}


def build(kind, state):
    m = {
        'ink': toon('ink', '#1b1d2b'), 'white': toon('white', '#ffffff'),
        'gold': toon('gold', '#e8b53c', metal=0.6, gloss=0.4), 'mark': glow('mark', '#ffd35a', 2.5),
        'cyan': glow('cyan', '#7ff0ff', 3.0), 'screen': toon('screen', '#0f1d3a', gloss=0.15),
        'blush': toon('blush', '#f4a3a3'),
    }
    root = C.empty('root', (0, 0, 0))
    body = C.empty('body', (0, 0, 0.42), root)
    body.rotation_euler = [D(a) for a in TILT.get(state, (0, 0, 0))]
    if kind == 'orbit':
        R = 0.24
        C.parent(C.sphere('shell', R, (0, 0, 0), toon('blue', '#2f9cf0', gloss=0.35)), body)
        C.parent(C.sphere('screen', R * 0.74, (0, -R * 0.62, 0.02), m['screen'], scale=(1.0, 0.55, 0.7)), body)
        bpy.ops.mesh.primitive_torus_add(major_radius=R * 1.32, minor_radius=0.018, location=(0, 0, -0.03),
                                         major_segments=48, minor_segments=12)
        ring = C.smooth(bpy.context.object)
        ring.rotation_euler = (D(16), D(10 if state != 'congratulate' else 18), 0)
        ring.data.materials.append(m['gold'])
        C.parent(ring, body)
        C.parent(C.sphere('cap', 0.07, (0, 0, R * 0.98), m['gold'], scale=(1, 1, 0.45)), body)
        fy = -R * 0.62 - R * 0.74 * 0.55
        eyes(body, [(0.058, fy + 0.006, 0.035), (-0.058, fy + 0.006, 0.035)], state, m['cyan'])
    elif kind == 'catbot':
        R = 0.22
        shell = toon('shell', '#f3f5f8', gloss=0.3)
        C.parent(C.sphere('shell', R, (0, 0, 0), shell, scale=(1.08, 1.0, 0.95)), body)
        C.parent(C.sphere('screen', R * 0.72, (0, -R * 0.6, 0.02), m['screen'], scale=(1.1, 0.55, 0.68)), body)
        for sx in (1, -1):
            bpy.ops.mesh.primitive_cone_add(radius1=0.075, radius2=0.0, depth=0.13, location=(sx * 0.13, 0.0, R * 0.95),
                                            rotation=(0, D(sx * 22), 0), vertices=24)
            ear = C.smooth(bpy.context.object)
            ear.data.materials.append(shell)
            C.parent(ear, body)
            bpy.ops.mesh.primitive_cone_add(radius1=0.045, radius2=0.0, depth=0.08, location=(sx * 0.13, -0.035, R * 0.93),
                                            rotation=(0, D(sx * 22), 0), vertices=24)
            inner = C.smooth(bpy.context.object)
            inner.data.materials.append(m['blush'])
            C.parent(inner, body)
            C.parent(C.sphere(f'paw{sx}', 0.05, (sx * 0.12, -0.12, -R * 0.85), shell, scale=(1, 1.2, 0.7)), body)
        C.parent(C.tube('tail', [(0.0, R * 0.9, -0.1), (0.12, R * 1.2, 0.0), (0.18, R * 1.1, 0.12)], 0.025, shell), body)
        fy = -R * 0.6 - R * 0.72 * 0.55
        eyes(body, [(0.06, fy + 0.006, 0.03), (-0.06, fy + 0.006, 0.03)], state, m['cyan'])
    elif kind == 'owl':
        R = 0.23
        feathers = toon('feathers', '#8b5e3c')
        belly = toon('belly', '#f1dfc0')
        C.parent(C.sphere('shell', R, (0, 0, 0), feathers, scale=(1.0, 0.95, 1.05)), body)
        C.parent(C.sphere('belly', R * 0.7, (0, -R * 0.42, -0.06), belly, scale=(1.0, 0.6, 1.0)), body)
        for sx in (1, -1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.014, location=(sx * 0.075, -R * 0.86, 0.06),
                                             rotation=(D(90), 0, 0), major_segments=32, minor_segments=10)
            rim = C.smooth(bpy.context.object)
            rim.data.materials.append(m['gold'])
            C.parent(rim, body)
            C.parent(C.sphere(f'eyewhite{sx}', 0.055, (sx * 0.075, -R * 0.82, 0.06), m['white'], scale=(1, 0.45, 1)), body)
            bpy.ops.mesh.primitive_cone_add(radius1=0.04, radius2=0.0, depth=0.1, location=(sx * 0.13, 0.0, R * 1.0),
                                            rotation=(0, D(sx * 28), 0), vertices=16)
            tuft = C.smooth(bpy.context.object)
            tuft.data.materials.append(feathers)
            C.parent(tuft, body)
            C.parent(C.sphere(f'wing{sx}', 0.1, (sx * 0.2, 0.0, -0.03), feathers, scale=(0.4, 0.8, 1.1)), body)
        bpy.ops.mesh.primitive_cone_add(radius1=0.025, radius2=0.0, depth=0.05, location=(0, -R * 0.97, 0.0),
                                        rotation=(D(90 + 10), 0, 0), vertices=16)
        beak = C.smooth(bpy.context.object)
        beak.data.materials.append(m['gold'])
        C.parent(beak, body)
        eyes(body, [(0.075, -R * 0.84 - 0.012, 0.06), (-0.075, -R * 0.84 - 0.012, 0.06)], state, m['ink'], m['white'], size=0.024)
    elif kind == 'cube':
        shell = toon('shell', '#8fa3b8', gloss=0.3)
        C.parent(C.rbox('shell', (0.4, 0.34, 0.36), (0, 0, 0), shell, 0.07), body)
        C.parent(C.rbox('screen', (0.3, 0.02, 0.22), (0, -0.175, 0.01), m['screen'], 0.04), body)
        C.parent(C.capsule('antenna', 0.1, 0.008, m['ink']), body).location = (0.1, 0, 0.27)
        C.parent(C.sphere('bulb', 0.025, (0.1, 0, 0.29), glow('bulb', '#ff6b6b', 2.0)), body)
        bpy.ops.mesh.primitive_cylinder_add(radius=0.012, depth=0.06, location=(-0.06, 0, 0.21), vertices=16)
        mast = C.smooth(bpy.context.object)
        mast.data.materials.append(m['ink'])
        C.parent(mast, body)
        for a in (0, 90):
            C.parent(C.rbox(f'blade{a}', (0.26, 0.04, 0.012), (-0.06, 0, 0.245), m['ink'], 0.01, rot=(0, 0, D(a + 20))), body)
        eyes(body, [(0.06, -0.19, 0.02), (-0.06, -0.19, 0.02)], state, m['cyan'])
    elif kind == 'jelly':
        jelly = toon('jelly', '#7fe0c4', gloss=0.6)
        C.parent(C.sphere('shell', 0.24, (0, 0, -0.02), jelly, scale=(1.05, 1.0, 0.85)), body)
        C.parent(C.sphere('drop', 0.12, (0, 0.0, 0.17), jelly, scale=(0.8, 0.8, 1.1)), body)
        C.parent(C.sphere('shine', 0.05, (-0.1, -0.18, 0.12), m['white'], scale=(0.8, 0.4, 1.2)), body)
        for sx in (1, -1):
            C.parent(C.sphere(f'blush{sx}', 0.03, (sx * 0.12, -0.225, -0.06), m['blush'], scale=(1, 0.35, 0.6)), body)
        eyes(body, [(0.07, -0.246, 0.0), (-0.07, -0.246, 0.0)], state, m['ink'], m['white'], size=0.024)
    elif kind == 'fox':
        fur = toon('fur', '#e8873a')
        cream = toon('cream', '#fbf1e2')
        C.parent(C.sphere('head', 0.2, (0, 0, 0.05), fur, scale=(1.1, 0.95, 0.92)), body)
        # Cream cheeks and chin under a short snout, so the face reads as a fox.
        C.parent(C.sphere('cheeks', 0.12, (0, -0.1, -0.055), cream, scale=(1.3, 0.85, 0.62)), body)
        C.parent(C.sphere('snout', 0.06, (0, -0.19, -0.015), fur, scale=(1.0, 1.0, 0.75)), body)
        C.parent(C.sphere('nose', 0.022, (0, -0.25, -0.005), m['ink']), body)
        C.parent(C.tube('mouth', [(-0.022, -0.235, -0.05), (0, -0.242, -0.04), (0.022, -0.235, -0.05)],
                        0.005, m['ink']), body)
        C.parent(C.sphere('torso', 0.13, (0, 0.05, -0.2), fur, scale=(1.0, 0.9, 0.9)), body)
        C.parent(C.tube('tail', [(0.0, 0.15, -0.25), (0.2, 0.25, -0.15), (0.26, 0.2, 0.05)], 0.07, fur), body)
        C.parent(C.sphere('tailtip', 0.06, (0.26, 0.2, 0.08), cream), body)
        for sx in (1, -1):
            bpy.ops.mesh.primitive_cone_add(radius1=0.075, radius2=0.0, depth=0.17, location=(sx * 0.13, 0.03, 0.28),
                                            rotation=(0, D(sx * 18), 0), vertices=24)
            ear = C.smooth(bpy.context.object)
            ear.data.materials.append(fur)
            C.parent(ear, body)
            C.parent(C.sphere(f'blush{sx}', 0.026, (sx * 0.13, -0.17, -0.02), m['blush'], scale=(1, 0.35, 0.6)), body)
        eyes(body, [(0.075, -0.175, 0.07), (-0.075, -0.175, 0.07)], state, m['ink'], m['white'], size=0.024)
    extras(root, state, m['mark'])
    return root


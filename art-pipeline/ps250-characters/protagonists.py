"""PS-250C: Q-style protagonists, built from primitives with a joint rig.

`build(spec_id, pose_id)` builds one protagonist in one pose. Six outfits
(PROTAGONISTS) × six poses (POSES) cover every protagonist state the runtime
draws; render_characters.py renders each facing.
"""
import math

import bpy
from mathutils import Vector

from rig import boolean_cut, capsule, empty, mat, parent, rbox, smooth, sphere, tube

D = math.radians


# ── character ────────────────────────────────────────────────────────────────
HEAD_R = 0.19
HIP_Z = 0.31
SHOULDER = (0.155, 0.0, 0.53)
HEAD_Z = 0.73


HEAD_SCALE = (1.0, 0.94, 0.97)


def on_head(head_c, x, dz, lift=0.0):
    """A point on the front of the head ellipsoid, `lift` metres outside it."""
    sx, sy, sz = HEAD_SCALE
    r = HEAD_R + lift
    inner = max(0.0, 1 - (x / (r * sx)) ** 2 - (dz / (r * sz)) ** 2)
    return Vector((x, head_c.y - r * sy * math.sqrt(inner), head_c.z + dz))


def build_character(spec, pose):
    m = {k: mat(k, v) for k, v in spec['colors'].items()}
    m['ink'] = mat('ink', '#1b1d2b')
    m['white'] = mat('white', '#ffffff')
    m['blush'] = mat('blush', '#f4a3a3')
    m['mouth'] = mat('mouth', '#7a2630')
    m['book'] = mat('book', '#c9783a')
    root = empty('root', (0, 0, 0))
    hips = empty('hips', (0, 0, HIP_Z), root)
    hips.rotation_euler = [D(a) for a in pose.get('hips', (0, 0, 0))]

    # legs
    for side, sx in (('l', 1), ('r', -1)):
        hip = empty(f'hip_{side}', (sx * 0.065, 0, 0), hips)
        hip.rotation_euler = [D(a) for a in pose.get(f'leg_{side}', (0, 0, 0))]
        parent(capsule(f'thigh_{side}', 0.12, 0.05, m['pants']), hip)
        knee = empty(f'knee_{side}', (0, 0, -0.12), hip)
        knee.rotation_euler = [D(a) for a in pose.get(f'knee_{side}', (0, 0, 0))]
        parent(capsule(f'shin_{side}', 0.12, 0.046, m['pants']), knee)
        ankle = empty(f'ankle_{side}', (0, 0, -0.13), knee)
        parent(rbox(f'shoe_{side}', (0.085, 0.13, 0.06), (0, -0.025, -0.015), m['shoes'], 0.025), ankle)

    # torso (jacket) with shirt, tie, belt
    chest = empty('chest', (0, 0, 0), hips)
    chest.rotation_euler = [D(a) for a in pose.get('chest', (0, 0, 0))]
    parent(rbox('torso', (0.27, 0.17, 0.25), (0, 0, 0.12), m['top'], 0.06), chest)
    if spec.get('shirt'):
        parent(rbox('shirt', (0.08, 0.02, 0.17), (0, -0.078, 0.15), m['shirt'], 0.008), chest)
    if spec.get('lapels'):
        for sx in (1, -1):
            parent(rbox(f'lapel_{sx}', (0.035, 0.02, 0.15), (sx * 0.05, -0.088, 0.16), m['lapel'], 0.008, rot=(0, D(sx * 18), 0)), chest)
    if spec.get('tie'):
        parent(rbox('tie', (0.03, 0.02, 0.13), (0, -0.09, 0.13), m['tie'], 0.008), chest)
    parent(rbox('belt', (0.275, 0.175, 0.03), (0, 0, 0.005), m['belt'] if 'belt' in m else m['pants'], 0.012), chest)
    outfit = spec.get('outfit', 'blazer')
    if outfit == 'hoodie':
        bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.035, location=(0, 0.04, 0.25),
                                         rotation=(D(70), 0, 0), major_segments=32, minor_segments=12)
        hood = smooth(bpy.context.object)
        hood.data.materials.append(m['top'])
        parent(hood, chest)
        parent(rbox('pocket', (0.16, 0.02, 0.07), (0, -0.088, 0.06), m['accent'], 0.015), chest)
        for sx in (1, -1):
            parent(tube(f'string_{sx}', [(sx * 0.03, -0.09, 0.23), (sx * 0.032, -0.095, 0.17), (sx * 0.03, -0.092, 0.13)], 0.006, m['white']), chest)
    elif outfit == 'sweater':
        bpy.ops.mesh.primitive_torus_add(major_radius=0.075, minor_radius=0.022, location=(0, -0.005, 0.245),
                                         major_segments=32, minor_segments=12)
        collar = smooth(bpy.context.object)
        collar.data.materials.append(m['shirt'])
        parent(collar, chest)
        for z in (0.05, 0.1):
            parent(rbox(f'stripe_{z}', (0.272, 0.172, 0.018), (0, 0, z), m['accent'], 0.008), chest)
    elif outfit == 'labcoat':
        parent(rbox('coat_tail', (0.29, 0.18, 0.14), (0, 0, -0.06), m['top'], 0.04), chest)
        for sx in (1, -1):
            parent(rbox(f'pocket_{sx}', (0.06, 0.02, 0.05), (sx * 0.075, -0.09, -0.03), m['lapel'], 0.01), chest)
    elif outfit == 'track':
        parent(rbox('zip', (0.012, 0.02, 0.22), (0, -0.088, 0.12), m['accent'], 0.004), chest)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.08, minor_radius=0.025, location=(0, -0.005, 0.245),
                                         major_segments=32, minor_segments=12)
        collar = smooth(bpy.context.object)
        collar.data.materials.append(m['top'])
        parent(collar, chest)
    elif outfit == 'tee':
        parent(rbox('print', (0.09, 0.02, 0.07), (0, -0.087, 0.15), m['accent'], 0.02), chest)
    if spec.get('stripes'):
        for z in (0.05, 0.11, 0.17):
            parent(rbox(f'tee_stripe_{z}', (0.272, 0.172, 0.02), (0, 0, z), m['accent'], 0.008), chest)

    # head
    neck = empty('neck', (0, 0, 0.25), chest)
    neck.rotation_euler = [D(a) for a in pose.get('head', (0, 0, 0))]
    head_c = Vector((0, 0, HEAD_Z - HIP_Z - 0.25))
    parent(sphere('head', HEAD_R, head_c, m['skin'], scale=(1.0, 0.94, 0.97)), neck)
    face = pose.get('face', 'neutral')
    for sx in (1, -1):
        if face in ('happy', 'closed'):
            lift = -0.006 if face == 'happy' else 0.0
            pts = [on_head(head_c, sx * 0.09, -0.012, 0.004), on_head(head_c, sx * 0.065, 0.006 + lift if face == 'happy' else -0.026, 0.004),
                   on_head(head_c, sx * 0.04, -0.012, 0.004)]
            parent(tube(f'eye_{sx}', pts, 0.0065, m['ink']), neck)
        else:
            parent(sphere(f'eye_{sx}', 0.03, on_head(head_c, sx * 0.064, -0.012, -0.004), m['ink'], scale=(0.8, 0.45, 1.15)), neck)
            parent(sphere(f'shine_{sx}', 0.0095, on_head(head_c, sx * 0.07, 0.004, 0.006), m['white']), neck)
        parent(tube(f'brow_{sx}', [on_head(head_c, sx * 0.09, 0.04, 0.004), on_head(head_c, sx * 0.065, 0.047, 0.004),
                                   on_head(head_c, sx * 0.04, 0.043, 0.004)], 0.005, m['hair']), neck)
        parent(sphere(f'blush_{sx}', 0.022, on_head(head_c, sx * 0.1, -0.055, -0.004), m['blush'], scale=(1, 0.35, 0.6)), neck)
    mouth = pose.get('mouth', 'smile')
    if mouth == 'open':
        parent(sphere('mouth', 0.028, on_head(head_c, 0, -0.088, -0.006), m['mouth'], scale=(1, 0.4, 0.85)), neck)
    else:
        mid = -0.098 if mouth == 'smile' else -0.09
        if mouth == 'line':
            mid = -0.088
        parent(tube('mouth', [on_head(head_c, -0.024, -0.086, 0.003), on_head(head_c, 0, mid, 0.003),
                              on_head(head_c, 0.024, -0.086, 0.003)], 0.0055, m['ink']), neck)

    # hair: a cap with the face cut out, plus bangs/spikes
    cap = sphere('hair_cap', HEAD_R * 1.09, head_c + Vector((0, 0.015, 0.02)), m['hair'], scale=(1.02, 1.0, 1.0))
    cutter = rbox('cutter', (0.5, 0.3, 0.3), head_c + Vector((0, -0.2, -0.11)), m['hair'], 0.0)
    boolean_cut(cap, cutter)
    parent(cap, neck)
    parent(cutter, neck)
    style = spec.get('hair', 'messy')
    if style in ('long', 'ponytail', 'bun', 'bob', 'short'):
        # soft bangs: flattened spheres across the forehead
        for x in (-0.11, -0.055, 0.0, 0.055, 0.11):
            bang = sphere('bang', 0.055, head_c + Vector((x, -0.135, 0.085 - abs(x) * 0.25)), m['hair'], scale=(1.0, 0.55, 1.15))
            parent(bang, neck)
    if style == 'long':
        back = rbox('hair_back', (0.36, 0.14, 0.34), head_c + Vector((0, 0.07, -0.16)), m['hair'], 0.07)
        parent(back, neck)
        for sx in (1, -1):
            lock = capsule(f'lock_{sx}', 0.2, 0.05, m['hair'], 0.035)
            lock.location = head_c + Vector((sx * 0.165, -0.04, -0.01))
            parent(lock, neck)
    elif style == 'bob':
        for sx in (1, -1):
            side = sphere(f'bob_{sx}', 0.11, head_c + Vector((sx * 0.13, 0.02, -0.08)), m['hair'], scale=(0.7, 1.0, 1.2))
            parent(side, neck)
    elif style == 'ponytail':
        tie = sphere('hair_tie', 0.03, head_c + Vector((0, 0.19, 0.06)), m['accent'])
        parent(tie, neck)
        tail = tube('tail', [head_c + Vector((0, 0.2, 0.06)), head_c + Vector((0, 0.27, -0.05)),
                             head_c + Vector((0, 0.24, -0.2))], 0.045, m['hair'])
        parent(tail, neck)
    elif style == 'bun':
        parent(sphere('bun', 0.075, head_c + Vector((0, 0.06, HEAD_R + 0.04)), m['hair']), neck)
    if spec.get('glasses'):
        for sx in (1, -1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.034, minor_radius=0.0055,
                                             location=on_head(head_c, sx * 0.064, -0.012, 0.012),
                                             rotation=(D(90), 0, 0), major_segments=28, minor_segments=8)
            ring = smooth(bpy.context.object)
            ring.data.materials.append(m['ink'])
            parent(ring, neck)
        parent(tube('bridge', [on_head(head_c, -0.03, -0.008, 0.012), on_head(head_c, 0, -0.004, 0.016),
                               on_head(head_c, 0.03, -0.008, 0.012)], 0.005, m['ink']), neck)
    if spec.get('headphones'):
        band = tube('band', [head_c + Vector((0.2, 0.0, 0.0)), head_c + Vector((0.12, 0.0, 0.2)),
                             head_c + Vector((-0.12, 0.0, 0.2)), head_c + Vector((-0.2, 0.0, 0.0))], 0.016, m['accent'])
        parent(band, neck)
        for sx in (1, -1):
            parent(sphere(f'cup_{sx}', 0.055, head_c + Vector((sx * 0.195, 0.0, -0.01)), m['accent'], scale=(0.55, 1, 1)), neck)
    if spec.get('beret'):
        beret = sphere('beret', 0.17, head_c + Vector((0.03, 0.03, HEAD_R * 0.98)), m['accent'], scale=(1.1, 1.05, 0.38))
        beret.rotation_euler = (D(-8), D(14), 0)
        parent(beret, neck)
    if style == 'messy':
        for i, (x, z, rx, ry) in enumerate([(-0.12, 0.07, 20, -35), (-0.06, 0.1, 25, -15), (0.0, 0.11, 28, 0),
                                            (0.06, 0.1, 25, 15), (0.12, 0.07, 20, 35)]):
            bpy.ops.mesh.primitive_cone_add(radius1=0.05, radius2=0.0, depth=0.13,
                                            location=head_c + Vector((x, -0.15, z - 0.03)),
                                            rotation=(D(180 - rx), D(ry), 0), vertices=16)
            bang = smooth(bpy.context.object)
            bang.data.materials.append(m['hair'])
            parent(bang, neck)
        for x, y, z, rx, ry in [(-0.07, 0.03, 0.96, -62, -25), (0.04, 0.05, 0.98, -68, 18), (-0.01, 0.12, 0.9, -95, 0),
                                (0.12, 0.08, 0.8, -80, 60), (-0.13, 0.08, 0.8, -80, -60)]:
            bpy.ops.mesh.primitive_cone_add(radius1=0.055, radius2=0.0, depth=0.12,
                                            location=head_c + Vector((x, y, HEAD_R * z)),
                                            rotation=(D(rx), D(ry), 0), vertices=16)
            tuft = smooth(bpy.context.object)
            tuft.scale = (1.0, 0.55, 1.0)
            tuft.data.materials.append(m['hair'])
            parent(tuft, neck)

    # arms
    for side, sx in (('l', 1), ('r', -1)):
        sh = empty(f'shoulder_{side}', (sx * SHOULDER[0], SHOULDER[1], SHOULDER[2] - HIP_Z), chest)
        sh.rotation_euler = [D(a) for a in pose.get(f'arm_{side}', (0, -sx * 9, 0))]
        parent(capsule(f'upperarm_{side}', 0.12, 0.04, m['top']), sh)
        el = empty(f'elbow_{side}', (0, 0, -0.12), sh)
        el.rotation_euler = [D(a) for a in pose.get(f'elbow_{side}', (0, 0, 0))]
        parent(capsule(f'forearm_{side}', 0.1, 0.037, m['skin'] if spec.get('short_sleeves') else m['top']), el)
        parent(sphere(f'hand_{side}', 0.04, (0, 0, -0.13), m['skin']), el)
    if pose.get('notebook'):
        book = rbox('notebook', (0.13, 0.02, 0.17), (0.0, -0.2, 0.17), m['book'], 0.01, rot=(D(-35), 0, 0))
        parent(book, chest)
    hips.location.z += pose.get('lift', 0.0)
    return root


POSES = {
    'idle': {'face': 'neutral', 'mouth': 'smile', 'elbow_l': (-6, 0, 0), 'elbow_r': (-6, 0, 0)},
    'work': {'face': 'neutral', 'mouth': 'line', 'head': (10, 0, 0),
             'arm_l': (-55, 12, 0), 'arm_r': (-55, -12, 0), 'elbow_l': (-45, 0, 0), 'elbow_r': (-45, 0, 0)},
    'celebrate': {'face': 'happy', 'mouth': 'open', 'lift': 0.03, 'head': (-6, 0, 0),
                  'arm_r': (0, 160, 0), 'elbow_r': (0, 0, 0),
                  'arm_l': (-20, -18, 0), 'elbow_l': (-110, 0, 0)},
    'rest': {'face': 'closed', 'mouth': 'smile', 'head': (-8, 0, 6),
             'arm_l': (-10, -150, 0), 'elbow_l': (0, -95, 0), 'arm_r': (-10, 150, 0), 'elbow_r': (0, 95, 0)},
    # Spread legs shorten the stance; drop the hips so both feet stay on the floor.
    'walk': {'face': 'neutral', 'mouth': 'smile', 'lift': -0.025, 'leg_l': (22, 0, 0), 'knee_l': (18, 0, 0), 'leg_r': (-25, 0, 0),
             'knee_r': (10, 0, 0), 'arm_l': (-28, -10, 0), 'arm_r': (26, 10, 0), 'elbow_l': (-20, 0, 0), 'elbow_r': (-10, 0, 0)},
    'inspect': {'face': 'neutral', 'mouth': 'line', 'head': (14, 0, 0), 'notebook': True,
                'arm_l': (-50, 22, 0), 'arm_r': (-50, -22, 0), 'elbow_l': (-55, 0, 0), 'elbow_r': (-55, 0, 0)},
}


BASE_COLORS = {'skin': '#f6d2b5', 'shirt': '#f2f2ef', 'shoes': '#151619', 'lapel': '#24396a', 'accent': '#e2a33a'}

PROTAGONISTS = {
    'office': {'colors': {**BASE_COLORS, 'hair': '#2a2622', 'top': '#2f4c86', 'pants': '#22252d', 'tie': '#b3262c'},
               'shirt': True, 'tie': True, 'lapels': True, 'hair': 'messy'},
    'hoodie': {'colors': {**BASE_COLORS, 'hair': '#6b4428', 'top': '#e8813a', 'pants': '#3b4a63', 'accent': '#c9652a',
                          'shoes': '#f1f1f1'},
               'outfit': 'hoodie', 'hair': 'short', 'headphones': True},
    'sweater': {'colors': {**BASE_COLORS, 'hair': '#3a2a22', 'top': '#e9dcc3', 'pants': '#4a6fa5', 'accent': '#b9a37e',
                           'shirt': '#fbf6ea', 'shoes': '#7a4b2e'},
                'outfit': 'sweater', 'hair': 'long'},
    'sporty': {'colors': {**BASE_COLORS, 'hair': '#8a3b1e', 'top': '#2aa59a', 'pants': '#24323f', 'accent': '#f4f4f4',
                          'shoes': '#e85a4f'},
               'outfit': 'track', 'hair': 'ponytail'},
    'scientist': {'colors': {**BASE_COLORS, 'hair': '#1f2937', 'top': '#f4f6f8', 'pants': '#334155', 'lapel': '#dbe2ea',
                             'shirt': '#7cb7e6', 'accent': '#5b8bd6'},
                  'outfit': 'labcoat', 'lapels': True, 'shirt': True, 'hair': 'bun', 'glasses': True},
    'artist': {'colors': {**BASE_COLORS, 'hair': '#e3c278', 'top': '#f7f3ea', 'pants': '#2f3b52', 'accent': '#c8423a',
                          'shoes': '#3a2a22', 'skin': '#e9b994'},
               'outfit': 'tee', 'stripes': True, 'hair': 'bob', 'beret': True, 'short_sleeves': True},
}


def build(spec_id, pose_id):
    return build_character(PROTAGONISTS[spec_id], POSES[pose_id])

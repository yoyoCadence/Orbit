"""PS-260 protagonists: the PS-250C rig in ten new outfits.

`build(spec_id, pose_id)` builds the PS-250C body (protagonists.build_character,
unchanged, so the six PS-250C characters render exactly as before) and then
adds this set's costume pieces to its joints: hats and hair on the neck, robes
and skirts on the hips, packs and panels on the chest. Every piece is parented
to a joint, so it follows every pose.

Joint names come from the PS-250C rig: root, hips, hip_l/r, knee_l/r,
ankle_l/r, chest, neck, shoulder_l/r, elbow_l/r. Front is -Y, up is +Z.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'ps250-characters'))
import protagonists as P  # noqa: E402
from rig import capsule, cone, empty, glow, mat, parent, rbox, smooth, sphere, torus, tube  # noqa: E402

D = math.radians
HEAD_C = Vector((0, 0, P.HEAD_Z - P.HIP_Z - 0.25))  # the head centre in neck space
R = P.HEAD_R


def joint(name):
    return bpy.data.objects[name]


def cylinder(name, r, depth, loc, material, rot=(0, 0, 0), r_top=None, verts=40):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r if r_top is None else r_top, depth=depth,
                                    location=loc, rotation=rot, vertices=verts)
    o = smooth(bpy.context.object)
    o.name = name
    o.data.materials.append(material)
    return o


def disc(name, r, loc, material, thickness=0.012, rot=(0, 0, 0)):
    return cylinder(name, r, thickness, loc, material, rot=rot)


def hat_root(name, height, tilt=(0, 0, 0)):
    """An empty on the neck at `height` × head radius above the head centre.

    Hat pieces are placed relative to it and the empty carries the tilt, so
    the brim, band and crown turn together. A hat sits lower than the top of
    the hair cap and is wider than it, as a real hat sits on the head; the
    PS-250C canvas leaves about 0.1 m above the hair for the tallest hat
    (process_sets.py fails a sprite that touches the canvas edge).
    """
    o = empty(name, HEAD_C + Vector((0, 0.01, R * height)), joint('neck'))
    o.rotation_euler = [D(a) for a in tilt]
    return o


# ── shared pieces ───────────────────────────────────────────────────────────
def lashes(m):
    """Two short strokes at the outer corner of each eye (the female sets)."""
    neck = joint('neck')
    for sx in (1, -1):
        for dz, dx in ((0.012, 0.0), (0.0, 0.006)):
            pts = [P.on_head(HEAD_C, sx * (0.086 + dx), 0.002 + dz, 0.004),
                   P.on_head(HEAD_C, sx * (0.1 + dx), 0.012 + dz, 0.006)]
            parent(tube(f'lash_{sx}_{dz}', pts, 0.0045, m['ink']), neck)


def skirt(name, m, top_r, bottom_r, top_z, bottom_z, material_key='skirt', tiers=1, tier_key=None):
    """A flared skirt or robe hanging from the waist, on the hips joint."""
    hips = joint('hips')
    depth = top_z - bottom_z
    for i in range(tiers):
        frac0, frac1 = i / tiers, (i + 1) / tiers
        z0 = top_z - depth * frac0
        z1 = top_z - depth * frac1
        r0 = top_r + (bottom_r - top_r) * frac0
        r1 = top_r + (bottom_r - top_r) * frac1
        key = tier_key if (tier_key and i % 2) else material_key
        piece = cylinder(f'{name}_{i}', r1, z0 - z1, (0, 0.005, (z0 + z1) / 2), m[key], r_top=r0)
        parent(piece, hips)


def boots(m, key='shoes', height=0.07):
    """A cuff above each shoe, so boots read as boots."""
    for side in ('l', 'r'):
        ankle = joint(f'ankle_{side}')
        parent(cylinder(f'boot_{side}', 0.052, height, (0, -0.005, height / 2 - 0.01), m[key]), ankle)


# ── the ten costumes ────────────────────────────────────────────────────────
def astronaut(m):
    chest, neck = joint('chest'), joint('neck')
    # Helmet ring at the neck and a life-support pack on the back.
    parent(torus('collar_ring', 0.11, 0.028, (0, 0.0, 0.25), (0, 0, 0), m['metal']), chest)
    parent(rbox('pack', (0.22, 0.09, 0.22), (0, 0.13, 0.13), m['top'], 0.03), chest)
    parent(rbox('pack_band', (0.225, 0.095, 0.03), (0, 0.13, 0.19), m['accent'], 0.01), chest)
    # Chest control panel with three lights.
    parent(rbox('panel', (0.12, 0.025, 0.07), (0, -0.09, 0.14), m['metal'], 0.01), chest)
    for i, colour in enumerate(('light_a', 'light_b', 'light_c')):
        parent(sphere(f'button_{i}', 0.012, (-0.035 + i * 0.035, -0.104, 0.145), m[colour]), chest)
    # Mission patches on the upper arms and orange knee pads.
    for side, sx in (('l', 1), ('r', -1)):
        parent(sphere(f'patch_{side}', 0.024, (sx * 0.035, -0.0, -0.05), m['accent'], scale=(1, 0.5, 1)),
               joint(f'shoulder_{side}'))
        parent(sphere(f'kneepad_{side}', 0.035, (0, -0.04, 0.0), m['accent'], scale=(1, 0.6, 1)), joint(f'knee_{side}'))
    # A small antenna headset over the hair.
    parent(tube('headset', [HEAD_C + Vector((0.2, 0.0, -0.02)), HEAD_C + Vector((0.13, -0.02, 0.17)),
                            HEAD_C + Vector((-0.13, -0.02, 0.17)), HEAD_C + Vector((-0.2, 0.0, -0.02))], 0.012, m['metal']), neck)
    parent(sphere('earpiece', 0.04, HEAD_C + Vector((0.2, 0.0, -0.02)), m['metal'], scale=(0.6, 1, 1)), neck)
    parent(tube('antenna', [HEAD_C + Vector((-0.2, 0.0, 0.0)), HEAD_C + Vector((-0.22, 0.0, 0.16))], 0.006, m['metal']), neck)
    parent(sphere('antenna_tip', 0.018, HEAD_C + Vector((-0.22, 0.0, 0.17)), m['light_c']), neck)
    boots(m, height=0.09)


def samurai(m):
    chest, neck = joint('chest'), joint('neck')
    # Kimono collar crossed left over right, the obi and the wide hakama.
    for sx in (1, -1):
        parent(tube(f'eri_{sx}', [(sx * 0.07, -0.075, 0.245), (sx * 0.02, -0.092, 0.17), (-sx * 0.03, -0.09, 0.11)],
                    0.014, m['collar']), chest)
    parent(rbox('obi', (0.28, 0.18, 0.05), (0, 0, 0.02), m['obi'], 0.015), chest)
    skirt('hakama', m, 0.15, 0.2, 0.01, -0.25, material_key='pants')
    # Front pleats as dark strokes.
    hips = joint('hips')
    for x in (-0.05, 0.0, 0.05):
        parent(tube(f'pleat_{x}', [(x, -0.155, -0.0), (x * 1.25, -0.2, -0.24)], 0.004, m['ink']), hips)
    # Topknot: a bun on the crown and a tie.
    parent(sphere('mage', 0.06, HEAD_C + Vector((0, 0.06, R + 0.035)), m['hair'], scale=(0.8, 1.4, 0.8)), neck)
    parent(torus('mage_tie', 0.03, 0.01, HEAD_C + Vector((0, 0.03, R + 0.025)), (D(80), 0, 0), m['obi']), neck)
    # A wooden practice sword at the left hip.
    parent(tube('bokken', [(0.17, -0.02, 0.06), (0.2, 0.08, -0.06), (0.22, 0.2, -0.2)], 0.014, m['wood']), chest)
    parent(torus('tsuba', 0.028, 0.008, (0.172, 0.0, 0.04), (D(60), D(20), 0), m['ink']), chest)


def detective(m):
    neck = joint('neck')
    # Trench coat: a long tail with a belt and buttons, a scarf.
    skirt('coat', m, 0.155, 0.19, 0.02, -0.17, material_key='top')
    chest = joint('chest')
    parent(rbox('coat_belt', (0.285, 0.185, 0.03), (0, 0, 0.03), m['belt'], 0.012), chest)
    parent(rbox('buckle', (0.04, 0.02, 0.035), (0, -0.095, 0.03), m['metal'], 0.006), chest)
    for z in (0.08, 0.14):
        for sx in (1, -1):
            parent(sphere(f'coatbtn_{z}_{sx}', 0.011, (sx * 0.055, -0.092, z), m['belt']), chest)
    parent(torus('scarf', 0.08, 0.026, (0, -0.005, 0.245), (0, 0, 0), m['scarf']), chest)
    parent(rbox('scarf_end', (0.04, 0.02, 0.1), (0.04, -0.1, 0.19), m['scarf'], 0.012, rot=(0, D(-8), 0)), chest)
    # Fedora: crown, pinch and brim, tilted a little.
    hat = hat_root('fedora', 0.9, (-6, 8, 0))
    parent(cylinder('crown', 0.13, 0.12, (0, 0, 0.05), m['hat'], r_top=0.11), hat)
    parent(disc('brim', 0.24, (0, 0, 0), m['hat'], thickness=0.014), hat)
    parent(cylinder('hatband', 0.128, 0.03, (0, 0, 0.02), m['band'], r_top=0.125), hat)
    # A magnifying glass in the right hand.
    hand = joint('elbow_r')
    parent(tube('glass_handle', [(0, 0, -0.13), (0, -0.03, -0.21)], 0.01, m['belt']), hand)
    parent(torus('glass_rim', 0.045, 0.009, (0, -0.05, -0.26), (D(90), 0, 0), m['metal']), hand)


def chef(m):
    chest, neck = joint('chest'), joint('neck')
    # Double-breasted jacket: two columns of buttons and a neckerchief.
    for z in (0.06, 0.11, 0.16):
        for sx in (1, -1):
            parent(sphere(f'chefbtn_{z}_{sx}', 0.012, (sx * 0.05, -0.091, z), m['button']), chest)
    parent(torus('kerchief', 0.075, 0.024, (0, -0.005, 0.245), (0, 0, 0), m['accent']), chest)
    parent(cone('kerchief_tip', 0.04, 0.07, (0, -0.095, 0.21), (D(180), 0, 0), m['accent'], scale=(1, 0.4, 1)), chest)
    # A bistro apron wrapped at the waist, to the knees.
    skirt('apron', m, 0.152, 0.17, 0.0, -0.15, material_key='apron')
    # Toque: a band and a puffed top.
    hat = hat_root('toque', 0.6, (-5, 0, 0))
    parent(cylinder('toque_band', 0.205, 0.09, (0, 0, 0.045), m['shirt'], r_top=0.21), hat)
    for x, y in ((0, 0), (0.09, 0.02), (-0.09, 0.02), (0.0, 0.09), (0.0, -0.07)):
        parent(sphere(f'toque_puff_{x}_{y}', 0.095, (x, y, 0.12), m['shirt'], scale=(1, 1, 0.8)), hat)
    # A whisk in the right hand.
    hand = joint('elbow_r')
    parent(tube('whisk_handle', [(0, 0, -0.13), (0, -0.02, -0.2)], 0.011, m['metal']), hand)
    parent(sphere('whisk_head', 0.04, (0, -0.03, -0.25), m['metal'], scale=(0.7, 0.7, 1.3)), hand)


def explorer(m):
    chest, neck = joint('chest'), joint('neck')
    # A vest with pockets over the shirt, backpack straps.
    for sx in (1, -1):
        parent(rbox(f'vest_{sx}', (0.1, 0.02, 0.22), (sx * 0.08, -0.088, 0.12), m['vest'], 0.012), chest)
        parent(rbox(f'vestpocket_{sx}', (0.06, 0.02, 0.045), (sx * 0.08, -0.1, 0.07), m['vest_dark'], 0.008), chest)
        parent(tube(f'strap_{sx}', [(sx * 0.1, -0.07, 0.25), (sx * 0.11, 0.0, 0.26), (sx * 0.1, 0.09, 0.2)], 0.014, m['belt']), chest)
    parent(rbox('backpack', (0.2, 0.1, 0.22), (0, 0.13, 0.11), m['bag'], 0.04), chest)
    parent(rbox('backpack_flap', (0.205, 0.105, 0.07), (0, 0.13, 0.19), m['vest_dark'], 0.02), chest)
    # A rolled sleeping mat on top of the pack.
    parent(cylinder('bedroll', 0.04, 0.22, (0, 0.13, 0.26), m['accent'], rot=(0, D(90), 0)), chest)
    # Pith helmet: a dome and a wide brim.
    hat = hat_root('pith', 0.55, (-6, 0, 0))
    parent(sphere('helmet', 0.215, (0, 0, 0.02), m['hat'], scale=(1.0, 1.05, 0.85)), hat)
    parent(disc('helmet_brim', 0.27, (0, 0.0, -0.02), m['hat'], thickness=0.014), hat)
    parent(cylinder('helmet_band', 0.2, 0.03, (0, 0, 0.0), m['band'], r_top=0.19), hat)
    boots(m, height=0.08)


def witch(m):
    neck = joint('neck')
    lashes(m)
    # A long robe to the ankles and a star brooch.
    skirt('robe', m, 0.15, 0.25, 0.01, -0.27, material_key='top', tiers=2, tier_key='top_dark')
    chest = joint('chest')
    parent(rbox('sash', (0.28, 0.18, 0.035), (0, 0, 0.03), m['accent'], 0.012), chest)
    parent(sphere('brooch', 0.022, (0, -0.1, 0.2), m['accent'], scale=(1, 0.5, 1)), chest)
    # Pointed hat with a brim and a gold band; the tip droops backwards so the
    # hat stays inside the canvas.
    hat = hat_root('witch_hat', 0.58, (-8, 6, 0))
    parent(disc('witch_brim', 0.3, (0, 0, 0), m['hat'], thickness=0.012), hat)
    parent(cylinder('witch_band', 0.205, 0.035, (0, 0, 0.022), m['accent'], r_top=0.198), hat)
    parent(cylinder('witch_cone', 0.2, 0.16, (0, 0, 0.09), m['hat'], r_top=0.05), hat)
    axis = Vector((0, math.sin(D(65)), math.cos(D(65))))
    parent(cone('witch_tip', 0.05, 0.1, Vector((0, 0, 0.17)) + axis * 0.045, (D(-65), 0, 0), m['hat']), hat)
    # A wand with a glowing star in the right hand.
    hand = joint('elbow_r')
    parent(tube('wand', [(0, 0, -0.13), (0, -0.04, -0.25)], 0.008, m['wood']), hand)
    parent(sphere('wand_star', 0.022, (0, -0.05, -0.27), m['spark']), hand)


def idol(m):
    neck = joint('neck')
    lashes(m)
    # A tiered party skirt, a bow at the collar and white boots.
    skirt('frill', m, 0.15, 0.23, 0.02, -0.13, material_key='top', tiers=3, tier_key='frill')
    chest = joint('chest')
    for sx in (1, -1):
        parent(sphere(f'bow_{sx}', 0.04, (sx * 0.035, -0.09, 0.22), m['accent'], scale=(1, 0.5, 0.7)), chest)
    parent(sphere('bow_knot', 0.02, (0, -0.1, 0.22), m['accent']), chest)
    boots(m, height=0.1)
    # Twin tails with ribbons.
    for sx in (1, -1):
        base = HEAD_C + Vector((sx * 0.17, 0.08, 0.1))
        parent(sphere(f'ribbon_{sx}', 0.04, base, m['accent'], scale=(1, 0.6, 0.8)), neck)
        parent(tube(f'tail_{sx}', [base + Vector((sx * 0.02, 0.0, -0.01)), base + Vector((sx * 0.09, 0.03, -0.12)),
                                   base + Vector((sx * 0.07, 0.03, -0.28))], 0.045, m['hair']), neck)
    # A star hair clip and a headset microphone.
    parent(cone('clip', 0.03, 0.012, HEAD_C + Vector((0.11, -0.12, 0.13)), (D(90), 0, D(15)), m['star']), neck)
    parent(tube('mic_boom', [HEAD_C + Vector((0.19, -0.02, -0.03)), HEAD_C + Vector((0.14, -0.13, -0.09)),
                             HEAD_C + Vector((0.06, -0.18, -0.09))], 0.007, m['ink']), neck)
    parent(sphere('mic', 0.016, HEAD_C + Vector((0.05, -0.185, -0.09)), m['ink']), neck)


def gardener(m):
    neck = joint('neck')
    lashes(m)
    chest = joint('chest')
    # Pinafore overalls: a bib with straps and a short skirt.
    parent(rbox('bib', (0.16, 0.02, 0.12), (0, -0.088, 0.13), m['denim'], 0.012), chest)
    parent(rbox('bib_pocket', (0.07, 0.02, 0.045), (0, -0.1, 0.13), m['denim_dark'], 0.008), chest)
    for sx in (1, -1):
        parent(tube(f'brace_{sx}', [(sx * 0.07, -0.09, 0.19), (sx * 0.08, -0.06, 0.255), (sx * 0.07, 0.08, 0.22)],
                    0.012, m['denim']), chest)
    skirt('pinafore', m, 0.15, 0.2, 0.02, -0.12, material_key='denim')
    boots(m, height=0.11)
    # Two braids and a straw hat with a ribbon.
    for sx in (1, -1):
        start = HEAD_C + Vector((sx * 0.16, 0.0, -0.04))
        parent(tube(f'braid_{sx}', [start, start + Vector((sx * 0.02, -0.04, -0.12)), start + Vector((sx * 0.0, -0.06, -0.24))],
                    0.035, m['hair']), neck)
        parent(sphere(f'braid_tie_{sx}', 0.022, start + Vector((sx * 0.0, -0.06, -0.24)), m['accent']), neck)
    hat = hat_root('straw_hat', 0.65, (-10, -5, 0))
    parent(disc('straw_brim', 0.31, (0, 0, 0), m['hat'], thickness=0.012), hat)
    parent(cylinder('straw_crown', 0.19, 0.11, (0, 0, 0.055), m['hat'], r_top=0.17), hat)
    parent(cylinder('straw_ribbon', 0.192, 0.03, (0, 0, 0.02), m['accent'], r_top=0.186), hat)
    # A trowel in the right hand.
    hand = joint('elbow_r')
    parent(tube('trowel_handle', [(0, 0, -0.13), (0, -0.02, -0.18)], 0.012, m['wood']), hand)
    parent(rbox('trowel_blade', (0.04, 0.01, 0.07), (0, -0.03, -0.23), m['metal'], 0.01), hand)


def hacker(m):
    neck = joint('neck')
    lashes(m)
    chest = joint('chest')
    # Techwear jacket with glowing seams and a high collar.
    parent(rbox('jacket_seam', (0.012, 0.02, 0.22), (0.03, -0.088, 0.12), m['neon'], 0.004), chest)
    for z in (0.06, 0.18):
        parent(rbox(f'chest_line_{z}', (0.27, 0.02, 0.01), (0, -0.087, z), m['neon'], 0.003), chest)
    parent(cylinder('high_collar', 0.09, 0.06, (0, -0.005, 0.27), m['top'], r_top=0.085), chest)
    for side in ('l', 'r'):
        parent(torus(f'cuff_{side}', 0.04, 0.008, (0, 0, -0.085), (0, 0, 0), m['neon']), joint(f'elbow_{side}'))
        parent(rbox(f'sole_{side}', (0.092, 0.138, 0.014), (0, -0.025, -0.038), m['neon'], 0.006), joint(f'ankle_{side}'))
    # A side-swept fringe streak and goggles pushed up on the head.
    parent(tube('streak', [HEAD_C + Vector((0.05, -0.17, 0.14)), HEAD_C + Vector((0.12, -0.15, 0.06)),
                           HEAD_C + Vector((0.15, -0.12, -0.02))], 0.02, m['neon']), neck)
    parent(torus('goggle_band', 0.205, 0.012, HEAD_C + Vector((0, 0.0, 0.1)), (D(-12), 0, 0), m['ink']), neck)
    for sx in (1, -1):
        parent(cylinder(f'goggle_{sx}', 0.045, 0.04, HEAD_C + Vector((sx * 0.065, -0.17, 0.15)), m['lens'],
                        rot=(D(70), 0, 0)), neck)
    # A wrist screen.
    parent(rbox('wristpad', (0.05, 0.03, 0.04), (0, -0.035, -0.07), m['neon'], 0.008), joint('elbow_l'))


def marine(m):
    neck = joint('neck')
    lashes(m)
    chest = joint('chest')
    # Wetsuit with yellow side stripes, a dive mask on the head, a shell necklace.
    for sx in (1, -1):
        parent(rbox(f'side_stripe_{sx}', (0.02, 0.15, 0.22), (sx * 0.133, 0.0, 0.12), m['accent'], 0.006), chest)
    for side, sx in (('l', 1), ('r', -1)):
        stripe = parent(capsule(f'leg_stripe_{side}', 0.1, 0.012, m['accent']), joint(f'hip_{side}'))
        stripe.location = (sx * 0.047, 0, -0.01)
    parent(tube('necklace', [(-0.07, -0.07, 0.245), (0, -0.1, 0.21), (0.07, -0.07, 0.245)], 0.005, m['shell']), chest)
    parent(sphere('shell', 0.022, (0, -0.105, 0.205), m['shell'], scale=(1, 0.5, 0.9)), chest)
    parent(torus('mask_strap', 0.205, 0.012, HEAD_C + Vector((0, 0.0, 0.1)), (D(-12), 0, 0), m['strap']), neck)
    parent(rbox('mask', (0.17, 0.05, 0.075), HEAD_C + Vector((0, -0.165, 0.155)), m['strap'], 0.02, rot=(D(-25), 0, 0)), neck)
    parent(rbox('mask_glass', (0.145, 0.03, 0.055), HEAD_C + Vector((0, -0.19, 0.16)), m['lens'], 0.015, rot=(D(-25), 0, 0)), neck)
    # A snorkel on the left side of the mask.
    parent(tube('snorkel', [HEAD_C + Vector((0.11, -0.13, 0.15)), HEAD_C + Vector((0.2, -0.05, 0.2)),
                            HEAD_C + Vector((0.2, 0.02, 0.26))], 0.014, m['accent']), neck)


COSTUMES = {'astronaut': astronaut, 'samurai': samurai, 'detective': detective, 'chef': chef, 'explorer': explorer,
            'witch': witch, 'idol': idol, 'gardener': gardener, 'hacker': hacker, 'marine': marine}

SKIN = '#f6d2b5'
BASE = {'skin': SKIN, 'shirt': '#f2f2ef', 'shoes': '#151619', 'lapel': '#24396a', 'accent': '#e2a33a'}

# PS-250C spec keys (colours, outfit, hair, shirt, tie, lapels, glasses,
# short_sleeves) plus `extra` colours for the costume pieces above. Outfit
# 'plain' is a torso without the PS-250C outfit details (protagonists.py draws
# nothing for an outfit it does not know), for sets that bring their own.
SPECS = {
    'astronaut': {'colors': {**BASE, 'hair': '#4a3424', 'top': '#eef1f5', 'pants': '#e2e6ec', 'shoes': '#c4cad3',
                             'accent': '#ef7d2d'},
                  'outfit': 'track', 'hair': 'short',
                  'extra': {'metal': '#8d97a6', 'light_a': '#e94b4b', 'light_b': '#4bc97a', 'light_c': '#4ba3e9'}},
    'samurai': {'colors': {**BASE, 'hair': '#1d1b1f', 'top': '#f1ece0', 'pants': '#2b3556', 'shoes': '#8a6a46',
                           'accent': '#b8322b'},
                'outfit': 'plain', 'hair': 'short',
                'extra': {'collar': '#2b3556', 'obi': '#b8322b', 'wood': '#b98a55'}},
    'detective': {'colors': {**BASE, 'hair': '#3a2a1e', 'top': '#c9a46a', 'pants': '#4a3b2c', 'shoes': '#3a2a1e',
                             'lapel': '#b8925a', 'tie': '#7a2a2f', 'belt': '#6b4a2f'},
                  'shirt': True, 'tie': True, 'lapels': True, 'hair': 'short',
                  'extra': {'hat': '#5a4330', 'band': '#2a2019', 'scarf': '#8a2f36', 'metal': '#c9a24a'}},
    'chef': {'colors': {**BASE, 'hair': '#5a3a24', 'top': '#f8f8f4', 'pants': '#3c3d44', 'shoes': '#202126',
                        'accent': '#d23b32', 'shirt': '#ffffff'},
             'outfit': 'plain', 'hair': 'messy',
             'extra': {'button': '#2a2b31', 'apron': '#e9e4d8', 'metal': '#b7bcc4'}},
    'explorer': {'colors': {**BASE, 'hair': '#6b4428', 'top': '#d6c49a', 'pants': '#a38c63', 'shoes': '#5a3a22',
                            'accent': '#4f7a4a', 'belt': '#5a3a22'},
                 'outfit': 'plain', 'short_sleeves': True, 'hair': 'short', 'skin': '#e9b994',
                 'extra': {'vest': '#6e7650', 'vest_dark': '#565d3e', 'bag': '#8a6a3e', 'hat': '#eadfc2', 'band': '#6b5638'}},
    'witch': {'colors': {**BASE, 'hair': '#4a2e6e', 'top': '#5b3a8c', 'pants': '#2a2433', 'shoes': '#2a2433',
                         'accent': '#e6c35c'},
              'outfit': 'plain', 'hair': 'long',
              'extra': {'top_dark': '#4a2f74', 'hat': '#3a2560', 'wood': '#6b4a2f'},
              'glow': {'spark': ('#ffe27a', 6.0)}},
    'idol': {'colors': {**BASE, 'hair': '#e8c27a', 'top': '#f59ac0', 'pants': '#fbe3ec', 'shoes': '#ffffff',
                        'accent': '#7b6cf0'},
             'outfit': 'plain', 'short_sleeves': True, 'hair': 'short',
             'extra': {'frill': '#ffd3e6', 'star': '#ffd24a'}},
    'gardener': {'colors': {**BASE, 'hair': '#8a4b2a', 'top': '#f1c9b8', 'pants': '#e8d6c4', 'shoes': '#4f8a55',
                            'accent': '#d9534f'},
                 'outfit': 'plain', 'short_sleeves': True, 'hair': 'short', 'skin': '#f3cba8',
                 'extra': {'denim': '#5a7fb3', 'denim_dark': '#486a99', 'hat': '#e6cf8a', 'wood': '#8a5a34',
                           'metal': '#9aa3ad'}},
    'hacker': {'colors': {**BASE, 'hair': '#26262c', 'top': '#1f2228', 'pants': '#2a2d35', 'shoes': '#15161a',
                          'accent': '#43f59a'},
               'outfit': 'hoodie', 'hair': 'bob',
               'extra': {'lens': '#1b3a2c'},
               'glow': {'neon': ('#43f59a', 3.0)}},
    'marine': {'colors': {**BASE, 'hair': '#23324f', 'top': '#1f8a9a', 'pants': '#1f8a9a', 'shoes': '#16606c',
                          'accent': '#f5c542'},
               'outfit': 'track', 'hair': 'long', 'skin': '#e9b994',
               'extra': {'strap': '#16606c', 'lens': '#9fdcef', 'shell': '#f4e3d0'}},
}


def build(spec_id, pose_id):
    spec = SPECS[spec_id]
    colors = dict(spec['colors'])
    if spec.get('skin'):
        colors['skin'] = spec['skin']
    root = P.build_character({**spec, 'colors': colors}, P.POSES[pose_id])
    m = {k: bpy.data.materials[k] for k in colors}
    m['ink'] = bpy.data.materials['ink']
    for key, hex_color in spec.get('extra', {}).items():
        m[key] = mat(f'{spec_id}_{key}', hex_color)
    for key, (hex_color, strength) in spec.get('glow', {}).items():
        m[key] = glow(f'{spec_id}_{key}', hex_color, strength)
    # Skirts and robes take the outfit colour unless the set names its own.
    m.setdefault('skirt', m['top'])
    COSTUMES[spec_id](m)
    return root

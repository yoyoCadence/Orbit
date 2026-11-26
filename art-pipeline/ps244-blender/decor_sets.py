"""PS-260C: the two decorations of each themed set, built into the PS-244 scene.

Each set's room (room_styles.PS260_STYLES) has two decorations of its own,
in two free spots of the shared room, so they never overlap the furniture or
the six PS-250F decorations:

- BACK: the floor against the back wall, between the desk and the shelf, under
  the photo frame. A standing piece, at most about 1.45 m tall, so it stays
  under the frame.
- FRONT: the free floor at the front right, by the window. A piece about knee to
  waist high; small objects bring their own stool or side table.

A decoration is built in every scene (like the PS-250F ones) but rendered
only in its own room (render_pack.py --only <id> --style <room>). Parts that
glow are emission materials only: like the PS-250F floor lamp, they light
nothing else, so the shared room render is unchanged. `b.lighting` says
whether a lamp glows (night) or shows its shade (day).
"""
import math
import random

from scene import BACK_Y, RIGHT_X, emission_material, srgb, toon_material

D = math.radians
BACK = (1.1, BACK_Y - 0.42)    # x, y of the back-wall spot
FRONT = (3.15, -1.35)          # x, y of the front-right spot


def tm(b, name, hex_color, rough=0.55, metal=0.0, gloss=0.0):
    key = f'ps260-{name}'
    if key not in b.m:
        b.m[key] = toon_material(key, srgb(hex_color), rough, metal, gloss=gloss)
    return b.m[key]


def glow(b, name, hex_color, day, night):
    """An emission material: brighter at night, `day` 0 means a plain toon colour by day."""
    key = f'ps260-{name}-glow'
    if key not in b.m:
        night_time = getattr(b, 'lighting', 'day') == 'night'
        if not night_time and day == 0:
            b.m[key] = toon_material(key, srgb(hex_color), 0.5)
        else:
            b.m[key] = emission_material(key, srgb(hex_color), night if night_time else day)
    return b.m[key]


# ── 太空人 ───────────────────────────────────────────────────────────────────
def build_rocket(b):
    m, g = b.m, 'deco-rocket'
    x, y = BACK
    white, red = tm(b, 'rocket-white', '#f2f4f7', 0.4, gloss=0.2), tm(b, 'rocket-red', '#e24b3a', 0.45)
    blue = glow(b, 'rocket-window', '#7fd3ff', 0.6, 2.0)
    b.cyl(g, 0.2, 0.05, (x, y, 0.025), m['steel'])
    b.cyl(g, 0.02, 0.22, (x, y, 0.16), m['steel'], verts=12)
    b.cyl(g, 0.12, 0.62, (x, y, 0.58), white, verts=32)
    b.cyl(g, 0.12, 0.26, (x, y, 1.02), white, r2=0.0, verts=32)
    b.cyl(g, 0.125, 0.04, (x, y, 0.86), red, verts=32)
    b.cyl(g, 0.1, 0.08, (x, y, 0.29), m['steel'], r2=0.07, verts=24)
    for k in range(3):
        a = D(90 + k * 120)
        b.box(g, (0.02, 0.14, 0.2), (x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, 0.4), red,
              rot=(0, 0, a + D(90)), bevel=0.01)
    b.torus(g, 0.05, 0.012, (x, y - 0.118, 0.68), m['steel'], rot=(D(90), 0, 0))
    b.sphere(g, 0.045, (x, y - 0.112, 0.68), blue, scale=(1, 0.4, 1))


def build_planet(b):
    m, g = b.m, 'deco-planet'
    x, y = FRONT
    body = glow(b, 'planet-body', '#ef9a4a', 0, 3.0)
    ring = tm(b, 'planet-ring', '#f3d39a', 0.4, gloss=0.2)
    b.cyl(g, 0.18, 0.05, (x, y, 0.025), m['walnut'])
    b.tube(g, [(x, y + 0.05, 0.05), (x + 0.02, y + 0.12, 0.35), (x, y + 0.02, 0.62)], 0.015, m['brass'])
    b.sphere(g, 0.2, (x, y, 0.74), body, segments=40)
    b.torus(g, 0.31, 0.022, (x, y, 0.74), ring, rot=(D(70), D(-15), 0))
    for k in range(3):
        a = D(30 + k * 120)
        b.sphere(g, 0.03, (x + math.cos(a) * 0.28, y + math.sin(a) * 0.28, 0.98 + k * 0.03),
                 glow(b, 'planet-moon', '#f6f0d6', 0.4, 2.5))


# ── 武士 ─────────────────────────────────────────────────────────────────────
def build_katana(b):
    m, g = b.m, 'deco-katana'
    x, y = BACK
    lacquer, cord = tm(b, 'katana-sheath', '#1b1d22', 0.3, gloss=0.3), tm(b, 'katana-cord', '#b8322b', 0.6)
    b.box(g, (0.62, 0.26, 0.06), (x, y, 0.03), m['oak_dark'], bevel=0.01)
    for sx in (-1, 1):
        b.box(g, (0.05, 0.08, 0.62), (x + sx * 0.24, y, 0.37), m['oak_dark'], bevel=0.01)
        b.box(g, (0.12, 0.1, 0.05), (x + sx * 0.24, y, 0.68), m['oak'], bevel=0.01)
    for k, z in enumerate((0.42, 0.6)):
        b.tube(g, [(x - 0.32, y - 0.04, z), (x, y - 0.05, z + 0.03), (x + 0.32, y - 0.04, z + 0.06)], 0.022, lacquer)
        b.cyl(g, 0.026, 0.12, (x - 0.38, y - 0.04, z - 0.01), cord, rot=(0, D(90), 0), verts=12)
        b.torus(g, 0.03, 0.008, (x - 0.31, y - 0.04, z), m['brass'], rot=(0, D(90), 0))
    b.box(g, (0.16, 0.03, 0.4), (x, y + 0.12, 0.98), cord, bevel=0.01)
    b.box(g, (0.18, 0.03, 0.03), (x, y + 0.12, 1.19), m['oak_dark'], bevel=0.005)


def build_bonsai(b):
    m, g = b.m, 'deco-bonsai'
    x, y = FRONT
    pot, leaf = tm(b, 'bonsai-pot', '#2f4a7a', 0.35, gloss=0.25), tm(b, 'bonsai-leaf', '#3f7a3a', 0.6)
    leaf_dark = tm(b, 'bonsai-leaf-dark', '#2f5f2e', 0.6)
    b.box(g, (0.6, 0.4, 0.04), (x, y, 0.32), m['oak_dark'], bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(g, (0.05, 0.05, 0.3), (x + sx * 0.25, y + sy * 0.15, 0.15), m['oak_dark'])
    b.box(g, (0.36, 0.22, 0.09), (x, y, 0.385), pot, bevel=0.015)
    b.box(g, (0.32, 0.18, 0.01), (x, y, 0.432), m['soil'])
    trunk = [(x - 0.04, y, 0.43), (x + 0.06, y, 0.55), (x - 0.03, y + 0.02, 0.66), (x + 0.08, y, 0.76)]
    b.tube(g, trunk, 0.028, m['stem'])
    rng = random.Random(260)
    for cx, cz, r in ((x + 0.12, 0.8, 0.12), (x - 0.12, 0.7, 0.1), (x + 0.02, 0.9, 0.1), (x + 0.2, 0.68, 0.08)):
        for _ in range(3):
            b.sphere(g, r * rng.uniform(0.7, 1.0), (cx + rng.uniform(-0.05, 0.05), y + rng.uniform(-0.05, 0.05),
                                                    cz + rng.uniform(-0.02, 0.03)),
                     leaf if rng.random() < 0.6 else leaf_dark, scale=(1.2, 1.0, 0.6), segments=16)


# ── 偵探 ─────────────────────────────────────────────────────────────────────
def build_hatstand(b):
    m, g = b.m, 'deco-hatstand'
    x, y = BACK
    coat, hat = tm(b, 'hatstand-coat', '#c9a46a', 0.75), tm(b, 'hatstand-hat', '#5a4330', 0.6)
    band = tm(b, 'hatstand-band', '#2a2019', 0.6)
    for k in range(3):
        a = D(90 + k * 120)
        b.tube(g, [(x, y, 0.12), (x + math.cos(a) * 0.22, y + math.sin(a) * 0.22, 0.02)], 0.02, m['walnut'])
    b.cyl(g, 0.025, 1.38, (x, y, 0.71), m['walnut'], verts=16)
    b.sphere(g, 0.04, (x, y, 1.42), m['brass'])
    for k in range(4):
        a = D(45 + k * 90)
        b.tube(g, [(x, y, 1.3), (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, 1.36)], 0.012, m['brass'])
    # The trench coat hanging from one hook, and the fedora on another.
    b.panel(g, 0.3, 0.72, 0.03, (x + 0.08, y - 0.05, 0.96), coat, rot=(0, D(-4), 0), bend=0.06, wave=(0.008, 2))
    b.box(g, (0.3, 0.035, 0.035), (x + 0.08, y - 0.06, 0.86), band, bevel=0.01)
    b.cyl(g, 0.15, 0.012, (x - 0.1, y - 0.06, 1.33), hat, rot=(D(10), D(-14), 0))
    b.cyl(g, 0.09, 0.09, (x - 0.1, y - 0.06, 1.38), hat, rot=(D(10), D(-14), 0), r2=0.075)
    b.cyl(g, 0.091, 0.02, (x - 0.1, y - 0.06, 1.35), band, rot=(D(10), D(-14), 0))


def build_typewriter(b):
    m, g = b.m, 'deco-typewriter'
    x, y = FRONT
    body, keys = tm(b, 'typewriter-body', '#2a2b31', 0.35, gloss=0.3), tm(b, 'typewriter-key', '#efe6d0', 0.4)
    paper = m['paper']
    b.box(g, (0.62, 0.46, 0.04), (x, y, 0.56), m['walnut'], bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(g, (0.04, 0.04, 0.54), (x + sx * 0.27, y + sy * 0.19, 0.27), m['walnut'])
    b.box(g, (0.36, 0.26, 0.1), (x, y, 0.63), body, bevel=0.03)
    b.box(g, (0.34, 0.1, 0.05), (x, y + 0.11, 0.71), body, bevel=0.02)
    b.cyl(g, 0.03, 0.42, (x, y + 0.11, 0.75), body, rot=(0, D(90), 0), verts=16)
    b.box(g, (0.24, 0.005, 0.18), (x, y + 0.13, 0.84), paper, rot=(D(-12), 0, 0))
    for row in range(3):
        for k in range(7 - row):
            b.cyl(g, 0.014, 0.012, (x - 0.12 + row * 0.02 + k * 0.04, y - 0.1 + row * 0.04, 0.69 + row * 0.012), keys, verts=10)


# ── 主廚 ─────────────────────────────────────────────────────────────────────
def build_cake(b):
    m, g = b.m, 'deco-cake'
    x, y = BACK
    cream, pink = tm(b, 'cake-cream', '#fbf3e6', 0.45, gloss=0.15), tm(b, 'cake-pink', '#f4a6b8', 0.45, gloss=0.15)
    berry, iron = tm(b, 'cake-berry', '#d2302f', 0.3, gloss=0.3), tm(b, 'cake-iron', '#26262a', 0.4, metal=0.5)
    # A round bistro table with an iron leg.
    b.cyl(g, 0.3, 0.035, (x, y, 0.74), m['oak'])
    b.cyl(g, 0.025, 0.7, (x, y, 0.37), iron, verts=12)
    b.cyl(g, 0.2, 0.03, (x, y, 0.015), iron)
    # A three-tier cake on a stand.
    b.cyl(g, 0.2, 0.015, (x, y, 0.77), m['ceramic'])
    for k, (r, h, mat) in enumerate(((0.17, 0.12, cream), (0.125, 0.1, pink), (0.085, 0.09, cream))):
        z = 0.78 + sum((0.12, 0.1, 0.09)[:k])
        b.cyl(g, r, h, (x, y, z + h / 2), mat, verts=32)
        b.torus(g, r, 0.012, (x, y, z + h), pink if mat is cream else cream)
    for k in range(6):
        a = D(k * 60)
        b.sphere(g, 0.022, (x + math.cos(a) * 0.06, y + math.sin(a) * 0.06, 1.1), berry)
    b.sphere(g, 0.03, (x, y, 1.11), berry)


def build_bread(b):
    m, g = b.m, 'deco-bread'
    x, y = FRONT
    wicker, crust = tm(b, 'bread-wicker', '#b8874a', 0.8), tm(b, 'bread-crust', '#d59a4e', 0.6)
    crust_dark = tm(b, 'bread-crust-dark', '#a8692e', 0.6)
    cloth = tm(b, 'bread-cloth', '#d23b32', 0.8)
    # A crate stool and a basket of loaves and baguettes.
    b.box(g, (0.42, 0.34, 0.36), (x, y, 0.18), m['oak'], bevel=0.015)
    for z in (0.08, 0.2, 0.32):
        b.box(g, (0.43, 0.35, 0.02), (x, y, z), m['oak_dark'])
    b.cyl(g, 0.2, 0.16, (x, y, 0.44), wicker, r2=0.23, verts=28)
    b.torus(g, 0.23, 0.02, (x, y, 0.52), wicker)
    b.box(g, (0.3, 0.3, 0.01), (x + 0.02, y, 0.52), cloth, rot=(0, 0, D(20)))
    for k, (dx, dy) in enumerate(((-0.08, 0.02), (0.06, -0.05), (0.02, 0.08))):
        b.sphere(g, 0.09, (x + dx, y + dy, 0.56), crust if k % 2 else crust_dark, scale=(1.1, 1.0, 0.7))
    for k, lean in enumerate((-14, 6, 20)):
        a = D(lean)
        b.tube(g, [(x - 0.05 + k * 0.05, y + 0.06, 0.5), (x - 0.05 + k * 0.05 + math.sin(a) * 0.3, y + 0.1, 0.5 + math.cos(a) * 0.32)],
               0.028, crust)


# ── 探險家 ───────────────────────────────────────────────────────────────────
def build_fern(b):
    m, g = b.m, 'deco-fern'
    x, y = BACK
    basket, frond = tm(b, 'fern-basket', '#9a7a48', 0.85), tm(b, 'fern-frond', '#4f9a3a', 0.55, gloss=0.1)
    frond_dark = tm(b, 'fern-frond-dark', '#3a7a2e', 0.55)
    b.cyl(g, 0.26, 0.42, (x, y, 0.21), basket, r2=0.3, verts=32)
    for z in (0.1, 0.22, 0.34):
        b.torus(g, 0.27 + z * 0.1, 0.012, (x, y, z), m['walnut'])
    b.cyl(g, 0.27, 0.02, (x, y, 0.41), m['soil'])
    rng = random.Random(7)
    for k in range(22):
        yaw = D(k * 360 / 22 + rng.uniform(-8, 8))
        pitch = D(rng.uniform(-35, 10))
        b.leaf(g, (x, y, 0.42), rng.uniform(0.6, 0.85), 0.16, yaw, pitch, frond if k % 3 else frond_dark)


def build_lantern(b):
    m, g = b.m, 'deco-lantern'
    x, y = FRONT
    crate, flame = tm(b, 'lantern-crate', '#8a6a3e', 0.8), glow(b, 'lantern-glass', '#ffcf7a', 0.8, 5.0)
    b.box(g, (0.46, 0.36, 0.38), (x, y, 0.19), crate, bevel=0.012)
    for z in (0.06, 0.19, 0.32):
        b.box(g, (0.47, 0.37, 0.025), (x, y, z), m['oak_dark'])
    b.box(g, (0.3, 0.02, 0.06), (x, y - 0.19, 0.27), tm(b, 'lantern-stencil', '#2f3a28', 0.8))
    lx, ly = x + 0.05, y
    b.cyl(g, 0.09, 0.04, (lx, ly, 0.4), m['brass'])
    b.cyl(g, 0.065, 0.18, (lx, ly, 0.51), flame, verts=24)
    for k in range(4):
        a = D(45 + k * 90)
        b.cyl(g, 0.008, 0.2, (lx + math.cos(a) * 0.07, ly + math.sin(a) * 0.07, 0.51), m['brass'], verts=8)
    b.cyl(g, 0.085, 0.05, (lx, ly, 0.62), m['brass'], r2=0.04)
    b.torus(g, 0.06, 0.008, (lx, ly, 0.7), m['brass'], rot=(D(90), 0, 0))
    b.box(g, (0.1, 0.16, 0.05), (x - 0.13, y + 0.05, 0.405), tm(b, 'lantern-map', '#e8dcb8', 0.9), rot=(0, 0, D(25)))


# ── 魔法師 ───────────────────────────────────────────────────────────────────
def build_potions(b):
    m, g = b.m, 'deco-potions'
    x, y = BACK
    colours = ('#b36cff', '#4be0b0', '#ff6fa0', '#ffd24a', '#6fb6ff')
    # A narrow cabinet with two shelves of bottles.
    w, d, h = 0.66, 0.3, 1.18
    b.box(g, (w, d, 0.04), (x, y, 0.02), m['walnut'])
    b.box(g, (w, d, 0.04), (x, y, h), m['walnut'], bevel=0.01)
    for sx in (-1, 1):
        b.box(g, (0.04, d, h), (x + sx * (w / 2 - 0.02), y, h / 2), m['walnut'])
    b.box(g, (w, 0.02, h), (x, y + d / 2 - 0.01, h / 2), m['oak_dark'])
    rng = random.Random(12)
    for z in (0.04, 0.42, 0.8):
        b.box(g, (w - 0.06, d - 0.02, 0.03), (x, y, z + 0.015), m['walnut'])
        k = 0
        px = x - w / 2 + 0.1
        while px < x + w / 2 - 0.08:
            colour = colours[(k + int(z * 10)) % len(colours)]
            liquid = glow(b, f'potion-{colour}', colour, 0.6, 2.2)
            r = rng.uniform(0.04, 0.06)
            hgt = rng.uniform(0.1, 0.2)
            if k % 2:
                b.sphere(g, r * 1.2, (px, y - 0.03, z + 0.03 + r * 1.2), liquid)
            else:
                b.cyl(g, r, hgt, (px, y - 0.03, z + 0.03 + hgt / 2), liquid, verts=16)
                hgt = hgt - r * 1.2
            b.cyl(g, 0.016, 0.06, (px, y - 0.03, z + 0.03 + max(hgt, 0) + r * 2.4), m['ceramic'], verts=10)
            b.cyl(g, 0.019, 0.025, (px, y - 0.03, z + 0.06 + max(hgt, 0) + r * 2.4 + 0.03), m['walnut'], verts=10)
            px += r * 2 + 0.035
            k += 1


def build_crystal(b):
    m, g = b.m, 'deco-crystal'
    x, y = FRONT
    stone, orb = tm(b, 'crystal-stone', '#4a4566', 0.7), glow(b, 'crystal-orb', '#b48cff', 1.2, 4.0)
    core = glow(b, 'crystal-core', '#ffffff', 1.5, 6.0)
    b.cyl(g, 0.2, 0.06, (x, y, 0.03), stone, verts=8)
    b.cyl(g, 0.12, 0.5, (x, y, 0.31), stone, r2=0.09, verts=8)
    b.cyl(g, 0.17, 0.05, (x, y, 0.585), stone, verts=8)
    for k in range(4):
        a = D(45 + k * 90)
        b.tube(g, [(x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, 0.61),
                   (x + math.cos(a) * 0.13, y + math.sin(a) * 0.13, 0.7)], 0.014, m['brass'])
    b.sphere(g, 0.15, (x, y, 0.78), orb, segments=40)
    b.sphere(g, 0.05, (x + 0.03, y - 0.04, 0.8), core)
    b.torus(g, 0.13, 0.012, (x, y, 0.66), m['brass'])


# ── 偶像 ─────────────────────────────────────────────────────────────────────
def build_mic(b):
    m, g = b.m, 'deco-mic'
    x, y = BACK
    black, mesh = tm(b, 'mic-black', '#1d1d24', 0.35, gloss=0.3), tm(b, 'mic-mesh', '#c9c4d6', 0.3, metal=0.8)
    star = glow(b, 'mic-star', '#ffd24a', 0.8, 3.0)
    for k in range(3):
        a = D(90 + k * 120)
        b.tube(g, [(x, y, 0.3), (x + math.cos(a) * 0.26, y + math.sin(a) * 0.26, 0.02)], 0.014, black)
    b.cyl(g, 0.016, 1.15, (x, y, 0.88), black, verts=12)
    b.tube(g, [(x, y, 1.42), (x - 0.12, y - 0.1, 1.44), (x - 0.22, y - 0.18, 1.4)], 0.012, black)
    b.cyl(g, 0.03, 0.14, (x - 0.24, y - 0.2, 1.37), black, rot=(D(-35), D(20), 0), verts=16)
    b.sphere(g, 0.045, (x - 0.27, y - 0.24, 1.32), mesh)
    b.box(g, (0.07, 0.01, 0.07), (x, y - 0.02, 1.0), star, rot=(0, D(45), 0))
    # Two pastel glow sticks in a holder at the foot.
    b.cyl(g, 0.05, 0.08, (x + 0.2, y + 0.05, 0.04), m['steel'], verts=16)
    for k, colour in enumerate(('#ff8fd0', '#6fd8ff')):
        b.cyl(g, 0.012, 0.3, (x + 0.19 + k * 0.03, y + 0.05, 0.2), glow(b, f'mic-stick-{k}', colour, 1.0, 3.5),
              rot=(0, D(-8 + k * 16), 0), verts=10)


def build_heartlamp(b):
    m, g = b.m, 'deco-heartlamp'
    x, y = FRONT
    heart = glow(b, 'heart', '#ff6fa8', 0, 4.0)
    b.cyl(g, 0.2, 0.42, (x, y, 0.21), tm(b, 'heart-stool', '#f7f2f5', 0.35, gloss=0.3), r2=0.16, verts=32)
    b.torus(g, 0.2, 0.015, (x, y, 0.42), m['brass'])
    hz = 0.68
    for sx in (-1, 1):
        b.sphere(g, 0.13, (x + sx * 0.09, y, hz + 0.08), heart, scale=(1, 0.6, 1))
    b.cyl(g, 0.175, 0.24, (x, y, hz - 0.06), heart, rot=(D(180), 0, 0), r2=0.0, verts=4)
    for k in range(3):
        a = D(30 + k * 70)
        b.sphere(g, 0.02, (x + math.cos(a) * 0.3, y - 0.05, hz + 0.25 + k * 0.05), glow(b, 'heart-spark', '#ffffff', 0.6, 2.5))


# ── 園藝師 ───────────────────────────────────────────────────────────────────
def build_flowerpot(b):
    m, g = b.m, 'deco-flowerpot'
    x, y = BACK
    pot, stem = tm(b, 'sunflower-pot', '#c9784a', 0.6), tm(b, 'sunflower-stem', '#4f8a3a', 0.6)
    petal, centre = tm(b, 'sunflower-petal', '#f6c83a', 0.45, gloss=0.1), tm(b, 'sunflower-centre', '#6b4428', 0.8)
    leaf = tm(b, 'sunflower-leaf', '#5f9a4a', 0.55)
    b.box(g, (0.66, 0.3, 0.3), (x, y, 0.15), pot, bevel=0.02)
    b.box(g, (0.62, 0.26, 0.02), (x, y, 0.3), m['soil'])
    for k, (dx, h, tilt) in enumerate(((-0.2, 1.05, -8), (0.0, 1.3, 4), (0.2, 0.95, 12))):
        a = D(tilt)
        top = (x + dx + math.sin(a) * (h - 0.3), y - 0.02, 0.3 + math.cos(a) * (h - 0.3))
        b.tube(g, [(x + dx, y, 0.3), (x + dx + math.sin(a) * 0.3, y, 0.62), top], 0.014, stem)
        b.leaf(g, (x + dx, y, 0.5), 0.2, 0.1, D(90 if k % 2 else -90), D(-20), leaf)
        for p in range(12):
            pa = D(p * 30)
            b.sphere(g, 0.05, (top[0] + math.cos(pa) * 0.08, top[1] - 0.03, top[2] + math.sin(pa) * 0.08), petal,
                     scale=(1.0, 0.3, 0.55), rot=(0, -pa, 0), segments=12)
        b.cyl(g, 0.055, 0.03, (top[0], top[1] - 0.04, top[2]), centre, rot=(D(90), 0, 0), verts=20)


def build_wateringcan(b):
    m, g = b.m, 'deco-wateringcan'
    x, y = FRONT
    can, pot = tm(b, 'can-green', '#4f8a55', 0.35, metal=0.4, gloss=0.2), tm(b, 'can-pot', '#c9784a', 0.6)
    flower = tm(b, 'can-flower', '#f28db2', 0.5)
    # A low wooden step with two small pots, and the watering can on the floor.
    b.box(g, (0.5, 0.3, 0.2), (x + 0.02, y + 0.08, 0.1), m['oak'], bevel=0.012)
    for k, dx in enumerate((-0.12, 0.14)):
        b.cyl(g, 0.07, 0.12, (x + dx, y + 0.08, 0.26), pot, r2=0.085, verts=20)
        for f in range(5):
            a = D(f * 72 + k * 20)
            b.sphere(g, 0.03, (x + dx + math.cos(a) * 0.04, y + 0.08 + math.sin(a) * 0.04, 0.36),
                     flower if k == 0 else m['succulent'], segments=12)
    cx, cy = x - 0.05, y - 0.16
    b.cyl(g, 0.11, 0.2, (cx, cy, 0.1), can, verts=28)
    b.cyl(g, 0.11, 0.02, (cx, cy, 0.205), can, r2=0.06, verts=28)
    b.tube(g, [(cx + 0.09, cy, 0.06), (cx + 0.2, cy - 0.02, 0.16), (cx + 0.3, cy - 0.03, 0.28)], 0.016, can)
    b.cyl(g, 0.035, 0.03, (cx + 0.31, cy - 0.03, 0.29), can, rot=(0, D(55), 0), verts=16)
    b.torus(g, 0.08, 0.012, (cx - 0.08, cy, 0.17), can, rot=(D(90), 0, 0))


# ── 駭客 ─────────────────────────────────────────────────────────────────────
def build_server(b):
    m, g = b.m, 'deco-server'
    x, y = BACK
    case, unit = tm(b, 'server-case', '#15191e', 0.4, metal=0.4), tm(b, 'server-unit', '#232a31', 0.35, metal=0.5)
    leds = [glow(b, f'server-led-{c}', c, 2.0, 4.0) for c in ('#43f59a', '#43f59a', '#ff3fb0', '#5cc8ff')]
    w, d, h = 0.6, 0.5, 1.3
    b.box(g, (w, d, h), (x, y, h / 2 + 0.04), case, bevel=0.015)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.cyl(g, 0.025, 0.04, (x + sx * 0.25, y + sy * 0.2, 0.02), m['rubber'], verts=12)
    rng = random.Random(3)
    for k in range(9):
        z = 0.12 + k * 0.13
        b.box(g, (w - 0.08, 0.02, 0.1), (x, y - d / 2 - 0.005, z), unit, bevel=0.005)
        for n in range(rng.randint(2, 5)):
            b.sphere(g, 0.009, (x - w / 2 + 0.08 + n * 0.035, y - d / 2 - 0.02, z + 0.02), rng.choice(leds), segments=8)
        b.box(g, (0.18, 0.006, 0.02), (x + 0.14, y - d / 2 - 0.018, z - 0.02), m['bezel'])
    b.tube(g, [(x + w / 2, y + 0.1, 1.2), (x + w / 2 + 0.1, y + 0.15, 0.7), (x + w / 2 + 0.05, y + 0.2, 0.04)], 0.012,
           leds[2])


def build_hologram(b):
    m, g = b.m, 'deco-hologram'
    x, y = FRONT
    base, holo = tm(b, 'holo-base', '#1a2026', 0.35, metal=0.6), glow(b, 'holo', '#5cf2ff', 1.6, 4.0)
    ring = glow(b, 'holo-ring', '#43f59a', 1.2, 3.0)
    b.cyl(g, 0.24, 0.08, (x, y, 0.04), base, verts=32)
    b.cyl(g, 0.18, 0.04, (x, y, 0.1), base, r2=0.14, verts=32)
    b.torus(g, 0.16, 0.01, (x, y, 0.12), ring)
    # A wireframe globe: rings around a small core, floating over the base.
    hz = 0.52
    b.sphere(g, 0.05, (x, y, hz), holo)
    for k in range(3):
        b.torus(g, 0.17, 0.006, (x, y, hz), holo, rot=(D(90), 0, D(k * 60)))
    for dz in (-0.1, 0.0, 0.1):
        r = math.sqrt(max(0.0, 0.17 ** 2 - dz ** 2))
        b.torus(g, r, 0.006, (x, y, hz + dz), holo)
    for k in range(3):
        b.box(g, (0.003, 0.003, 0.3), (x + math.cos(D(k * 120)) * 0.13, y + math.sin(D(k * 120)) * 0.13, 0.28), ring)


# ── 海洋學家 ─────────────────────────────────────────────────────────────────
def build_aquarium(b):
    m, g = b.m, 'deco-aquarium'
    x, y = BACK
    water = glow(b, 'aquarium-water', '#5fd0e6', 0.7, 1.8)
    fish = [tm(b, f'fish-{c}', c, 0.4, gloss=0.2) for c in ('#ff8a3a', '#ffd24a', '#ff5f7a')]
    weed, sand = tm(b, 'aquarium-weed', '#3f9a5a', 0.6), tm(b, 'aquarium-sand', '#e8d6a8', 0.9)
    w, d = 0.7, 0.34
    b.box(g, (w, d, 0.6), (x, y, 0.3), m['oak'], bevel=0.015)
    b.box(g, (w - 0.06, 0.02, 0.5), (x, y - d / 2, 0.3), m['oak_dark'], bevel=0.01)
    b.box(g, (w - 0.04, d - 0.04, 0.42), (x, y, 0.83), water)
    b.box(g, (w - 0.05, d - 0.05, 0.05), (x, y, 0.645), sand)
    for sx in (-1, 1):
        for sy in (-1, 1):
            b.box(g, (0.025, 0.025, 0.46), (x + sx * (w / 2 - 0.012), y + sy * (d / 2 - 0.012), 0.83), m['brass'])
    b.box(g, (w, d, 0.04), (x, y, 1.06), m['oak_dark'], bevel=0.01)
    for k, (dx, h) in enumerate(((-0.24, 0.3), (-0.18, 0.22), (0.22, 0.34))):
        b.tube(g, [(x + dx, y + 0.05, 0.67), (x + dx + 0.03, y + 0.05, 0.67 + h / 2), (x + dx - 0.02, y + 0.05, 0.67 + h)],
               0.015, weed)
    for k, (dx, dz) in enumerate(((-0.05, 0.85), (0.12, 0.92), (0.02, 0.76))):
        b.sphere(g, 0.035, (x + dx, y - 0.12, dz), fish[k], scale=(1.4, 0.5, 0.9))
        b.cyl(g, 0.025, 0.04, (x + dx - 0.06, y - 0.12, dz), fish[k], rot=(0, D(-90), 0), r2=0.0, verts=4)


def build_coral(b):
    m, g = b.m, 'deco-coral'
    x, y = FRONT
    rock = tm(b, 'coral-rock', '#7a8a8a', 0.8)
    corals = [glow(b, f'coral-{c}', c, 0, 3.0) for c in ('#ff7a8a', '#ffb35a', '#c58aff')]
    b.sphere(g, 0.24, (x, y, 0.08), rock, scale=(1.2, 1.0, 0.55))
    b.sphere(g, 0.14, (x + 0.16, y - 0.06, 0.14), rock, scale=(1.0, 1.0, 0.8))
    rng = random.Random(9)
    for k in range(7):
        bx, by = x + rng.uniform(-0.16, 0.16), y + rng.uniform(-0.1, 0.1)
        base = (bx, by, 0.18)
        h = rng.uniform(0.3, 0.55)
        tip = (bx + rng.uniform(-0.12, 0.12), by + rng.uniform(-0.05, 0.05), 0.18 + h)
        mid = ((bx + tip[0]) / 2 + rng.uniform(-0.05, 0.05), (by + tip[1]) / 2, 0.18 + h * 0.55)
        coral = corals[k % len(corals)]
        b.tube(g, [base, mid, tip], 0.025, coral)
        b.sphere(g, 0.035, tip, coral)
        side = (mid[0] + rng.uniform(-0.1, 0.1), mid[1], mid[2] + 0.12)
        b.tube(g, [mid, side], 0.018, coral)
        b.sphere(g, 0.025, side, coral)
    for k in range(3):
        b.sphere(g, 0.035, (x - 0.2 + k * 0.08, y - 0.2, 0.03), m['ceramic'], scale=(1, 0.8, 0.5))


DECOR_SETS_BUILDERS = {
    'deco-rocket': build_rocket, 'deco-planet': build_planet,
    'deco-katana': build_katana, 'deco-bonsai': build_bonsai,
    'deco-hatstand': build_hatstand, 'deco-typewriter': build_typewriter,
    'deco-cake': build_cake, 'deco-bread': build_bread,
    'deco-fern': build_fern, 'deco-lantern': build_lantern,
    'deco-potions': build_potions, 'deco-crystal': build_crystal,
    'deco-mic': build_mic, 'deco-heartlamp': build_heartlamp,
    'deco-flowerpot': build_flowerpot, 'deco-wateringcan': build_wateringcan,
    'deco-server': build_server, 'deco-hologram': build_hologram,
    'deco-aquarium': build_aquarium, 'deco-coral': build_coral,
}

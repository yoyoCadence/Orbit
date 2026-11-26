"""PS-260 character sets: ten themed protagonists, each with its own room and decorations.

Pure Python, so the Blender renderer and the Pillow post-process read the same
lists. Five sets are male and five female (user request, 2026-11-25). Each set
is a protagonist (`protagonist`), a room style (`room`, rendered by
ps244-blender with the style in room_styles.py) and two themed decorations
(`decor`) that stand in that room.

The protagonists use the PS-250C rig, poses and facings, so the runtime draws
them exactly like the six Q-style protagonists.
"""

SETS = [
    # ── male ────────────────────────────────────────────────────────────────
    {'id': 'astronaut', 'gender': 'male', 'label': '太空人',
     'room': ('spacestation', '太空站'),
     'decor': (('deco-rocket', '火箭模型'), ('deco-planet', '行星燈'))},
    {'id': 'samurai', 'gender': 'male', 'label': '武士',
     'room': ('dojo', '劍道場'),
     'decor': (('deco-katana', '刀架'), ('deco-bonsai', '盆景'))},
    {'id': 'detective', 'gender': 'male', 'label': '偵探',
     'room': ('noir', '偵探事務所'),
     'decor': (('deco-typewriter', '打字機'), ('deco-hatstand', '衣帽架'))},
    {'id': 'chef', 'gender': 'male', 'label': '主廚',
     'room': ('bistro', '法式廚房'),
     'decor': (('deco-cake', '蛋糕架'), ('deco-bread', '麵包籃'))},
    {'id': 'explorer', 'gender': 'male', 'label': '探險家',
     'room': ('jungle', '叢林營地'),
     'decor': (('deco-fern', '蕨類盆栽'), ('deco-lantern', '探險油燈'))},
    # ── female ──────────────────────────────────────────────────────────────
    {'id': 'witch', 'gender': 'female', 'label': '魔法師',
     'room': ('wizard', '魔法塔'),
     'decor': (('deco-crystal', '水晶球'), ('deco-potions', '魔藥瓶'))},
    {'id': 'idol', 'gender': 'female', 'label': '偶像',
     'room': ('stage', '偶像練習室'),
     'decor': (('deco-mic', '麥克風架'), ('deco-heartlamp', '愛心燈'))},
    {'id': 'gardener', 'gender': 'female', 'label': '園藝師',
     'room': ('greenhouse', '溫室花房'),
     'decor': (('deco-flowerpot', '花盆'), ('deco-wateringcan', '澆花壺'))},
    {'id': 'hacker', 'gender': 'female', 'label': '駭客',
     'room': ('cyber', '賽博空間'),
     'decor': (('deco-server', '伺服器機櫃'), ('deco-hologram', '全像投影'))},
    {'id': 'marine', 'gender': 'female', 'label': '海洋學家',
     'room': ('ocean', '海底研究站'),
     'decor': (('deco-aquarium', '水族箱'), ('deco-coral', '珊瑚燈'))},
]

PROTAGONISTS = {s['id']: s['label'] for s in SETS}
ROOMS = {s['room'][0]: s['room'][1] for s in SETS}
DECORATIONS = {d: label for s in SETS for d, label in s['decor']}

# The same states and facings as PS-250C (ps250-characters/catalog.py).
POSES = ['idle', 'work', 'celebrate', 'rest', 'walk', 'inspect']
FACINGS = ['left', 'right']

V2 = 'assets/personal-space/v2'
# Beside the PS-250C sprites, so assetManifest.js resolves both with one rule.
PROTAGONIST_DIR = f'{V2}/characters/toon/protagonist'


def protagonist_path(spec_id, pose, facing):
    return f'{PROTAGONIST_DIR}/{spec_id}-{pose}-{facing}.webp'


assert len(SETS) >= 10
assert sum(s['gender'] == 'male' for s in SETS) == sum(s['gender'] == 'female' for s in SETS)
assert len({s['id'] for s in SETS}) == len(SETS)
assert len(ROOMS) == len(SETS) and len(DECORATIONS) == 2 * len(SETS)

# PS-260C: the free spot each decoration stands in (ps244-blender/decor_sets.py):
# 'back' against the back wall under the photo frame (drawn at z 21, behind the
# desk and the shelf), 'front' on the floor by the window (z 32, in front of
# the plant and the chair, below the characters). Each set has one of each.
DECOR_SPOTS = {
    'deco-rocket': 'back', 'deco-planet': 'front',
    'deco-katana': 'back', 'deco-bonsai': 'front',
    'deco-hatstand': 'back', 'deco-typewriter': 'front',
    'deco-cake': 'back', 'deco-bread': 'front',
    'deco-fern': 'back', 'deco-lantern': 'front',
    'deco-potions': 'back', 'deco-crystal': 'front',
    'deco-mic': 'back', 'deco-heartlamp': 'front',
    'deco-flowerpot': 'back', 'deco-wateringcan': 'front',
    'deco-server': 'back', 'deco-hologram': 'front',
    'deco-aquarium': 'back', 'deco-coral': 'front',
}
DECOR_Z = {'back': 21, 'front': 32}
assert set(DECOR_SPOTS) == set(DECORATIONS)
assert all(sorted(DECOR_SPOTS[d] for d, _ in s['decor']) == ['back', 'front'] for s in SETS)

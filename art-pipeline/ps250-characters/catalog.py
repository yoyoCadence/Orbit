"""The PS-250C character set: ids, labels and the states each one is drawn in.

Pure Python, so both the Blender renderer and the Pillow post-process read
the same lists. `pwa/js/personalSpace/v2/content/characterCatalog.js` mirrors
it for the app (tests/unit/ps250cCharacterCatalog.test.js keeps them in sync
through outputs.json).
"""

PROTAGONISTS = {
    'office': '上班族',
    'hoodie': '帽 T',
    'sweater': '毛衣長髮',
    'sporty': '運動馬尾',
    'scientist': '科學家',
    'artist': '畫家',
}
# The six protagonist states the runtime draws (assetManifest.js).
POSES = ['idle', 'work', 'celebrate', 'rest', 'walk', 'inspect']
FACINGS = ['left', 'right']

COMPANIONS = {
    'orbit': 'Orbit',
    'catbot': '貓型機器人',
    'owl': '貓頭鷹',
    'cube': '方塊無人機',
    'jelly': '果凍',
    'fox': '狐狸',
}
# The six Companion states the runtime draws ('idle' is drawn as 'observe').
STATES = ['observe', 'approach', 'congratulate', 'rest', 'work', 'remind']

V2 = 'assets/personal-space/v2'
PROTAGONIST_DIR = f'{V2}/characters/toon/protagonist'
COMPANION_DIR = f'{V2}/characters/toon/companion'


def protagonist_path(spec_id, pose, facing):
    return f'{PROTAGONIST_DIR}/{spec_id}-{pose}-{facing}.webp'


def companion_path(kind, state):
    return f'{COMPANION_DIR}/{kind}-{state}.webp'

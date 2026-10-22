"""PS-250E2: shared paths and the outputs record for the room styles.

Every style uses the PS-244 scene, camera and lights; only the materials
change (scene.ROOM_STYLES). Its props are cut to the default style's trim
boxes of the same lighting, so all styles share one set of placements
(assetManifest.js PROP_DEFINITIONS). The default style keeps its PS-244 and
PS-250D paths; the others live under workspace/styles/<style>/ (Q style)
and workspace/pixel/styles/<style>/ (pixel).
"""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUTPUTS = os.path.join(HERE, 'outputs.json')
PREVIEWS = os.path.join(HERE, 'previews')
V2 = 'assets/personal-space/v2'


def suffix(lighting):
    return '-night' if lighting == 'night' else ''


def background_path(style, lighting, pixel=False):
    ext = 'png' if pixel else 'webp'
    return f"{V2}/workspace/{'pixel/' if pixel else ''}styles/{style}/background{suffix(lighting)}.{ext}"


def prop_path(style, prop_id, lighting, pixel=False):
    return f"{V2}/workspace/{'pixel/' if pixel else ''}styles/{style}/props/{prop_id}{suffix(lighting)}.png"


def scene_folder(style, lighting):
    """The ps250-pixel render folder: scene, scene-night, scene-<style>[-night]."""
    parts = ['scene'] + ([style] if style != 'default' else []) + ([lighting] if lighting != 'day' else [])
    return '-'.join(parts)


def record(files, clipped=None):
    """Adds {path: bytes} to outputs.json with sizes and SHA-256, keeping the rest."""
    try:
        with open(OUTPUTS, encoding='utf-8') as fh:
            data = json.load(fh)
    except FileNotFoundError:
        data = {'schemaVersion': 1, 'taskId': 'PS-250E2', 'files': {}, 'clipped': {}}
    for path, blob in files.items():
        data['files'][path] = {'bytes': len(blob), 'sha256': hashlib.sha256(blob).hexdigest()}
    data.setdefault('clipped', {})
    for path, count in (clipped or {}).items():
        data['clipped'][path] = count
    data['files'] = dict(sorted(data['files'].items()))
    data['clipped'] = dict(sorted(data['clipped'].items()))
    with open(OUTPUTS, 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write('\n')

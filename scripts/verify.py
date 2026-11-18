from pathlib import Path
import hashlib, json, re, sys
root=Path(__file__).resolve().parent.parent
manifest=json.loads((root/'manifest.json').read_text())
errors=[]
for entry in manifest['files']:
    path=root/entry['file']
    if not path.is_file(): errors.append('Missing '+entry['file']);continue
    if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:errors.append('Changed '+entry['file'])
for path in (root/'thoughtleap-studios/source').rglob('*'):
    if path.suffix not in ('.js','.jsx','.mjs') or 'node_modules' in path.parts or 'dist' in path.parts:continue
    if path.name=='vite.config.mjs':continue
    for rel in re.findall(r"(?:from|import)\s*['\"](\.[^'\"]+)['\"]",path.read_text()):
        if not (path.parent/rel).is_file():errors.append('Unresolved import '+str(path.relative_to(root))+': '+rel)
preset=json.loads((root/'thoughtleap-studios/presets/live-studios.json').read_text())['settings']
if preset['doubleBevel'] is not False:errors.append('Extra bevel enabled')
if preset['faceColor'].lower()!='#a7afb7':errors.append('Production material changed')
if preset['reflectionScale']!=3.2:errors.append('Production reflection changed')
print(json.dumps({'files_checked':len(manifest['files']),'errors':errors},indent=2))
sys.exit(bool(errors))

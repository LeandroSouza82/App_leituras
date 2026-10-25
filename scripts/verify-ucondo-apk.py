"""Local artifact checks; prints no environment values or credentials."""
from pathlib import Path
import base64
import hashlib
import json
import re
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
apk = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'artifacts/FastLeituras-1.1.0-UCONDO-ATUALIZACAO.apk'
env = {}
for line in (root / '.env').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        env[key.strip()] = value.strip().strip('\'"')
assert env['VITE_SUPABASE_URL'].rstrip('/') == 'https://yotzutmarcpuckiqgnpf.supabase.co'
key = env['VITE_SUPABASE_ANON_KEY']
if not key.startswith('sb_publishable_'):
    role = json.loads(base64.urlsafe_b64decode(key.split('.')[1] + '==='))['role']
    assert role == 'anon', 'Client key is not public.'
with zipfile.ZipFile(apk) as archive:
    names = archive.namelist()
    assert not any(re.search(r'(?:^|/)(?:\.env(?:\.[^/]*)?|key\.properties|worker\.env|[^/]+\.keystore)$', name) for name in names)
    for name in names:
        if name.startswith('assets/public/') and name.endswith(('.js', '.json')):
            text = archive.read(name).decode('utf-8')
            assert not re.search(r'\bsb_secret_[A-Za-z0-9_-]{20,}', text), 'Secret key found in client bundle.'
            for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', text):
                try:
                    claims = json.loads(base64.urlsafe_b64decode(token.split('.')[1] + '==='))
                except (ValueError, json.JSONDecodeError):
                    continue
                assert claims.get('role') != 'service_role', 'Administrative JWT found in client bundle.'
digest = hashlib.sha256(apk.read_bytes()).hexdigest()
(apk.parent / 'SHA256.txt').write_text(digest + '  ' + apk.name + '\n', encoding='utf-8')
print('PASS: correct backend, public client key, no private configuration files or administrative keys in APK.')
print('SHA256:', digest)

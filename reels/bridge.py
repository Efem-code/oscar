"""Talk to the Puppy Log bridge from the Mac (same key the phones use).

The Mac writes its changes as its own "device" file, log-claude-YYYY-MM.json,
so the phones merge them like edits from a third phone (newest wins).
"""
import json, os, re, subprocess, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'bridge', 'Code.local.gs')).read()
KEY = re.search(r"^const SECRET = '([^']+)'", SRC, re.M).group(1)
CONN = json.loads(__import__('base64').urlsafe_b64decode(open(os.path.join(HERE, '..', 'bridge', 'connection.local.txt')).read().strip() + '=='))
URL = CONN['u']
DRIVE = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-efemphotography@gmail.com/My Drive/Oscar ')
DEV = 'claude'


def call(action, **kw):
    body = json.dumps({'key': KEY, 'action': action, **kw}).encode()
    req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req, timeout=300) as r:
        j = json.loads(r.read())
    if not j.get('ok'):
        raise RuntimeError(j.get('error'))
    return j


def records():
    """Every record, merged newest-wins across all phones' files."""
    out, files = {}, call('pull', seen={}, skip='zzz')['files']
    for f in files:
        for r in json.loads(f['text']).get('recs', []):
            c = out.get(r['id'])
            if not c or (r['updated'], r['dev']) > (c['updated'], c['dev']):
                out[r['id']] = r
    return out, files


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def save(changed):
    """Write changed records into this Mac's own file, keeping what it wrote before."""
    if not changed:
        return 0
    month = now_iso()[:7]
    name = f'log-{DEV}-{month}.json'
    _, files = records()
    mine = next((f for f in files if f['name'] == name), None)
    keep = {r['id']: r for r in (json.loads(mine['text'])['recs'] if mine else [])}
    for r in changed:
        r = dict(r, updated=now_iso(), dev=DEV, by='Claude')
        keep[r['id']] = r
    call('write', name=name, text=json.dumps({'v': 1, 'dev': DEV, 'by': 'Claude', 'shard': month, 'recs': list(keep.values())}), id=mine['id'] if mine else None)
    return len(changed)


def drive_id(path):
    try:
        v = subprocess.run(['xattr', '-p', 'com.google.drivefs.item-id#S', path], capture_output=True, text=True).stdout.strip()
        return v or None
    except Exception:
        return None


def local_media():
    """{drive id: local path} for everything in Photos & Videos."""
    root = os.path.join(DRIVE, 'Photos & Videos')
    out = {}
    for d in sorted(os.listdir(root)):
        for n in os.listdir(os.path.join(root, d)):
            p = os.path.join(root, d, n)
            i = drive_id(p)
            if i:
                out[i] = p
    return out

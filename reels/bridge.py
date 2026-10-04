"""Talk to the Puppy Log bridge from the Mac (same key the phones use).

The Mac writes its changes as its own "device" file, log-claude-YYYY-MM.json,
so the phones merge them like edits from a third phone (newest wins).
"""
import json, os, re, subprocess, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'bridge', 'Code.local.gs')).read()
KEY = re.search(r"^const SECRET = '([^']+)'", SRC, re.M).group(1)
MAC = (re.search(r"^const MAC_SECRET = '([^']+)'", SRC, re.M) or [None, None])[1]
CONN = json.loads(__import__('base64').urlsafe_b64decode(open(os.path.join(HERE, '..', 'bridge', 'connection.local.txt')).read().strip() + '=='))
URL = CONN['u']
DRIVE = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-efemphotography@gmail.com/My Drive/Oscar ')
DEV = 'claude'


try:                       # background jobs (launchd) don't see the terminal's certificate settings
    import certifi, ssl
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL = None


def call(action, **kw):
    body = json.dumps({'key': KEY, 'action': action, **kw}).encode()
    req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req, timeout=300, context=_SSL) as r:
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


# ---- direct Drive access for the Mac (short-lived token from the bridge) ----
# macOS won't let background jobs read the Google Drive folder, so the evening
# reel job fetches files from Drive itself instead.
_tok = {'t': None, 'at': 0}
CACHE = os.path.join(HERE, 'cache')


def token():
    import time
    if not _tok['t'] or time.time() - _tok['at'] > 2400:
        _tok['t'], _tok['at'] = call('token', mac=MAC)['token'], time.time()
    return _tok['t']


def download(file_id, ext=''):
    """Cached local copy of a Drive file."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, file_id + ext)
    if os.path.exists(path) and os.path.getsize(path):
        return path
    req = urllib.request.Request(f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&supportsAllDrives=true',
                                 headers={'Authorization': 'Bearer ' + token()})
    tmp = path + '.part'
    with urllib.request.urlopen(req, timeout=600, context=_SSL) as r, open(tmp, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b)
    os.replace(tmp, path)
    return path


def upload(path, name, mime, role, ym=None):
    """Upload a local file into the Oscar folder (role 'reel' → Reels, 'thumb' → app data). Returns its Drive id."""
    size = os.path.getsize(path)
    s = call('upStart', name=name, mime=mime, size=size, role=role, ym=ym)['session']
    with open(path, 'rb') as f:
        req = urllib.request.Request(s, data=f.read(), method='PUT', headers={'Content-Type': mime})
    with urllib.request.urlopen(req, timeout=600, context=_SSL) as r:
        return json.loads(r.read())['id']


def prune_cache(days=10):
    import time
    if not os.path.isdir(CACHE):
        return
    for n in os.listdir(CACHE):
        p = os.path.join(CACHE, n)
        if time.time() - os.path.getmtime(p) > days * 86400:
            os.remove(p)

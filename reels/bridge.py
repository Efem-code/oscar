"""Talk to the Puppy Log bridge from the Mac (same key the phones use).

The Mac writes its changes as its own "device" file, log-claude-YYYY-MM.json,
so the phones merge them like edits from a third phone (newest wins).
"""
import json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, '..', 'bridge', 'Code.local.gs')).read()
KEY = re.search(r"^const SECRET = '([^']+)'", SRC, re.M).group(1)
MAC = (re.search(r"^const MAC_SECRET = '([^']+)'", SRC, re.M) or [None, None])[1]
CONN = json.loads(__import__('base64').urlsafe_b64decode(open(os.path.join(HERE, '..', 'bridge', 'connection.local.txt')).read().strip() + '=='))
URL = CONN['u']
FOLDER = re.search(r"^const FOLDER_ID = '([^']+)'", SRC, re.M).group(1)
DRIVE = os.path.expanduser('~/Library/CloudStorage/GoogleDrive-efemphotography@gmail.com/My Drive/Oscar ')
DEV = 'claude'


try:                       # background jobs (launchd) don't see the terminal's certificate settings
    import certifi, ssl
    _SSL = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    _SSL = None


def call(action, **kw):
    """One bridge request. Apps Script sometimes answers with an error page or a
    404 for a minute or two, so it's retried with growing pauses (~4 min in all)."""
    import time
    body = json.dumps({'key': KEY, 'action': action, **kw}).encode()
    for attempt in range(7):
        try:
            req = urllib.request.Request(URL, data=body, headers={'Content-Type': 'text/plain;charset=utf-8'})
            with urllib.request.urlopen(req, timeout=300, context=_SSL) as r:
                j = json.loads(r.read())
            break
        except (ValueError, OSError) as e:
            if attempt == 6:
                raise
            time.sleep(min(5 * 2 ** attempt, 60))
    if not j.get('ok'):
        raise RuntimeError(j.get('error'))
    return j


def records():
    """Every record, merged newest-wins across all phones' files. A file that
    can't be read is skipped (like the phones do) and flagged 'bad'."""
    out, files = {}, call('pull', seen={}, skip='zzz')['files']
    for f in files:
        try:
            recs = json.loads(f['text']).get('recs', [])
        except (TypeError, ValueError):
            f['bad'] = True
            print(f"warning: {f['name']} can't be read — skipped", file=sys.stderr, flush=True)
            continue
        for r in recs:
            c = out.get(r['id'])
            if not c or (r['updated'], r['dev']) > (c['updated'], c['dev']):
                out[r['id']] = r
    return out, files


def now_iso():
    return datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def save(changed):
    """Write changed records into this Mac's own file, keeping what it wrote before.

    Every write is read back from Drive: on 2026-10-05 a 30 KB write landed as
    an empty file. A write that doesn't match is repeated, and a file that is
    already unreadable is rebuilt from its last good version first, so the
    records in it are never thrown away."""
    import fcntl
    if not changed:
        return 0
    os.makedirs(CACHE, exist_ok=True)
    with open(os.path.join(CACHE, 'save.lock'), 'w') as lock:      # one Mac job at a time: read, merge, write
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _save(changed)


def _save(changed):
    import time
    month = now_iso()[:7]
    name = f'log-{DEV}-{month}.json'
    _, files = records()
    mine = next((f for f in files if f['name'] == name), None)
    old = (last_good(mine['id']) if mine.get('bad') else json.loads(mine['text'])['recs']) if mine else []
    keep = {r['id']: r for r in old}
    for r in changed:
        r = dict(r, updated=now_iso(), dev=DEV, by='Claude')
        keep[r['id']] = r
    text = json.dumps({'v': 1, 'dev': DEV, 'by': 'Claude', 'shard': month, 'recs': list(keep.values())})
    fid = mine['id'] if mine else None
    for attempt in range(3):
        fid = call('write', name=name, text=text, id=fid)['id']
        time.sleep(2)
        if drive_get(f'files/{fid}?alt=media') == text.encode():
            return len(changed)
        print(f'warning: {name} did not save cleanly — writing it again', file=sys.stderr, flush=True)
    raise RuntimeError(f'{name} would not save — check Drive')


def last_good(file_id):
    """Records from the newest version of a file that still reads as JSON."""
    revs = json.loads(drive_get(f'files/{file_id}/revisions?fields=revisions(id,size)&pageSize=200'))['revisions']
    for rev in reversed(revs):
        if int(rev.get('size') or 0) > 0:
            try:
                recs = json.loads(drive_get(f"files/{file_id}/revisions/{rev['id']}?alt=media"))['recs']
            except (ValueError, KeyError):
                continue
            print(f'recovered {len(recs)} records from an earlier version of the file', file=sys.stderr, flush=True)
            return recs
    raise RuntimeError("the Mac's sync file is unreadable and has no good earlier version — not writing over it")


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
    """A short-lived Drive token from the bridge, reused for 40 min — kept on disk
    too, so the every-2-minute request check doesn't ask the bridge each time."""
    import time
    path = os.path.join(CACHE, 'token.json')
    if not _tok['t'] or time.time() - _tok['at'] > 2400:
        try:
            with open(path) as f:
                t = json.load(f)
            if time.time() - t['at'] < 2400:
                _tok.update(t)
        except (OSError, ValueError, KeyError):
            pass
    if not _tok['t'] or time.time() - _tok['at'] > 2400:
        _tok['t'], _tok['at'] = call('token', mac=MAC)['token'], time.time()
        os.makedirs(CACHE, exist_ok=True)
        with open(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), 'w') as f:
            json.dump(_tok, f)
    return _tok['t']


def drive_get(path):
    """GET from the Drive API (path after /drive/v3/) as bytes."""
    req = urllib.request.Request('https://www.googleapis.com/drive/v3/' + path, headers={'Authorization': 'Bearer ' + token()})
    with urllib.request.urlopen(req, timeout=120, context=_SSL) as r:
        return r.read()


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


def head(file_id, ext='', n=1 << 20):
    """The first n bytes of a Drive file as a temp file — a video's dates sit at the start."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{file_id}.head{ext}')
    req = urllib.request.Request(f'https://www.googleapis.com/drive/v3/files/{file_id}?alt=media&supportsAllDrives=true',
                                 headers={'Authorization': 'Bearer ' + token(), 'Range': f'bytes=0-{n - 1}'})
    with urllib.request.urlopen(req, timeout=120, context=_SSL) as r, open(path, 'wb') as f:
        f.write(r.read())
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

"""Make reels from shots picked in the app (Photos → 🎬 Reels → ＋ Make your own).

The phone saves a `reelreq` record: media ids in the order they were tapped, a
style (all / meme / countdown / story) and optional opening text. This runs
every 2 minutes (install_requests.sh → LaunchAgent com.efem.oscar-requests).
Most runs are one small Drive query — "has a phone's sync file changed since
the last look?" — and only then are the records read and the reel made, the
same way as the twice-weekly reel (make_funny.py). The request is then marked
done (or failed, with a reason the app shows) and both phones are notified.

    python3 reel_requests.py          # what the schedule runs
    python3 reel_requests.py --force  # read the records even if nothing changed
"""
import json, os, sys, time
from urllib.parse import urlencode

import bridge

STATE = os.path.join(bridge.CACHE, 'requests-state.json')
FULL_EVERY = 1800          # read the records at least every 30 min, whatever Drive says


def load():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def store(state):
    os.makedirs(bridge.CACHE, exist_ok=True)
    with open(STATE, 'w') as f:
        json.dump(state, f)


def phone_changes(state):
    """Newest modified time among the phones' sync files changed since the last look ('' if none)."""
    if not state.get('sync'):
        q = f"'{bridge.FOLDER}' in parents and name contains '_app data' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        state['sync'] = json.loads(bridge.drive_get('files?' + urlencode({'q': q, 'fields': 'files(id)'})))['files'][0]['id']
    q = f"'{state['sync']}' in parents and name contains 'log-' and modifiedTime > '{state.get('since') or '2000-01-01T00:00:00Z'}' and trashed = false"
    files = json.loads(bridge.drive_get('files?' + urlencode({'q': q, 'fields': 'files(name,modifiedTime)', 'pageSize': 100})))['files']
    return max((f['modifiedTime'] for f in files if not f['name'].startswith(f'log-{bridge.DEV}-')), default='')


def make(req, recs):
    import make_funny as F
    import make_reel as R
    log = R.log
    ids = [i for i in req.get('items') or [] if i in recs and not recs[i].get('deleted') and recs[i].get('driveId')]
    log(f"request {req['id']} from {req.get('author') or req.get('by')}: {len(ids)} shots, {req.get('style')}, title {req.get('title')!r}")
    try:
        xs = [x for x in (F.analyse(recs[i], min_dur=1.0) for i in ids) if x]
        if len(xs) < 2:
            raise RuntimeError('Not enough of those shots could be opened on the Mac — try picking a few more.')
        f = R.day_facts(R.local_day(req['at']), recs)
        options = F.from_picks(xs, recs, req.get('style') or 'all', req.get('title'), F.hook_index(recs, req['at'][:10]), f['breed'])

        def still_wanted():                       # not cancelled in the app while this was being made
            r = bridge.records()[0].get(req['id'])
            return bool(r and not r.get('deleted') and r.get('status') == 'pending')

        made = F.publish(options, f, recs, f"pick-{req['id']}", bridge.now_iso(), R.local_day(req['at']),
                         extra={'picked': True, 'request': req['id']}, still_wanted=still_wanted)
        if made is None:
            log('  cancelled in the app — removed what was made')
            return
        bridge.save([dict(req, status='done', reels=made, error='')])
        log('  done', made)
        try:
            bridge.call('notify', title=f"🎬 Your {f['name']} reel is ready" + (f' — {len(made)} options' if len(made) > 1 else ''),
                        body='Watch it in Photos → Reels', tag='reel', url='./#memories')
        except Exception as e:
            log('  notification not sent:', e)
    except Exception as e:
        log('  failed:', e)
        bridge.save([dict(req, status='failed', error=str(e)[:200] or 'Something went wrong on the Mac.')])


def main():
    state = load()
    newest = phone_changes(state)
    if not (newest or '--force' in sys.argv or time.time() - state.get('full', 0) > FULL_EVERY):
        return
    recs, _ = bridge.records()
    state['full'] = time.time()
    todo = sorted((r for r in recs.values() if r.get('kind') == 'reelreq' and not r.get('deleted') and r.get('status') == 'pending'),
                  key=lambda r: r['at'])
    for req in todo:
        make(req, recs)
    if newest:
        state['since'] = newest               # only once handled, so a crash means another look next time
    store(state)


if __name__ == '__main__':
    main()

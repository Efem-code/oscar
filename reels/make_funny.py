"""Twice-a-week funny reel: the best chaos since the last one, edited like a meme.

Runs Wednesday and Sunday at 8 pm (install_schedule.sh). Same brand look as
Oscar's Diary (colours, corner tag, paw end card) but a comedy structure:
a meme hook in big type → fast cuts with punch-in zooms on the action and
joke labels from what was logged → the punchline: it ends on a nap.

    python3 make_funny.py            # since the last funny reel (up to 4 days)
    python3 make_funny.py --preview  # render into reels/out only
    python3 make_funny.py --dry      # show the plan
"""
import os, random, shutil, sys, tempfile
from datetime import datetime, timedelta

import bridge
import make_reel as R
from make_reel import TZ, W, H, FPS, FFMPEG, log, run, local_day, probe, motion, best_window

CLIP, PHOTO, TARGET = 1.7, 1.1, 17.0

HOOKS = [   # (big line, second line, caption opener)
    ('NOBODY:', 'OSCAR:', 'Nobody asked for this energy. Oscar delivered anyway 😂'),
    ('MY JINDO WHEN', 'SOMEONE SAYS “WALK”', 'Say the W word and watch what happens 😂'),
    ('THINGS OSCAR DID', 'INSTEAD OF LISTENING', 'He knows “sit”. He just has other priorities 😂'),
    ('RATE THE CHAOS', '1 – 10', 'Another week of pure Jindo chaos 😂'),
    ('EXPECTATION VS REALITY', 'OWNING A JINDO', 'We expected a dignified Jindo. We got Oscar 😂'),
    ('POV: YOUR JINDO', 'HAS A NEW HOBBY', 'Today’s hobby: whatever this is 😂'),
    ('THIS WEEK ON', 'THE OSCAR SHOW', 'Previously on The Oscar Show… 😂'),
]

JOKES = {
    'walk': ['where are we going and why', 'the walk (supervised by squirrels)'],
    'sleep': ['battery: 0%', 'do not disturb'],
    'meal': ['food critic mode', 'chef, a word'],
    'play': ['zoomies activated', 'unhinged'],
    'train': ['selective hearing', 'I know “sit”, I just choose not to'],
    'accident': ['oops', 'no comment'],
    'wake': ['back online', 'who woke me'],
}


def joke(rec, recs, used):
    """A joke label from the user's caption or what was logged ~20 min around the clip."""
    if rec.get('caption') and len(rec['caption']) <= 28:
        return rec['caption'].lower()
    t = datetime.fromisoformat(rec['at'].replace('Z', '+00:00'))
    best, gap = None, 20 * 60
    for r in recs.values():
        if r.get('deleted') or r.get('kind') not in ('log', 'train', 'lesson'):
            continue
        k = 'train' if r['kind'] in ('train', 'lesson') else r.get('type')
        if k not in JOKES or not r.get('at'):
            continue
        try:
            d = abs((datetime.fromisoformat(r['at'].replace('Z', '+00:00')) - t).total_seconds())
        except ValueError:
            continue
        if d < gap:
            best, gap = k, d
    if not best:
        return None
    options = [j for j in JOKES[best] if j not in used]
    return options[0] if options else None          # never repeat a joke in one reel


def window(recs, today):
    """Days since the last funny reel (at most 4, at least 2)."""
    last = max((r['at'][:10] for r in recs.values() if r.get('kind') == 'reel' and r.get('funny') and not r.get('deleted')), default=None)
    start = (datetime.fromisoformat(last) + timedelta(days=1)).date() if last else today - timedelta(days=3)
    start = max(start, today - timedelta(days=3))
    return [(start + timedelta(days=i)).isoformat() for i in range((today - start).days + 1)]


def plan(days, recs):
    local = {}
    media = [r for r in recs.values() if r.get('kind') == 'media' and not r.get('deleted') and not r.get('doc')
             and not r.get('noReel') and r.get('driveId') and local_day(r['at']) in days]
    for r in media:
        try:
            local[r['driveId']] = bridge.download(r['driveId'], os.path.splitext(r.get('name') or '')[1].lower())
        except Exception as e:
            log('could not fetch', r.get('name'), e)
    vids = [r for r in media if r.get('video') and r['driveId'] in local]
    pics = [r for r in media if not r.get('video') and r['driveId'] in local]
    if len(vids) < 2:
        return None, f'only {len(vids)} videos since the last funny reel — comedy needs movement'
    items = []
    for r in vids:
        p = local[r['driveId']]; info = probe(p)
        if info['dur'] < 1.2:
            continue
        L = min(CLIP, info['dur'] - 0.2)
        start, score = best_window(motion(p, info['dur']), info['dur'], L)
        items.append({'rec': r, 'path': p, 'video': True, 'start': start, 'len': L, 'score': score + (8 if r.get('star') else 0), 'audio': info['audio']})
    naps = []
    for r in pics:
        lab = joke(r, recs, set())
        it = {'rec': r, 'path': local[r['driveId']], 'video': False, 'len': PHOTO, 'score': 6 if r.get('star') else 0}
        (naps if lab in JOKES['sleep'] else items).append(it)
    vids_sorted = sorted([x for x in items if x['video']], key=lambda x: -x['score'])
    pics_sorted = sorted([x for x in items if not x['video']], key=lambda x: -x['score'])
    # Chaos first: liveliest clips, a few photos for breathers, then the nap punchline.
    chosen, total = [], 0.0
    for x in vids_sorted[:6] + pics_sorted[:3]:
        if total >= TARGET - 2:
            break
        chosen.append(x); total += x['len']
    hook, middle = chosen[0], chosen[1:]
    random.seed(days[-1]); random.shuffle(middle)
    # Punchline: a real nap shot gets "battery: 0%"; otherwise a closing beat.
    ending = naps[:1] or [x for x in pics_sorted if x not in chosen][:1]
    for x in ending:
        x['len'] = 1.8; x['label'] = 'battery: 0%' if naps else 'and scene.'
    return [hook] + middle + ending, None


def punch_in(x, out):
    """Every other clip snaps in 12% — the comedy zoom."""
    base = out + '.flat.mp4'
    R.render_segment(x, base)
    run([FFMPEG, '-y', '-v', 'error', '-i', base, '-vf', f'crop=iw/1.12:ih/1.12,scale={W}:{H},setsar=1', '-c:v', 'libx264',
         '-preset', 'veryfast', '-crf', '19', '-c:a', 'copy', out])


def main():
    dry, preview = '--dry' in sys.argv, '--preview' in sys.argv
    today = datetime.now(TZ).date()
    if not dry and not preview:
        try:
            import backfill_thumbs; backfill_thumbs.main()
        except Exception as e:
            log('preview backfill skipped:', e)
    recs, _ = bridge.records()
    days = window(recs, today)
    log('funny reel from', days[0], 'to', days[-1])
    items, why = plan(days, recs)
    if not items:
        log('skipping:', why); return
    used = set()
    for x in items[1:]:
        if not x.get('label'):
            x['label'] = joke(x['rec'], recs, used)
            if x['label']: used.add(x['label'])
    n_funny = sum(1 for r in recs.values() if r.get('kind') == 'reel' and r.get('funny') and not r.get('deleted'))
    top, bottom, opener = HOOKS[n_funny % len(HOOKS)]
    log('hook:', top, '/', bottom, '|', len(items), 'clips:', ', '.join(f"{'V' if x['video'] else 'P'}{x['len']:.1f}" + (f"[{x['label']}]" if x.get('label') else '') for x in items))
    f = R.day_facts(days[-1], recs)
    random.seed('cta' + days[-1])
    cap = '\n'.join([
        opener,
        random.choice(['Rate the chaos 1–10 👇', 'Send this to someone with a dramatic dog 🐾', 'Which clip got you? 👇', 'Tag someone who needs a Jindo in their life 🐶']),
        f"More of {f['name']} every week — follow {R.HANDLE} 🐾",
    ])
    tags = '#jindo #koreanjindo #funnydogs #dogsofinstagram #jindosofinstagram #puppylife #dogmemes #jindopuppy'
    if dry:
        print(cap + '\n\n' + tags); return

    # Render: reuse the Diary renderer, with punch-ins on alternate clips.
    orig = R.render_segment
    flip = {'n': 0}
    def seg(x, out):
        flip['n'] += 1
        (punch_in if x['video'] and flip['n'] % 2 == 0 else orig)(x, out)
    R.render_segment = seg
    try:
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', f'funny {days[-1]}.mp4') if preview else os.path.join(tempfile.gettempdir(), f'oscar-funny-{days[-1]}.mp4')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        total = R.render(items, [top, bottom], out, badge=(top, bottom), tag=f"{f['name'].upper()}'S DIARY", name=f['name'],
                         signoff='new episodes every week', sub=120)
    finally:
        R.render_segment = orig
    if preview:
        log(f'preview: {total:.1f} s → {out}'); print(cap + '\n\n' + tags); return

    rid = f'reel-funny-{days[-1]}'
    old = recs.get(rid, {})
    thumb = out + '.jpg'
    run([FFMPEG, '-y', '-v', 'error', '-ss', '1.0', '-i', out, '-frames:v', '1', '-vf', 'scale=360:-2', thumb])
    vid = bridge.upload(out, f'{days[-1]} {f["name"]} funny reel.mp4', 'video/mp4', 'reel')
    tid = bridge.upload(thumb, f'reel-thumb-funny-{days[-1]}.jpg', 'image/jpeg', 'thumb')
    for g in (old.get('driveId'), old.get('thumbId')):
        if g and g not in (vid, tid):
            try: bridge.call('trash', id=g)
            except Exception: pass
    rec = dict(old, id=rid, kind='reel', funny=True, at=f'{days[-1]}T19:00:00.000Z', title=f'{top} {bottom}',
               caption=cap, tags=tags, duration=round(total, 1), clips=len(items), driveId=vid, thumbId=tid, posted=old.get('posted', False))
    rec.setdefault('created', bridge.now_iso()); rec.setdefault('shard', days[-1][:7]); rec.setdefault('author', 'Claude')
    bridge.save([rec])
    if not old.get('driveId') and '--no-notify' not in sys.argv:
        try:
            bridge.call('notify', title=f"😂 This week’s funny {f['name']} reel is ready", body=f"{round(total)} s · {top.title()} {bottom.lower()}", tag='reel', url='./#memories')
        except Exception as e:
            log('notification not sent:', e)
    log('done')


if __name__ == '__main__':
    main()

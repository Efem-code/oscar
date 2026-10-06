"""Twice-a-week funny reel: the best chaos since the last one, edited like a meme.

Runs Wednesday and Sunday at 8 pm (install_schedule.sh). Same brand look as
Oscar's Diary (colours, corner tag, paw end card) but a comedy structure:
a meme hook in big type → fast cuts with punch-in zooms on the action and
joke labels from what was logged → the punchline: it ends on a nap.

    python3 make_funny.py            # since the last funny reel (up to 4 days)
    python3 make_funny.py --preview  # render into reels/out only
    python3 make_funny.py --dry      # show the plan
    python3 make_funny.py --day=2026-10-05   # rebuild that day's options
"""
import os, random, shutil, sys, tempfile
from datetime import date, datetime, timedelta

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
    best, gap, sleeping = None, 20 * 60, asleep(rec, recs)
    for r in recs.values():
        if r.get('deleted') or r.get('kind') not in ('log', 'train', 'lesson'):
            continue
        k = 'train' if r['kind'] in ('train', 'lesson') else r.get('type')
        if k not in JOKES or not r.get('at') or (k == 'sleep' and not sleeping):     # nap jokes only on a sleeping Oscar
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


def _t(iso):
    return datetime.fromisoformat(iso.replace('Z', '+00:00'))


def asleep(rec, recs):
    """Taken while Oscar was logged asleep: after a sleep log and before the next wake.
    A Nap tapped within 3 min of Awake is a slip of the finger, not a nap, and a
    daytime nap with no Awake logged only counts for 2½ h."""
    ev = []
    for at, kind in sorted((r['at'], r['type']) for r in recs.values() if r.get('kind') == 'log' and not r.get('deleted')
                           and r.get('type') in ('sleep', 'wake') and r.get('at')):
        if kind == 'sleep' and ev and ev[-1][1] == 'wake' and (_t(at) - _t(ev[-1][0])).total_seconds() < 180:
            continue
        ev.append((at, kind))
    last = max((e for e in ev if e[0] <= rec['at']), default=None)
    if not last or last[1] != 'sleep':
        return False
    start = _t(last[0]).astimezone(TZ)
    return (_t(rec['at']) - _t(last[0])).total_seconds() < (2.5 if 7 <= start.hour < 19 else 10) * 3600


def window(recs, today):
    """Days since the last funny reel (at most 4, at least 2)."""
    # Reels made today don't count — re-running on the same day rebuilds them.
    last = max((r['at'][:10] for r in recs.values() if r.get('kind') == 'reel' and r.get('funny') and not r.get('deleted')
                and r['at'][:10] < today.isoformat()), default=None)
    start = (datetime.fromisoformat(last) + timedelta(days=1)).date() if last else today - timedelta(days=3)
    start = max(start, today - timedelta(days=3))
    return [(start + timedelta(days=i)).isoformat() for i in range((today - start).days + 1)]


def analyse(r, min_dur=1.2):
    """Fetch one photo or video and measure it (videos: how much moves, second by second)."""
    try:
        p = bridge.download(r['driveId'], os.path.splitext(r.get('name') or '')[1].lower())
    except Exception as e:
        log('could not fetch', r.get('name'), e); return None
    if not r.get('video'):
        return {'rec': r, 'path': p, 'score': 6 if r.get('star') else 0}
    info = probe(p)
    if info['dur'] < min_dur:
        return None
    vals = motion(p, info['dur'])
    return {'rec': r, 'path': p, 'info': info, 'vals': vals, 'energy': (sum(vals) / len(vals) if vals else 0) + (8 if r.get('star') else 0)}


def candidates(days, recs):
    """Fetch and analyse the window's media once; every option is built from this."""
    media = [r for r in recs.values() if r.get('kind') == 'media' and not r.get('deleted') and not r.get('doc')
             and not r.get('noReel') and r.get('driveId') and local_day(r['at']) in days]
    vids, pics, naps = [], [], []
    for r in media:
        x = analyse(r)
        if x:
            (naps if asleep(r, recs) else vids if r.get('video') else pics).append(x)
    vids.sort(key=lambda v: -v['energy']); pics.sort(key=lambda x: -x['score'])
    naps.sort(key=lambda x: (not x['rec'].get('video'), x['rec']['at']))     # a sleeping video beats a photo
    return vids, pics, naps


def spread(xs, n):
    """The best n of xs (best-first), taken a day at a time — so every day gets
    a turn instead of the liveliest day filling the whole reel."""
    days = {}
    for x in xs:
        days.setdefault(local_day(x['rec']['at']), []).append(x)
    out, queues = [], list(days.values())
    while len(out) < n and any(queues):
        for q in queues:
            if q and len(out) < n:
                out.append(q.pop(0))
    return out


def unused(xs, taken):
    ids = {x['rec']['id'] for x in taken}
    return [x for x in xs if x['rec']['id'] not in ids]


def nap_end(naps, length, label):
    """The punchline shot: Oscar asleep, as a clip or a photo."""
    return [dict(clip(x, length) if x['rec'].get('video') else photo(x, length), label=label) for x in naps[:1]]


def clip(v, length):
    L = min(length, v['info']['dur'] - 0.2)
    start, score = best_window(v['vals'], v['info']['dur'], L)
    return {'rec': v['rec'], 'path': v['path'], 'video': True, 'start': start, 'len': L, 'score': score, 'audio': v['info']['audio']}


def photo(x, length, label=None):
    return {'rec': x['rec'], 'path': x['path'], 'video': False, 'len': length, 'score': x['score'], 'label': label}


def shot(x, vlen, plen, label=None):
    return dict(clip(x, vlen) if x['rec'].get('video') else photo(x, plen), label=label)


def add_jokes(items, recs, used):
    for x in items:
        x['label'] = joke(x['rec'], recs, used)
        if x['label']: used.add(x['label'])


def story_labels(items, recs):
    prev = None
    for x in items:
        x['label'] = R.clip_label(x['rec'], recs)
        if x['label'] == R.LABELS['sleep'] and not asleep(x['rec'], recs):
            x['label'] = None
        if x['label'] == prev: x['label'] = None                 # don't say "dinner" twice in a row
        else: prev = x['label']


def option_meme(vids, pics, naps, recs, k):
    top, bottom, opener = HOOKS[k % len(HOOKS)]
    vs, ps = spread(vids, 5), spread(pics, 4)
    items = [clip(v, CLIP) for v in vs] + [photo(x, PHOTO) for x in ps]
    hook, middle = items[0], items[1:]
    random.seed(k); random.shuffle(middle)
    end = nap_end(naps, 1.8, 'battery: 0%') or [photo(x, 1.8, 'and scene.') for x in unused(pics, ps)[:1]]
    add_jokes(middle, recs, {x['label'] for x in end})
    return {'key': 'A', 'style': 'Meme', 'badge': (top, bottom), 'items': [hook] + middle + end, 'opener': opener, 'punch': True}


def option_countdown(vids, pics, naps, recs, k):
    vs = sorted(spread(vids, 3), key=lambda v: v['energy'])        # least wild first; the wildest clip is #1
    ps = spread(pics, 2)
    if not vs or len(vs) + len(ps) < 3:
        return None
    top, items = vs.pop(), []
    while vs or ps:                                                  # clips and photos take turns
        if vs: items.append(clip(vs.pop(0), 2.0))
        if ps: items.append(photo(ps.pop(0), 1.6))
    items.append(clip(top, 2.0))
    n = len(items)
    for i, x in enumerate(items):
        x['label'] = f'#{n - i}'
    return {'key': 'B', 'style': 'Countdown', 'badge': (f"OSCAR'S TOP {n}", 'CHAOS MOMENTS'), 'items': items,
            'opener': f'Ranking this week’s top {n} chaos moments. #1 had no business being that dramatic 😂', 'punch': True}


def option_story(vids, pics, naps, recs, k, breed):
    vs, ps = spread(vids, 4), spread(pics, 4)
    pool = [clip(v, 2.4) for v in vs] + [photo(x, 1.6) for x in ps]
    pool.sort(key=lambda x: x['rec']['at'])                          # tell it in the order it happened
    story_labels(pool, recs)
    end = nap_end(naps, 2.0, 'worth it') or [photo(x, 2.0, 'worth it') for x in unused(pics, ps)[:1]]
    return {'key': 'C', 'style': 'Story', 'badge': ('POV: YOU ADOPTED', f'A {breed.upper()}'), 'items': pool + end,
            'opener': f'Nobody warned us how much personality fits in one {breed} 🐾', 'punch': False}


def split_title(t):
    """Opening text typed in the app → the two lines of the title stamp.
    'Oscar vs the vacuum' → ('OSCAR VS', 'THE VACUUM'); a '/' splits it there."""
    t = ' '.join((t or '').upper().split())
    if not t:
        return None
    if '/' in t:
        a, b = (x.strip() for x in t.split('/', 1))
        return (a, b)
    w = t.split()
    if len(t) <= 14 or len(w) < 2:
        return (t, '')
    i = min(range(1, len(w)), key=lambda i: abs(len(' '.join(w[:i])) - len(' '.join(w[i:]))))
    return (' '.join(w[:i]), ' '.join(w[i:]))


def from_picks(xs, recs, style, title, k, breed):
    """Options from shots picked in the app, played in the order they were tapped."""
    scale = min(1.0, 24.0 / sum(1.7 if x['rec'].get('video') else 1.2 for x in xs))     # long picks stay under ~25 s
    badge, opts = split_title(title), []
    if style in ('all', 'meme'):
        top, bottom, opener = HOOKS[k % len(HOOKS)]
        items = [shot(x, max(1.0, CLIP * scale), max(0.9, PHOTO * scale)) for x in xs]
        items[-1]['label'] = 'battery: 0%' if asleep(xs[-1]['rec'], recs) else 'and scene.'
        add_jokes(items[1:-1], recs, {items[-1]['label']})
        opts.append({'key': 'A', 'style': 'Meme', 'badge': badge or (top, bottom), 'items': items, 'opener': opener, 'punch': True})
    if style in ('all', 'countdown'):
        n = min(len(xs), 10)
        items = [shot(x, max(1.2, 2.0 * scale), max(1.0, 1.6 * scale), f'#{n - i}') for i, x in enumerate(xs[:n])]
        opts.append({'key': 'B', 'style': 'Countdown', 'badge': badge or (f"OSCAR'S TOP {n}", 'CHAOS MOMENTS'), 'items': items,
                     'opener': f'Ranking the top {n} chaos moments. #1 had no business being that dramatic 😂', 'punch': True})
    if style in ('all', 'story'):
        items = [shot(x, max(1.2, 2.4 * scale), max(1.0, 1.6 * scale)) for x in xs]
        story_labels(items, recs)
        if asleep(xs[-1]['rec'], recs):
            items[-1]['label'] = 'worth it'
        opts.append({'key': 'C', 'style': 'Story', 'badge': badge or ('POV: YOU ADOPTED', f'A {breed.upper()}'), 'items': items,
                     'opener': f'Nobody warned us how much personality fits in one {breed} 🐾', 'punch': False})
    return opts


def punch_in(x, out):
    """Every other clip snaps in 12% — the comedy zoom."""
    base = out + '.flat.mp4'
    R.render_segment(x, base)
    run([FFMPEG, '-y', '-v', 'error', '-i', base, '-vf', f'crop=iw/1.12:ih/1.12,scale={W}:{H},setsar=1', '-c:v', 'libx264',
         '-preset', 'veryfast', '-crf', '19', '-c:a', 'copy', out])


TAGS = '#jindo #koreanjindo #funnydogs #dogsofinstagram #jindosofinstagram #puppylife #dogmemes #jindopuppy'
CTAS = ['Rate the chaos 1–10 👇', 'Send this to someone with a dramatic dog 🐾', 'Which clip got you? 👇', 'Tag someone who needs a Jindo in their life 🐶']


def publish(options, f, recs, group, at, label, dry=False, preview=False, extra=None, still_wanted=None):
    """Render each option, put it in Drive → Reels with a thumbnail and save its
    record. Returns the reel ids (local paths with --preview), or None if
    still_wanted() said no after the uploads (those files go to the trash)."""
    random.seed('cta' + group)
    single, made, saved = len(options) == 1, [], []
    for o in options:
        cap = '\n'.join([o['opener'], random.choice(CTAS), f"More of {f['name']} every week — follow {R.HANDLE} 🐾"])
        log(f"option {o['key']} ({o['style']}): {' / '.join(o['badge'])} | " + ', '.join(f"{'V' if x['video'] else 'P'}{x['len']:.1f}" + (f"[{x['label']}]" if x.get('label') else '') for x in o['items']))
        if dry:
            continue
        orig, flip = R.render_segment, {'n': 0}
        def seg(x, out, o=o):
            flip['n'] += 1
            (punch_in if o['punch'] and x['video'] and flip['n'] % 2 == 0 else orig)(x, out)
        R.render_segment = seg
        try:
            out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', f"{group} {o['key']}.mp4") if preview else os.path.join(tempfile.gettempdir(), f"oscar-{group}-{o['key']}.mp4")
            os.makedirs(os.path.dirname(out), exist_ok=True)
            total = R.render(o['items'], list(o['badge']), out, badge=o['badge'], tag=f"{f['name'].upper()}'S DIARY", name=f['name'],
                             signoff='new episodes every week', sub=120 if o['key'] != 'C' else 96)
        finally:
            R.render_segment = orig
        log(f"  rendered {total:.1f} s")
        if preview:
            made.append(out); continue
        rid = f"reel-{group}-{o['key'].lower()}"
        old = recs.get(rid, {})
        if old.get('deleted'):                                         # a removed option: start a fresh record
            old = {}
        thumb = out + '.jpg'
        run([FFMPEG, '-y', '-v', 'error', '-ss', '1.0', '-i', out, '-frames:v', '1', '-vf', 'scale=360:-2', thumb])
        vid = bridge.upload(out, f"{label} {f['name']} reel{'' if single else ' option ' + o['key']}.mp4", 'video/mp4', 'reel')
        tid = bridge.upload(thumb, f"reel-thumb-{group}-{o['key']}.jpg", 'image/jpeg', 'thumb')
        if still_wanted and not still_wanted():                       # cancelled in the app meanwhile: undo this run
            for g in [vid, tid] + [g for x in saved for g in (x['driveId'], x['thumbId'])]:
                try: bridge.call('trash', id=g)
                except Exception: pass
            if saved:
                bridge.save([dict(x, deleted=True) for x in saved])
            return None
        for g in (old.get('driveId'), old.get('thumbId')):
            if g and g not in (vid, tid):
                try: bridge.call('trash', id=g)
                except Exception: pass
        rec = dict(old, id=rid, kind='reel', funny=True, group=group, option=None if single else o['key'], style=o['style'], at=at,
                   title=f"{o['style'] if single else 'Option ' + o['key'] + ' · ' + o['style']} — {' '.join(o['badge']).strip()}",
                   caption=cap, tags=TAGS, duration=round(total, 1), clips=len(o['items']), driveId=vid, thumbId=tid, posted=old.get('posted', False))
        rec.update(extra or {})
        rec.setdefault('created', bridge.now_iso()); rec.setdefault('shard', at[:7]); rec.setdefault('author', 'Claude')
        bridge.save([rec])
        made.append(rid); saved.append(rec)
    return made


def main():
    dry, preview = '--dry' in sys.argv, '--preview' in sys.argv
    day = next((a.split('=', 1)[1] for a in sys.argv if a.startswith('--day=')), None)
    today = date.fromisoformat(day) if day else datetime.now(TZ).date()
    if not dry and not preview:
        try:
            import backfill_thumbs; backfill_thumbs.main()
        except Exception as e:
            log('preview backfill skipped:', e)
    recs, _ = bridge.records()
    days = window(recs, today)
    log('funny reel options from', days[0], 'to', days[-1])
    vids, pics, naps = candidates(days, recs)
    if len(vids) < 2:
        log(f'skipping: only {len(vids)} videos since the last funny reel — comedy needs movement'); return
    f = R.day_facts(days[-1], recs)
    k = hook_index(recs, days[-1])
    options = [o for o in (option_meme(vids, pics, naps, recs, k), option_countdown(vids, pics, naps, recs, k),
                           option_story(vids, pics, naps, recs, k, f['breed'])) if o]
    made = publish(options, f, recs, f'funny-{days[-1]}', f'{days[-1]}T19:00:00.000Z', days[-1], dry=dry, preview=preview)
    if made and not dry and not preview and '--no-notify' not in sys.argv:
        try:
            bridge.call('notify', title=f"😂 {len(made)} options for this week’s {f['name']} reel", body='Pick your favourite in Photos → Reels', tag='reel', url='./#memories')
        except Exception as e:
            log('notification not sent:', e)
    log('done', made)


def hook_index(recs, before):
    """How many funny reels came before — rotates the meme hooks."""
    return len({r.get('group') or r['id'] for r in recs.values() if r.get('kind') == 'reel' and r.get('funny') and not r.get('deleted') and r['at'][:10] < before})


if __name__ == '__main__':
    main()

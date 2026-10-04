"""Make tonight's Instagram reel from the day's photos and videos of Oscar.

Runs on the Mac at 8 pm (see install_schedule.sh). Reads the media straight
from the Google Drive for desktop folder, edits a 15–20 s vertical reel with
ffmpeg, saves it to Drive → Reels, and adds it to the app (Photos → Reels)
with a ready-to-paste caption. Posting stays a tap on the phone.

The edit follows what performs on Reels: the most active moment first (the
hook), fast 1.5–2.5 s cuts, 9:16 1080×1920, a short title in the first
seconds, original sound kept so a trending audio can go on top in Instagram,
and no reel at all on a thin day — a few good reels a week beat daily filler.

    python3 make_reel.py              # today
    python3 make_reel.py 2026-10-02   # a given day
    python3 make_reel.py --dry        # plan only, no render or upload
"""
import json, os, random, re, shutil, struct, subprocess, sys, tempfile, time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import bridge
from capture_time import capture_time

TZ = ZoneInfo('America/Los_Angeles')
FFMPEG = shutil.which('ffmpeg') or '/usr/local/bin/ffmpeg'
FFPROBE = shutil.which('ffprobe') or '/usr/local/bin/ffprobe'
FONT = '/System/Library/Fonts/Supplemental/Arial Black.ttf'
W, H, FPS = 1080, 1920, 30
TARGET = (15.0, 20.0)                 # seconds
CLIP, PHOTO = 2.4, 1.5                # seconds per video cut / photo
HANDLE = '@kpuposcar'
TAGS = '#koreanjindo #jindo #jindodog #jindosofinstagram #jindopuppy #puppiesofinstagram #puppylife #dogsofinstagram #newpuppy #puppytraining'
REELS = os.path.join(bridge.DRIVE, 'Reels')
THUMBS = os.path.join(bridge.DRIVE, "_app data (don't edit)")


def log(*a):
    print(datetime.now().strftime('%H:%M:%S'), *a, flush=True)


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode:
        raise RuntimeError(f'{os.path.basename(cmd[0])} failed: {r.stderr[-600:]}')
    return r


# ---------- reading the day ----------

def local_day(iso):
    return datetime.fromisoformat(iso.replace('Z', '+00:00')).astimezone(TZ).date().isoformat()


def probe(path):
    j = json.loads(run([FFPROBE, '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', path]).stdout)
    v = next((s for s in j['streams'] if s['codec_type'] == 'video'), {})
    return {'dur': float(j['format'].get('duration') or 0), 'audio': any(s['codec_type'] == 'audio' for s in j['streams']),
            'w': int(v.get('width') or 0), 'h': int(v.get('height') or 0)}


def motion(path, dur):
    """Average frame-to-frame change, 6 samples a second, over the first minute."""
    vf = 'fps=6,scale=96:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-'
    # Hardware decode, first 40 s only: phone videos are big and this runs on a laptop.
    out = run([FFMPEG, '-v', 'error', '-hwaccel', 'videotoolbox', '-t', str(min(dur, 40)), '-i', path, '-vf', vf, '-an', '-f', 'null', '-']).stdout
    return [float(x) for x in re.findall(r'YAVG=([\d.]+)', out)]


def best_window(vals, dur, length):
    """Start time of the liveliest `length`-second stretch (skipping the shaky first beat)."""
    n = max(1, int(length * 6))
    if len(vals) <= n or dur <= length + 0.6:
        return max(0.0, min(0.3, dur - length)), (sum(vals) / len(vals) if vals else 0)
    best, at = -1, 0
    for i in range(2, len(vals) - n):
        s = sum(vals[i:i + n])
        if s > best:
            best, at = s, i
    return at / 6, best / n


def jpeg_orientation(path):
    with open(path, 'rb') as f:
        d = f.read(128 * 1024)
    i = d.find(b'Exif\x00\x00')
    if i < 0:
        return 1
    t = i + 6
    le = d[t:t + 2] == b'II'
    u16 = lambda o: struct.unpack('<H' if le else '>H', d[t + o:t + o + 2])[0]
    u32 = lambda o: struct.unpack('<I' if le else '>I', d[t + o:t + o + 4])[0]
    ifd = u32(4)
    for k in range(u16(ifd)):
        e = ifd + 2 + 12 * k
        if u16(e) == 0x0112:
            return u16(e + 8)
    return 1


def fetch(path, tries=12):
    """Make sure Drive for desktop has the file on disk. In the background it can
    refuse with EDEADLK ('resource deadlock avoided') while it downloads — retry."""
    for k in range(tries):
        try:
            with open(path, 'rb') as f:
                while f.read(8 << 20):
                    pass
            return True
        except OSError as e:
            log(f'waiting for Drive to fetch {os.path.basename(path)} ({e.strerror})')
            time.sleep(min(30, 3 * (k + 1)))
    return False


def plan_day(day, recs, local):
    """Pick and order tonight's clips. Returns (items, facts) or (None, reason)."""
    media = [r for r in recs.values() if r.get('kind') == 'media' and not r.get('deleted') and not r.get('doc')
             and not r.get('noReel') and r.get('driveId') and local_day(r['at']) == day]
    for r in media:                                   # fetch from Drive (cached for re-runs)
        try:
            local[r['driveId']] = bridge.download(r['driveId'], os.path.splitext(r.get('name') or '')[1].lower())
        except Exception as e:
            log('could not fetch', r.get('name'), e)
    media = [r for r in media if r['driveId'] in local]
    vids = [r for r in media if r.get('video')]
    pics = [r for r in media if not r.get('video')]
    if not ((len(media) >= 3 and vids) or len(pics) >= 5):
        return None, f'only {len(vids)} videos and {len(pics)} photos — not enough for a good reel'

    items = []
    for r in vids:
        p = local[r['driveId']]
        info = probe(p)
        if info['dur'] < 1.2:
            continue
        length = min(CLIP, info['dur'] - 0.2)
        start, score = best_window(motion(p, info['dur']), info['dur'], length)
        items.append({'rec': r, 'path': p, 'video': True, 'start': start, 'len': length, 'score': score + (8 if r.get('star') else 0), 'audio': info['audio']})
    for r in pics:
        items.append({'rec': r, 'path': local[r['driveId']], 'video': False, 'len': PHOTO, 'score': (6 if r.get('star') else 0) + (2 if r.get('portrait') else 0)})

    # Hook: the liveliest (or starred) video; then fill to ~18 s by score; then tell the day in order.
    items.sort(key=lambda x: -x['score'])
    hook = next((x for x in items if x['video']), items[0])
    chosen, total = [hook], hook['len']
    for x in items:
        if x is hook or total >= TARGET[1] - 1:
            continue
        chosen.append(x)
        total += x['len']
    if total < 8:
        return None, f'only {total:.0f} s of usable footage'
    rest = sorted(chosen[1:], key=lambda x: x['rec']['at'])
    return [hook] + rest, None


def day_facts(day, recs):
    p = recs.get('profile', {})
    home = p.get('homeDay')
    n = (datetime.fromisoformat(day) - datetime.fromisoformat(home)).days + 1 if home else None
    logs = [r for r in recs.values() if r.get('kind') == 'log' and not r.get('deleted') and local_day(r['at']) == day]
    c = lambda t: sum(1 for r in logs if r.get('type') == t)
    ms = [r['title'] for r in recs.values() if r.get('kind') == 'milestone' and not r.get('deleted') and local_day(r['at']) == day]
    lessons = [r for r in recs.values() if r.get('kind') == 'lesson' and r.get('due') == day and not r.get('deleted')]
    classes = [recs.get(l['classId'], {}).get('name') for l in lessons]
    breed = p.get('breed') or 'puppy'
    return {'name': p.get('name') or 'Oscar', 'n': n, 'breed': 'Korean Jindo' if 'jindo' in breed.lower() else breed,
            'walks': c('walk'), 'accidents': c('accident'), 'logged': len(logs), 'milestones': ms, 'classes': [x for x in classes if x]}


def hook_text(f, day):
    """Two short lines for the first seconds. Milestones beat everything."""
    random.seed(day)
    if f['milestones']:
        return [f['milestones'][0][:26], f"Day {f['n']} with a {f['breed']}" if f['n'] else '']
    if f['n'] and f['n'] <= 60:
        return random.choice([[f"Day {f['n']} with", f"a {f['breed']} puppy"], [f"Raising a {f['breed']}", f"day {f['n']}"], [f"POV: day {f['n']}", f"with {f['name']}"]])
    return random.choice([[f"Just {f['name']}", 'being a Jindo'], [f"A day with", f"{f['name']}"]])


def caption(f):
    bits = []
    if f['milestones']:
        bits.append(f['milestones'][0] + ' 🎉')
    if f['classes']:
        bits.append(f"{f['classes'][0]} today 🎓")
    if f['walks']:
        bits.append(f"{f['walks']} walk{'s' if f['walks'] > 1 else ''} 🦮")
    if f['logged'] and not f['accidents']:
        bits.append('zero accidents 🙌')
    head = f"Day {f['n']} home with {f['name']} 🐾" if f['n'] else f"A day with {f['name']} 🐾"
    lines = [head]
    if bits:
        lines.append(' · '.join(bits).capitalize())
    lines.append(f"Follow along as our {f['breed']} grows up!")
    return '\n'.join(lines)


# ---------- rendering ----------

COVER = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1'


def upright(path, out):
    """A plain JPEG turned the way the phone shows it (EXIF/HEIC rotation applied)."""
    from PIL import Image, ImageOps
    try:
        import pillow_heif
        pillow_heif.register_heif_opener()
    except ImportError:
        pass
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    im.thumbnail((2160, 2160))
    im.save(out, quality=92)
    return out


def render_segment(x, out):
    d = f"{x['len']:.2f}"
    common = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', str(FPS),
              '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-shortest', out]
    if x['video']:
        inputs = ['-ss', f"{x['start']:.2f}", '-t', d, '-i', x['path']]
        if not x['audio']:
            inputs += ['-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=48000:cl=stereo']
        amap = ['-map', '0:v', '-map', '0:a' if x['audio'] else '1:a']
        run([FFMPEG, '-y', '-v', 'error', *inputs, '-vf', f'{COVER},fps={FPS}', *amap, *common])
    else:
        src = upright(x['path'], out + '.jpg')
        frames = int(x['len'] * FPS)
        zoom = f"{COVER},scale={W * 2}:{H * 2},zoompan=z='min(zoom+0.0016,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s={W}x{H}:fps={FPS}"
        run([FFMPEG, '-y', '-v', 'error', '-i', src, '-f', 'lavfi', '-t', d, '-i', 'anullsrc=r=48000:cl=stereo',
             '-filter_complex', f'[0:v]{zoom},trim=duration={d}[v]', '-map', '[v]', '-map', '1:a', *common])


def text_png(lines, path, size, y_frac, alpha=255):
    """Title text as a transparent 1080×1920 PNG (this ffmpeg build has no drawtext)."""
    from PIL import Image, ImageDraw, ImageFont
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, size)
    y = int(H * y_frac)
    for line in [l for l in lines if l]:
        while d.textlength(line, font=font) > W - 120 and size > 40:      # shrink long lines to fit
            size -= 4; font = ImageFont.truetype(FONT, size)
        w = d.textlength(line, font=font)
        d.text(((W - w) / 2, y), line, font=font, fill=(255, 255, 255, alpha), stroke_width=max(4, size // 12), stroke_fill=(0, 0, 0, 150))
        y += int(size * 1.25)
    img.save(path)


def render(items, lines, out):
    tmp = tempfile.mkdtemp(prefix='oscar-reel-')
    try:
        parts = []
        for i, x in enumerate(items):
            p = os.path.join(tmp, f'{i:02d}.mp4')
            render_segment(x, p)
            parts.append(p)
        lst = os.path.join(tmp, 'list.txt')
        open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
        total = sum(x['len'] for x in items)
        hook_end = items[0]['len'] + 0.1
        title, handle = os.path.join(tmp, 'title.png'), os.path.join(tmp, 'handle.png')
        text_png(lines, title, 80, 0.13)
        text_png([HANDLE], handle, 48, 0.82, alpha=235)
        fc = (f"[0:v][1:v]overlay=0:0:enable='lt(t,{hook_end:.2f})'[a];"
              f"[a][2:v]overlay=0:0:enable='gt(t,{total - 1.6:.2f})',format=yuv420p[v]")
        run([FFMPEG, '-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-i', title, '-i', handle,
             '-filter_complex', fc, '-map', '[v]', '-map', '0:a', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
             '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '6M', '-bufsize', '12M',
             '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', out])
        return total
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def wait_for_id(path, minutes=15):
    """Drive for desktop gives a file its Drive id once it has uploaded."""
    end = time.time() + minutes * 60
    while time.time() < end:
        i = bridge.drive_id(path)
        if i and not i.startswith('local'):
            return i
        time.sleep(10)
    return None


# ---------- main ----------

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    dry = '--dry' in sys.argv
    preview = '--preview' in sys.argv          # render into reels/out only — no Drive, no app
    day = args[0] if args else datetime.now(TZ).date().isoformat()
    log('reel for', day)
    recs, _ = bridge.records()
    local = {}
    bridge.prune_cache()
    items, why = plan_day(day, recs, local)
    if not items:
        log('skipping:', why)
        return
    f = day_facts(day, recs)
    lines, cap = hook_text(f, day), caption(f)
    log('hook:', ' / '.join(l for l in lines if l), '|', len(items), 'clips:',
        ', '.join(f"{'V' if x['video'] else 'P'}{x['len']:.1f}s" for x in items))
    if dry:
        print(cap + '\n\n' + TAGS)
        return
    tmp_out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', f'{day} reel.mp4') if preview else os.path.join(tempfile.gettempdir(), f'oscar-reel-{day}.mp4')
    os.makedirs(os.path.dirname(tmp_out), exist_ok=True)
    total = render(items, lines, tmp_out)
    if preview:
        log(f'preview: {total:.1f} s → {tmp_out}')
        print(cap + '\n\n' + TAGS)
        return
    old = recs.get(f'reel-{day}', {})
    thumb = tmp_out + '.jpg'
    run([FFMPEG, '-y', '-v', 'error', '-ss', '1.0', '-i', tmp_out, '-frames:v', '1', '-vf', 'scale=360:-2', thumb])
    log(f'rendered {total:.1f} s; uploading…')
    vid = bridge.upload(tmp_out, f'{day} {f["name"]} reel.mp4', 'video/mp4', 'reel')
    tid = bridge.upload(thumb, f'reel-thumb-{day}.jpg', 'image/jpeg', 'thumb')
    for gone in (old.get('driveId'), old.get('thumbId')):          # replace an earlier version of tonight's reel
        if gone and gone not in (vid, tid):
            try: bridge.call('trash', id=gone)
            except Exception: pass
    rec = dict(old, id=f'reel-{day}', kind='reel', at=f'{day}T19:00:00.000Z',
               title=' '.join(l for l in lines if l), caption=cap, tags=TAGS, duration=round(total, 1), clips=len(items),
               driveId=vid, thumbId=tid, posted=old.get('posted', False))
    rec.setdefault('created', bridge.now_iso()); rec.setdefault('shard', day[:7]); rec.setdefault('author', 'Claude')
    bridge.save([rec])
    if '--no-notify' in sys.argv or old.get('driveId'):         # a re-make of tonight's reel: no second buzz
        log('done (no notification)'); return
    try:
        bridge.call('notify', title=f"🎬 {f['name']}’s reel for today is ready", body=f"{round(total)} s · tap to watch and post", tag='reel', url='./#memories')
    except Exception as e:
        log('notification not sent:', e)
    log('done')


if __name__ == '__main__':
    main()

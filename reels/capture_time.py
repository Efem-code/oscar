"""When a photo or video was actually taken, read from the file itself.

JPEG: EXIF DateTimeOriginal (local time, as the camera wrote it).
MP4/MOV: Apple's 'creationdate' tag when present (iPhone — the real filming
time), else the 'mvhd' creation time (seconds since 1904, UTC). A video picked
on an iPhone is re-exported for upload, so its mvhd says the upload moment.
Pure stdlib, so it runs anywhere without installs.
"""
import re, struct
from datetime import datetime, timezone, timedelta


def jpeg_time(path):
    """EXIF DateTimeOriginal from a JPEG or HEIC (HEIC may keep EXIF near the end)."""
    with open(path, 'rb') as f:
        data = f.read()                              # HEIC can keep EXIF mid-file
    i = data.find(b'Exif\x00\x00')
    if i < 0:
        return None
    t = i + 6
    le = data[t:t + 2] == b'II'
    u16 = lambda o: struct.unpack('<H' if le else '>H', data[t + o:t + o + 2])[0]
    u32 = lambda o: struct.unpack('<I' if le else '>I', data[t + o:t + o + 4])[0]

    def find(ifd, tag):
        n = u16(ifd)
        for k in range(n):
            e = ifd + 2 + 12 * k
            if u16(e) == tag:
                return e
        return None

    ifd0 = u32(4)
    exif = find(ifd0, 0x8769)
    for ifd, tag in ((u32(exif + 8), 0x9003) if exif else (None, None), (ifd0, 0x0132)):
        if ifd is None:
            continue
        e = find(ifd, tag)
        if e:
            s = data[t + u32(e + 8): t + u32(e + 8) + 19].decode('ascii', 'ignore')
            try:
                return datetime.strptime(s, '%Y:%m:%d %H:%M:%S')   # naive = local camera time
            except ValueError:
                pass
    return None


def _kids(b, start, end):
    """{box type: (start, end)} for the boxes laid end to end in b[start:end]."""
    out, p = {}, start
    while p + 8 <= end:
        size, kind = struct.unpack('>I4s', b[p:p + 8])
        if size < 8:
            break
        out.setdefault(kind, (p, min(p + size, end)))
        p += size
    return out


def apple_date(moov):
    """Apple's com.apple.quicktime.creationdate (moov › meta › keys + ilst), as UTC."""
    meta = _kids(moov, 8, len(moov)).get(b'meta')
    if not meta:
        return None
    k = _kids(moov, meta[0] + (8 if moov[meta[0] + 12:meta[0] + 16] == b'hdlr' else 12), meta[1])
    if b'keys' not in k or b'ilst' not in k:
        return None
    p, idx = k[b'keys'][0] + 16, None
    for i in range(1, struct.unpack('>I', moov[k[b'keys'][0] + 12:k[b'keys'][0] + 16])[0] + 1):
        size = struct.unpack('>I', moov[p:p + 4])[0]
        if size < 8:
            return None
        if moov[p + 8:p + size] == b'com.apple.quicktime.creationdate':
            idx = i
            break
        p += size
    p, end = k[b'ilst'][0] + 8, k[b'ilst'][1]
    while idx and p + 8 <= end:                     # each item's box type is its key number
        size, num = struct.unpack('>II', moov[p:p + 8])
        if size < 8:
            break
        if num == idx:                              # → 'data' box: size, 'data', type, locale, value
            dsize = struct.unpack('>I', moov[p + 8:p + 12])[0]
            m = re.match(rb'(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)([+-])(\d\d):?(\d\d)', moov[p + 24:p + 8 + dsize])
            if not m:
                return None
            y, mo, d, h, mi, sec = (int(x) for x in m.groups()[:6])
            off = timedelta(hours=int(m[8]), minutes=int(m[9])) * (-1 if m[7] == b'-' else 1)
            return datetime(y, mo, d, h, mi, sec, tzinfo=timezone(off)).astimezone(timezone.utc)
        p += size
    return None


def mp4_time(path):
    with open(path, 'rb') as f:
        f.seek(0, 2)
        end = f.tell()
        pos = 0
        while pos + 8 <= end:                       # walk top-level boxes to find moov
            f.seek(pos)
            size, kind = struct.unpack('>I4s', f.read(8))
            if size == 1:
                size = struct.unpack('>Q', f.read(8))[0]
            elif size == 0:
                size = end - pos
            if kind == b'moov':
                f.seek(pos)
                body = f.read(min(size, 8 << 20))
                try:
                    t = apple_date(body)
                except (struct.error, ValueError):
                    t = None
                if t:
                    return t
                i = body.find(b'mvhd')
                if i < 0:
                    return None
                ver = body[i + 4]
                secs = struct.unpack('>Q', body[i + 8:i + 16])[0] if ver == 1 else struct.unpack('>I', body[i + 8:i + 12])[0]
                if secs < 100000000:                # unset (0) or junk
                    return None
                return datetime(1904, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=secs)
            if size < 8:
                return None
            pos += size
    return None


def capture_time(path):
    """A timezone-aware UTC datetime, or None. EXIF times are taken as Pacific local."""
    low = path.lower()
    try:
        if low.endswith(('.jpg', '.jpeg', '.heic', '.heif')):
            t = jpeg_time(path)
            if t:
                from zoneinfo import ZoneInfo
                return t.replace(tzinfo=ZoneInfo('America/Los_Angeles')).astimezone(timezone.utc)
        if low.endswith(('.mp4', '.mov', '.m4v')):
            return mp4_time(path)
    except Exception:
        return None
    return None

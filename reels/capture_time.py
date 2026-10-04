"""When a photo or video was actually taken, read from the file itself.

JPEG: EXIF DateTimeOriginal (local time, as the camera wrote it).
MP4/MOV: the 'mvhd' creation time (seconds since 1904, UTC).
Pure stdlib, so it runs anywhere without installs.
"""
import struct
from datetime import datetime, timezone, timedelta


def jpeg_time(path):
    with open(path, 'rb') as f:
        data = f.read(256 * 1024)
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
                body = f.read(min(size, 1 << 20))
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
        if low.endswith(('.jpg', '.jpeg')):
            t = jpeg_time(path)
            if t:
                from zoneinfo import ZoneInfo
                return t.replace(tzinfo=ZoneInfo('America/Los_Angeles')).astimezone(timezone.utc)
        if low.endswith(('.mp4', '.mov', '.m4v')):
            return mp4_time(path)
    except Exception:
        return None
    return None

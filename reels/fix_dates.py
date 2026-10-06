"""Re-date photos/videos by when they were actually taken (not when uploaded).

Photos are read from this Mac's Google Drive folder. Videos are read straight
from Drive, just their first MB (where the dates are), so nothing big is
downloaded; that also catches iPhone videos, whose filming time is Apple's
'creationdate' tag rather than the upload-time 'mvhd' date.

    python3 fix_dates.py --dry   # list what would change
"""
import os
from datetime import datetime, timezone, timedelta
import bridge
from capture_time import capture_time

recs, _ = bridge.records()
local = bridge.local_media()
now = datetime.now(timezone.utc)
changed, same, unknown, missing = [], 0, 0, 0
for r in recs.values():
    if r.get('kind') != 'media' or r.get('deleted') or not r.get('driveId'):
        continue
    p, t = local.get(r['driveId']), None
    if r.get('video'):
        try:
            h = bridge.head(r['driveId'], os.path.splitext(r.get('name') or '')[1].lower())
            t = capture_time(h)
            os.remove(h)
        except Exception as e:
            print('could not read', r.get('name'), e)
    if not t and not p:
        missing += 1
        continue
    t = t or capture_time(p)
    if not t or t > now + timedelta(hours=1) or t.year < 2020:   # no date, or a nonsense one
        unknown += 1
        continue
    cur = datetime.fromisoformat(r['at'].replace('Z', '+00:00'))
    if abs((cur - t).total_seconds()) > 120:
        changed.append(dict(r, at=t.strftime('%Y-%m-%dT%H:%M:%S.000Z'), takenFrom='file'))
        print(f"{r['name'][:30]:30} {cur.astimezone():%b %d %H:%M} → {t.astimezone():%b %d %H:%M}")
    else:
        same += 1
import sys
if '--dry' not in sys.argv:
    bridge.save(changed)
print(f'fixed {len(changed)}, already right {same}, no date in file {unknown}, not on this Mac {missing}')

"""Make the previews the phones couldn't.

Android's browser can't decode iPhone HEIC photos, and phones often can't
grab a frame from HEVC videos — those items show an empty tile. This makes
a 420 px thumbnail (and, for photos, an 1800 px JPEG view copy so they open
on Android too) and attaches them to the records. Runs before each evening
reel; safe to run any time.
"""
import os, subprocess, sys, tempfile
import bridge

FFMPEG = '/usr/local/bin/ffmpeg'


def jpeg_from_photo(src, out, size):
    from PIL import Image, ImageOps
    import pillow_heif
    pillow_heif.register_heif_opener()
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    im.thumbnail((size, size))
    im.save(out, quality=82)


def jpeg_from_video(src, out, size):
    subprocess.run([FFMPEG, '-y', '-v', 'error', '-ss', '0.5', '-i', src, '-frames:v', '1',
                    '-vf', f"scale='min({size},iw)':-2", out], check=True)


def main(limit=None):
    recs, _ = bridge.records()
    todo = [r for r in recs.values() if r.get('kind') == 'media' and not r.get('deleted') and r.get('driveId')
            and (not r.get('thumbId') or (not r.get('video') and not r.get('viewId') and 'hei' in (r.get('mime') or '')))]
    if limit:
        todo = todo[:limit]
    print(f'{len(todo)} items need previews', flush=True)
    changed = []
    tmp = tempfile.mkdtemp(prefix='oscar-thumbs-')
    for r in todo:
        try:
            src = bridge.download(r['driveId'], os.path.splitext(r.get('name') or '')[1].lower())
            upd = dict(r)
            if not r.get('thumbId'):
                t = os.path.join(tmp, r['id'] + '-t.jpg')
                (jpeg_from_video if r.get('video') else jpeg_from_photo)(src, t, 420)
                upd['thumbId'] = bridge.upload(t, f"thumb-{r['id']}.jpg", 'image/jpeg', 'thumb')
            if not r.get('video') and not r.get('viewId'):
                v = os.path.join(tmp, r['id'] + '-v.jpg')
                jpeg_from_photo(src, v, 1800)
                upd['viewId'] = bridge.upload(v, f"view-{r['id']}.jpg", 'image/jpeg', 'thumb')
            changed.append(upd)
            print('ok', r.get('name'), flush=True)
        except Exception as e:
            print('skip', r.get('name'), e, flush=True)
    bridge.save(changed)
    print(f'added previews for {len(changed)}', flush=True)


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else None)

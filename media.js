/* Photos and videos: make a small thumbnail on the phone, queue the original
   for Drive, and show either one back.

   Thumbnails are separate small files rather than living inside the log, so
   syncing a day of pee logs never re-uploads a month of pictures. */
const Media = (() => {
  const urls = new Map();   // blob key -> object URL, so images don't flicker on re-render

  function canvasBlob(src, w, h, max, q = 0.78) {
    const s = Math.min(1, max / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.round(w * s); c.height = Math.round(h * s);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return new Promise(res => c.toBlob(res, 'image/jpeg', q));
  }

  async function imageThumb(file, max) {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const b = await canvasBlob(bmp, bmp.width, bmp.height, max);
    const dims = { w: bmp.width, h: bmp.height };
    bmp.close && bmp.close();
    return { blob: b, ...dims };
  }

  function videoThumb(file, max) {
    return new Promise(res => {
      const v = document.createElement('video');
      const url = URL.createObjectURL(file);
      let settled = false;
      const finish = out => { if (settled) return; settled = true; URL.revokeObjectURL(url); res(out); };
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
      v.onseeked = async () => finish({
        blob: await canvasBlob(v, v.videoWidth, v.videoHeight, max),
        w: v.videoWidth, h: v.videoHeight, duration: v.duration,
      });
      v.onerror = () => finish({ blob: null });
      setTimeout(() => finish({ blob: null }), 8000);
    });
  }

  const ext = (file) => (file.name && file.name.includes('.')) ? file.name.split('.').pop().toLowerCase()
    : file.type.startsWith('video') ? 'mp4' : 'jpg';
  const stamp = d => {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}`;
  };
  const safe = s => (s || '').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 60);

  /* Capture time from the file itself: JPEG EXIF DateTimeOriginal, or an MP4/MOV
     'mvhd' creation time. Returns a Date, or null when the file doesn't say
     (shared/re-saved files often don't) or says something impossible. */
  async function takenAt(file) {
    try {
      const ok = d => d && d.getFullYear() >= 2015 && d.getTime() < Date.now() + 36e5 ? d : null;
      // JPEG and iPhone HEIC/HEIF both carry an EXIF block ("Exif\\0\\0" + TIFF). In JPEG it's at the
      // start; iPhone HEIC can keep it anywhere (often mid-file), so scan in 1 MB steps until found.
      const isPhoto = /jpe?g|hei[cf]/i.test(file.type) || /\.(jpe?g|hei[cf])$/i.test(file.name || '');
      const exifAt = async () => {
        for (let off = 0; off < file.size; off += 1 << 20) {
          const b = new Uint8Array(await file.slice(off, off + (1 << 20) + 8).arrayBuffer());
          for (let i = 0; i < b.length - 6; i++) if (b[i] === 0x45 && b[i + 1] === 0x78 && b[i + 2] === 0x69 && b[i + 3] === 0x66 && b[i + 4] === 0 && b[i + 5] === 0) return off + i;
          if (/jpe?g/i.test(file.type) && off >= 256 * 1024) return -1;      // JPEG EXIF is always near the start
        }
        return -1;
      };
      const at0 = isPhoto ? await exifAt() : -1;
      for (const part of at0 >= 0 ? [file.slice(Math.max(0, at0 - 2), at0 + 256 * 1024)] : []) {
        const v = new DataView(await part.arrayBuffer());
        for (let i = 2; i < v.byteLength - 10; i++) {
          if (v.getUint32(i) !== 0x45786966 || v.getUint16(i + 4) !== 0) continue;      // "Exif\0\0"
          const t = i + 6, le = v.getUint16(t) === 0x4949;
          const u16 = o => v.getUint16(t + o, le), u32 = o => v.getUint32(t + o, le);
          const find = (ifd, tag) => { const n = u16(ifd); for (let k = 0; k < n; k++) if (u16(ifd + 2 + 12 * k) === tag) return ifd + 2 + 12 * k; return null; };
          const ifd0 = u32(4), ex = find(ifd0, 0x8769);
          for (const [ifd, tag] of [[ex && u32(ex + 8), 0x9003], [ifd0, 0x0132]]) {
            const e = ifd && find(ifd, tag); if (!e) continue;
            let s = ''; for (let k = 0; k < 19; k++) s += String.fromCharCode(v.getUint8(t + u32(e + 8) + k));
            const m = s.match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
            if (m) return ok(new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]));   // camera local time
          }
          break;
        }
      }
      if (/video\//i.test(file.type)) {
        let pos = 0;
        while (pos + 8 <= file.size) {                  // walk the top-level boxes to the moov
          const h = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
          let size = h.getUint32(0); const kind = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
          if (size === 1) size = Number(h.getBigUint64(8)); else if (size === 0) size = file.size - pos;
          if (kind === 'moov') {
            const b = new Uint8Array(await file.slice(pos, pos + Math.min(size, 1 << 20)).arrayBuffer());
            for (let i = 0; i < b.length - 16; i++) if (b[i] === 0x6d && b[i + 1] === 0x76 && b[i + 2] === 0x68 && b[i + 3] === 0x64) {   // mvhd
              const d = new DataView(b.buffer, i); const secs = b[i + 4] === 1 ? Number(d.getBigUint64(8)) : d.getUint32(8);
              return secs > 1e8 ? ok(new Date(Date.UTC(1904, 0, 1) + secs * 1000)) : null;
            }
            return null;
          }
          if (size < 8) return null;
          pos += size;
        }
      }
    } catch {}
    return null;
  }

  /* A content fingerprint: size + a hash of the first and last 64 KB. Cheap even
     for a 100 MB video, and two different shots won't share it. */
  async function fingerprint(file) {
    const parts = [file.slice(0, 65536), file.slice(Math.max(0, file.size - 65536))];
    const buf = await new Blob(parts).arrayBuffer();
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
    return file.size + ':' + [...h.slice(0, 12)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* Is this file already in Photos? Newer records carry a fingerprint; older
     ones are matched by type + exact size, which is just as telling for
     camera files of several MB. */
  function findDuplicate(file, fp) {
    return Store.list('media', r => !r.doc && (r.fp ? r.fp === fp : r.size === file.size && (r.mime || '') === (file.type || r.mime)))[0] || null;
  }

  /* Save one picked/captured file. Returns the new media record, or
     { duplicate: existingRecord } if it's already in Photos. */
  async function add(file, extra = {}) {
    const fp = await fingerprint(file).catch(() => null);
    if (!extra.doc && !extra.portrait) {
      const dup = fp && findDuplicate(file, fp);
      if (dup) return { duplicate: dup };
    }
    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');
    // When it was actually taken: the camera's own timestamp in the file beats the
    // file date, which is often just when it was saved or shared.
    const taken = !extra.fresh && !extra.at ? await takenAt(file) : null;
    const at = extra.at || (taken || new Date(file.lastModified && !extra.fresh ? file.lastModified : Date.now())).toISOString();
    const t = isVideo ? await videoThumb(file, 420) : isImage ? await imageThumb(file, 420).catch(() => ({ blob: null })) : { blob: null };
    const pet = App.pet();
    const d = new Date(at);
    const label = safe(extra.caption) || (extra.portrait ? `Week ${App.weekOf(at) ?? ''} portrait` : pet);
    const name = `${stamp(d)} ${label}.${ext(file)}`;
    const rec = await Store.put({
      kind: 'media', src: Store.dev, at, mime: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      name, size: file.size, w: t.w, h: t.h, duration: t.duration, video: isVideo,
      caption: extra.caption || '', portrait: !!extra.portrait, doc: !!extra.doc, star: !!extra.star, fp,
    });
    if (t.blob) {
      await Store.blobPut('t:' + rec.id, t.blob);
      await Store.pendAdd({ id: 't:' + rec.id, recId: rec.id, role: 'thumb', blob: t.blob, mime: 'image/jpeg', name: `thumb-${rec.id}.jpg` });
    }
    /* A screen-size copy (~300 KB) is what the other phone opens — the
       original can be many MB, and the bridge hands files back slowly. */
    if (isImage) {
      try {
        const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const v = await canvasBlob(bmp, bmp.width, bmp.height, 1800, 0.82);
        await Store.pendAdd({ id: 'v:' + rec.id, recId: rec.id, role: 'view', blob: v, mime: 'image/jpeg', name: `view-${rec.id}.jpg` });
      } catch {}
    }
    /* Keep portraits locally (downsized) — they drive the ghost overlay and the growth grid. */
    if (extra.portrait && !isVideo) {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      await Store.blobPut('p:' + rec.id, await canvasBlob(bmp, bmp.width, bmp.height, 1280, 0.85));
    }
    /* The original waits in the queue until Drive has it, then only Drive keeps it. */
    await Store.pendAdd({ id: 'f:' + rec.id, recId: rec.id, role: 'full', blob: file, mime: rec.mime, name, ym: at.slice(0, 7), doc: !!extra.doc });
    Drive.soon(1500);
    return rec;
  }

  /* URL for a thumbnail: local cache, else fetch once from Drive. */
  async function thumbURL(rec) {
    const key = 't:' + rec.id;
    if (urls.has(key)) return urls.get(key);
    let b = await Store.blobGet(key);
    if (!b && rec.thumbId && Drive.configured()) {
      try { b = await Drive.download(rec.thumbId, null, 'image/jpeg'); await Store.blobPut(key, b); } catch { b = null; }
    }
    if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(key, u); return u;
  }

  /* Big version: the portrait copy, the still-queued original, or Drive. */
  async function fullURL(rec, onProgress) {
    const key = 'full:' + rec.id;
    if (urls.has(key)) return urls.get(key);
    let b = rec.portrait ? await Store.blobGet('p:' + rec.id) : null;
    if (!b) { const p = (await Store.pendAll()).find(x => x.id === 'f:' + rec.id); b = p && p.blob; }
    /* Fetched copies live in memory for this session only — full files stay
       in Drive so the app never fills up the phone. */
    if (!b && (rec.viewId || rec.driveId)) {
      b = rec.viewId ? await Drive.download(rec.viewId, onProgress, 'image/jpeg') : await Drive.download(rec.driveId, onProgress, rec.mime);
    }
    if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(key, u); return u;
  }

  /* Is the full file already on this phone (taken here, still uploading, or a portrait)? */
  async function hasLocal(rec) {
    if (rec.portrait && await Store.blobGet('p:' + rec.id)) return true;
    return (await Store.pendAll()).some(x => x.id === 'f:' + rec.id);
  }

  async function blobFor(rec) {
    const u = await fullURL(rec);
    return u ? (await fetch(u)).blob() : null;
  }

  async function remove(rec) {
    await Store.remove(rec.id);
    for (const k of ['t:', 'p:', 'c:']) await Store.blobDel(k + rec.id);
    for (const k of ['t:', 'v:', 'f:']) await Store.pendDel(k + rec.id);
    if (rec.driveId) Drive.trash(rec.driveId);
    if (rec.thumbId) Drive.trash(rec.thumbId);
    if (rec.viewId) Drive.trash(rec.viewId);
  }

  /* Fill every <img data-thumb="id"> on screen. */
  function hydrate(root = document) {
    root.querySelectorAll('[data-thumb]').forEach(async el => {
      const rec = Store.get(el.dataset.thumb);
      if (!rec) return;
      const u = await thumbURL(rec);
      if (u) { el.style.backgroundImage = `url("${u}")`; el.classList.add('loaded'); }
    });
  }

  /* ---- weekly portrait camera with last week's shot as a ghost ---- */
  async function portraitCamera(onDone) {
    const prev = Store.list('media', r => r.portrait && !r.video)[0];
    const ghost = prev ? await fullURL(prev).catch(() => null) : null;
    const el = document.createElement('div');
    el.className = 'cam';
    el.innerHTML = `
      <video playsinline muted autoplay></video>
      ${ghost ? `<img class="ghost" src="${ghost}" alt="">` : ''}
      <div class="cam-top">
        <button class="cam-x" aria-label="Close">✕</button>
        <div class="cam-tip">${ghost ? 'Line Oscar up with last week’s ghost — same spot, same angle.' : 'First portrait! Pick a spot you can repeat every week.'}</div>
      </div>
      <div class="cam-bar">
        ${ghost ? '<label class="cam-ghost">Ghost <input type="range" min="0" max="80" value="35"></label>' : '<span></span>'}
        <button class="shutter" aria-label="Take portrait"></button>
        <button class="cam-flip" aria-label="Switch camera">🔄</button>
      </div>`;
    document.body.appendChild(el);
    const video = el.querySelector('video');
    let facing = 'environment', stream = null;
    const stop = () => stream && stream.getTracks().forEach(t => t.stop());
    async function start() {
      stop();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false,
        });
        video.srcObject = stream;
      } catch (e) {
        el.querySelector('.cam-tip').textContent = 'Camera unavailable: ' + e.message;
      }
    }
    const close = () => { stop(); el.remove(); };
    el.querySelector('.cam-x').onclick = close;
    el.querySelector('.cam-flip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); };
    const slider = el.querySelector('.cam-ghost input');
    if (slider) slider.oninput = () => { el.querySelector('.ghost').style.opacity = slider.value / 100; };
    el.querySelector('.shutter').onclick = async () => {
      if (!video.videoWidth) return;
      el.classList.add('flash');
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
      close();
      const file = new File([blob], 'portrait.jpg', { type: 'image/jpeg', lastModified: Date.now() });
      onDone(await add(file, { portrait: true, fresh: true }));
    };
    start();
  }

  return { add, thumbURL, fullURL, blobFor, hasLocal, remove, hydrate, portraitCamera };
})();

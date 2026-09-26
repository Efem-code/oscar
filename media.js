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

  /* Save one picked/captured file. Returns the new media record. */
  async function add(file, extra = {}) {
    const isVideo = file.type.startsWith('video');
    const isImage = file.type.startsWith('image');
    const at = extra.at || new Date(file.lastModified && !extra.fresh ? file.lastModified : Date.now()).toISOString();
    const t = isVideo ? await videoThumb(file, 420) : isImage ? await imageThumb(file, 420).catch(() => ({ blob: null })) : { blob: null };
    const pet = App.pet();
    const d = new Date(at);
    const label = safe(extra.caption) || (extra.portrait ? `Week ${App.weekOf(at) ?? ''} portrait` : pet);
    const name = `${stamp(d)} ${label}.${ext(file)}`;
    const rec = await Store.put({
      kind: 'media', src: Store.dev, at, mime: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
      name, size: file.size, w: t.w, h: t.h, duration: t.duration, video: isVideo,
      caption: extra.caption || '', portrait: !!extra.portrait, doc: !!extra.doc, star: !!extra.star,
    });
    if (t.blob) {
      await Store.blobPut('t:' + rec.id, t.blob);
      await Store.pendAdd({ id: 't:' + rec.id, recId: rec.id, role: 'thumb', blob: t.blob, mime: 'image/jpeg', name: `thumb-${rec.id}.jpg` });
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
      try { b = await Drive.download(rec.thumbId); await Store.blobPut(key, b); } catch { b = null; }
    }
    if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(key, u); return u;
  }

  /* Big version: the portrait copy, the still-queued original, or Drive. */
  async function fullURL(rec) {
    const key = 'full:' + rec.id;
    if (urls.has(key)) return urls.get(key);
    let b = rec.portrait ? await Store.blobGet('p:' + rec.id) : null;
    if (!b) { const p = (await Store.pendAll()).find(x => x.id === 'f:' + rec.id); b = p && p.blob; }
    if (!b && rec.driveId) {
      b = await Drive.download(rec.driveId);
      if (rec.portrait && !rec.video) await Store.blobPut('p:' + rec.id, b);
    }
    if (!b) return null;
    const u = URL.createObjectURL(b); urls.set(key, u); return u;
  }

  async function blobFor(rec) {
    const u = await fullURL(rec);
    return u ? (await fetch(u)).blob() : null;
  }

  async function remove(rec) {
    await Store.remove(rec.id);
    for (const k of ['t:', 'p:']) await Store.blobDel(k + rec.id);
    for (const k of ['t:', 'f:']) await Store.pendDel(k + rec.id);
    if (rec.driveId) Drive.trash(rec.driveId);
    if (rec.thumbId) Drive.trash(rec.thumbId);
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

  return { add, thumbURL, fullURL, blobFor, remove, hydrate, portraitCamera };
})();

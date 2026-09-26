# Puppy Log — setup

The app works on its own straight away: everything is saved on the phone.
To share between two phones and keep photos/videos in your Drive folder, you
set up a small **bridge** once. It's a Google Apps Script. There's no Google
Cloud console, and nobody signs in inside the app.

## 1. Deploy the bridge (once, on the Mac, about 5 minutes)

1. Open <https://script.google.com> while signed in to the Google account that
   owns the Oscar folder → **New project**. Name it *Puppy Log bridge*.
2. Delete what's in the editor and paste **all** of `bridge/Code.local.gs`.
   That copy already has your folder ID and a private key filled in. It is
   never uploaded to GitHub. (`bridge/Code.gs` is the blank template.)
3. Click **Save** (💾).
4. **Deploy → New deployment** → the gear next to "Select type" → **Web app**.
   - Execute as: **Me**
   - Who has access: **Anyone**
   → **Deploy**.
5. Google asks for permission → **Authorize access** → pick your account →
   "Google hasn't verified this app" → **Advanced** → **Go to Puppy Log bridge** → **Allow**.
   That warning is normal: it's your own script, running in your own account.
6. Copy the **Web app URL** (ends in `/exec`) and send it to Claude. Claude
   turns it into the connection code.

"Anyone" only means the URL can be *reached*. Every request still needs the
private key, and without it the bridge answers "Wrong key".

## 2. Connect each phone

**More → Sync & sharing** → paste the connection code → **Connect**.
Use the same code on both phones.

Each phone syncs when it opens, every couple of minutes while open, and a few
seconds after anything is logged. Offline logging queues up and syncs later.

## What ends up in the folder

```
Oscar/   (your folder)
  Photos & Videos/2026-10/2026-10-03 1432 Oscar.jpg …
  Vet & Documents/…            invoice and record photos from vet visits
  _app data (don't edit)/      the log files and thumbnails
```

Photos and videos are regular Drive files. Browse, download or share them from
Drive like any album. They count against the storage of the account that
deployed the bridge. Deleting a photo in the app moves it to Drive's trash,
where it can still be recovered.

## Good to know

- **If you change the script**, use Deploy → **Manage deployments** → edit →
  Version: *New version*. That keeps the same URL. "New deployment" gives a new
  URL, and then both phones need a new code.
- **Videos over ~30 MB** upload fine, but open in Drive rather than inside the app.
- **Potty alerts** only fire while the app is open or recently backgrounded.
  A web app can't wake the phone on a timer the way a native app can.
- **Backup:** More → Backup saves every record as one JSON file.

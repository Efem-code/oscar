# Puppy Log — setup

The app works on its own straight away: everything is saved on the phone.
Sharing between two phones and backing up photos/videos needs one Google
setup (about 10 minutes, once).

## 1. Google Cloud (once, on the Mac)

1. Go to <https://console.cloud.google.com> → create a project called **Puppy Log**.
2. **APIs & Services → Library** → search **Google Drive API** → **Enable**.
3. **Google Auth Platform** (formerly "OAuth consent screen") → **Get started**:
   app name *Puppy Log*, your email as support contact, audience **External**.
4. **Audience → Test users** → add **both** Gmail addresses (yours and your partner's).
   Leave the status on **Testing**. You don't need to publish or verify anything.
5. **Clients → Create client** → type **Web application**.
   Under **Authorized JavaScript origins** add:
   - `https://efem-code.github.io`
   - `http://localhost:8793` (only needed to test on the Mac)

   No redirect URIs are needed.
6. Copy the **Client ID** (ends in `.apps.googleusercontent.com`).

When you sign in, Google shows **"Google hasn't verified this app"**. That's
expected for a private Testing-mode app. Tap **Continue**.

## 2. First phone

1. Open the app → **More → Sync & sharing**.
2. Paste the Client ID → **Save** → **Sign in with Google**.
3. **Create Oscar's folder**, then type your partner's Gmail → **Share**.

## 3. Second phone

1. Install the app, paste the same Client ID, sign in.
2. **Join a shared one** → pick *Oscar — Puppy Log* → **Join**.

That's it. Each phone syncs when it opens, every couple of minutes while open,
and a few seconds after anything is logged. Offline logging queues up and
syncs later.

## What ends up in Drive

```
Oscar — Puppy Log/
  Photos & Videos/2026-10/2026-10-03 1432 Oscar.jpg …
  Vet & Documents/…            invoice and record photos from vet visits
  _app data (don't edit)/      the log files and thumbnails
```

Photos and videos are regular Drive files. Browse, download or share them
from Drive like any album. Deleting a photo in the app moves it to Drive's
trash, where it can still be recovered.

## Good to know

- **Sign-in lasts about an hour.** After that the sync chip says *Tap to sync*.
  One tap re-signs you in; the Google popup usually closes by itself.
- **Potty alerts** only fire while the app is open or recently backgrounded.
  A web app can't wake the phone on a timer the way a native app can.
- **Backup:** More → Backup saves every record as one JSON file.
  Photos stay in Drive.

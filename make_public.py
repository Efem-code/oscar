"""Build the public, blank copy of the app (for any dog) into ../puppy-log.

Same code as Oscar's app, so improvements flow to both: edit here, run this,
then ../puppy-log/deploy.sh. What changes in the copy:

- edition.js says { public: true } — no reels, brand kit or Furbo/Digitail
  defaults, Jindo tips only when the breed is a Jindo, a step-by-step
  "set up sharing" wizard instead of a code from Claude.
- Its own storage names (puppylog.* / IndexedDB 'puppylog' / caches
  'puppylog-'). Every app under efem-code.github.io shares one origin, so with
  Oscar's names it would open — and write to — Oscar's data on your phones.
- Its own name, description and a teal icon so the two are easy to tell apart.
- Only the blank bridge template (bridge/Code.gs). Never Code.local.gs, the
  connection code or reels/.

    python3 make_public.py
"""
import json, os, re, shutil, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'puppy-log')
NAME, KEY, URL = 'Puppy Log', 'puppylog', 'https://efem-code.github.io/puppy-log/'

APP = ['index.html', 'styles.css', 'data.js', 'guides.js', 'store.js', 'drive.js', 'media.js', 'push.js', 'app.js', 'ask.js', 'coach.js', 'sw.js']

# Oscar-only wording in shared text, swapped for wording that fits any dog. Each must be found.
WORDING = {
    'index.html': [("Oscar's potty timer, health records, training and growing-up album — shared between two phones through Google Drive.",
                    'A puppy’s potty timer, health records, training and growing-up album — free, private, and shared between phones through your own Google Drive.')],
    'push.js': [(f"sub: 'https://efem-code.github.io/oscar/'", f"sub: '{URL}'")],
    'media.js': [("that put Shae's clips on the wrong days", 'which put iPhone videos on the wrong days')],
    'drive.js': [('It saves into your Oscar folder as you', 'It saves into your folder as you')],
    'ask.js': [('Sniffing tires a Jindo faster than', 'Sniffing tires a dog faster than'),
               ('Jindos are watchful by nature.', 'Many dogs are watchful by nature.'),
               ('Jindo tail high and curled, ears forward', 'Tail high, ears forward'),
               (' Jindos need time to warm up.', ' Some dogs need time to warm up.')],
    'guides.js': [('Jindos bore quickly with drilling.', 'Puppies bore quickly with drilling.'),
                  ('With a Jindo it tends to make him avoid you rather than listen.', 'It tends to make a dog avoid you rather than listen.'),
                  ('Jindos have strong prey drive and an independent streak, so a recall', 'Many dogs have a strong chase instinct and a mind of their own, so a recall'),
                  ('— Jindos love a chase.', '— most dogs love a chase.'),
                  ('Sniffing is a Jindo’s favourite currency.', 'Sniffing is most dogs’ favourite currency.'),
                  ('Jindos are often reserved with people they don’t know.', 'Some dogs are reserved with people they don’t know.'),
                  ('Many Jindos dislike being handled.', 'Many dogs dislike being handled.'),
                  ('Calming, and very Jindo.', 'Calming and satisfying.'),
                  ('Jindos tend to be fairly quiet dogs but strong watchdogs, so alert barking is the most common.', 'For many dogs, alert barking is the most common.'),
                  ('At 9 months and new to the neighbourhood,', 'For a young dog new to the neighbourhood,'),
                  ('(at 9 months, ~5 min per month of age is plenty)', '(~5 min per month of age is plenty)'),
                  ('Film a clip for Oscar’s Diary!', 'Film a clip to remember it!')],
}

# Words that must not survive in the copy (outside code comments).
FORBIDDEN = re.compile(r'kpuposcar|Willoughby|Shae|Fuzz|efemphotography|Oscar’s Diary', re.I)


def namespaced(text):
    """'oscar.x' / 'oscar-x' / 'oscar' storage names → this copy's own."""
    return re.sub(r"(['\"`])oscar(?=[.\-'\"`])", r'\1' + KEY, text)


def main():
    if os.path.isdir(OUT):
        for n in os.listdir(OUT):                     # keep the copy's own .git and deploy script
            if n in ('.git', 'deploy.sh'):
                continue
            p = os.path.join(OUT, n)
            shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    os.makedirs(os.path.join(OUT, 'bridge'), exist_ok=True)

    for f in APP:
        s = open(os.path.join(HERE, f), encoding='utf-8').read()
        for a, b in WORDING.get(f, []):
            assert a in s, f'{f}: wording not found: {a[:50]}'
            s = s.replace(a, b)
        if f == 'guides.js':
            a = s.index('/* The Oscar brand'); b = s.index('\n};\n', a) + 4
            s = s[:a] + "/* Brand kit: Oscar's copy only. */\nconst BRAND = { handle: '', bio: '', pillars: [], rhythm: [], look: [] };\n" + s[b:]
        s = namespaced(s)
        if f == 'sw.js':
            s = s.replace("/* Puppy Log service worker", f"/* {NAME} service worker")
        open(os.path.join(OUT, f), 'w', encoding='utf-8').write(s)

    open(os.path.join(OUT, 'edition.js'), 'w').write(
        "/* The public copy of the app: a blank puppy log for any dog (built by make_public.py). */\n"
        f"const EDITION = {{ public: true, name: '{NAME}' }};\n")

    m = json.load(open(os.path.join(HERE, 'manifest.webmanifest')))
    m.update(name=NAME, short_name=NAME, id='./',
             description='Potty timer, health records, training and a growing-up album for your puppy — free, private, shared between phones.')
    m['shortcuts'] = [dict(s, name=s['name'].replace('Fed him', 'Fed the puppy')) for s in m['shortcuts']]
    json.dump(m, open(os.path.join(OUT, 'manifest.webmanifest'), 'w'), indent=2, ensure_ascii=False)

    shutil.copy(os.path.join(HERE, 'bridge', 'Code.gs'), os.path.join(OUT, 'bridge', 'Code.gs'))

    # Teal icons, so it can't be mistaken for Oscar's app.
    src = open(os.path.join(HERE, 'make-icons.py')).read().replace('(0xc0, 0x67, 0x3a, 255)', '(0x2f, 0x7d, 0x78, 255)')
    subprocess.run(['python3', '-c', src], cwd=OUT, check=True, capture_output=True)
    for icon in ('icon-192.png', 'icon-512.png', 'icon-maskable.png', 'apple-touch-icon.png'):
        if not os.path.exists(os.path.join(OUT, icon)):
            shutil.copy(os.path.join(HERE, icon), os.path.join(OUT, icon))

    open(os.path.join(OUT, '.nojekyll'), 'w').close()
    open(os.path.join(OUT, 'README.md'), 'w').write(f"""# {NAME}

A free, private puppy app: potty timer and house-training progress, meals, sleep, walks, health and vet records,
training guides and brain games, and a growing-up photo album.

**Open it:** {URL} → add it to your home screen (iPhone: Safari → Share → Add to Home Screen;
Android: Chrome → ⋮ → Add to Home screen).

Everything is saved on your phone. To share with a partner and keep photos and videos in your own Google Drive,
go to **More → Sync & sharing → Set it up**. It takes about 10 minutes once, on a computer, and then each phone
joins with a link. Nothing goes through anyone else's servers. The bridge is a small script in your own Google account.

Built from the same code as Oscar's puppy log. This folder is generated by `make_public.py`, so don't edit it by hand.
""")

    # Leftovers check.
    bad = []
    for f in APP + ['edition.js', 'manifest.webmanifest']:
        for i, line in enumerate(open(os.path.join(OUT, f), encoding='utf-8'), 1):
            code = re.sub(r'/\*.*?\*/|//.*$', '', line)
            if FORBIDDEN.search(code) or re.search(r"(['\"`])oscar[.\-'\"`]", code):
                bad.append(f'{f}:{i}: {line.strip()[:120]}')
    print(f'built {OUT}')
    if bad:
        print('CHECK THESE:'); print('\n'.join(bad))


if __name__ == '__main__':
    main()

#!/usr/bin/env bash
# Publish oscar to GitHub Pages.
#
# Every deploy stamps a new BUILD into sw.js. That stamp is the only thing that
# makes an update actually reach an installed phone: the browser compares the
# service worker byte for byte, and an identical file means it keeps serving the
# version it already cached.
set -euo pipefail
cd "$(dirname "$0")"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
note() { printf '  %s\n' "$*"; }

say "0. Checking the code"
for f in *.js; do node --check "$f" || { echo "Syntax error in $f — not deploying"; exit 1; }; done
# Assigning ACT.x above `const ACT = {}` throws at load and blanks the whole app.
python3 - <<'PY' || { echo "Not deploying."; exit 1; }
import re, sys
s = open('app.js').read(); i = s.index('const ACT = {};')
bad = re.findall(r'(?<![A-Z_])ACT\.\w+\s*=', s[:i])
if bad: print('ACT used before it exists:', bad); sys.exit(1)
PY
note "ok"

say "1. Stamping this build"
STAMP="$(date +%Y%m%d-%H%M%S)"
sed -i '' "s/^const BUILD = '.*';/const BUILD = '$STAMP';/" sw.js
note "build $STAMP"

say "2. Pushing"
git add -A
if git diff --cached --quiet; then
  note "nothing changed"
else
  git commit -qm "Deploy $STAMP"
  note "committed"
fi
git push -q origin main
note "pushed"

URL="$(gh api repos/Efem-code/oscar/pages --jq .html_url 2>/dev/null || true)"
say "3. Live"
note "${URL:-https://efem-code.github.io/oscar/}"
note "GitHub takes a minute or two to rebuild."
note "Open it on the phone; the app reloads itself onto the new build."

#!/usr/bin/env bash
# Check for "make my reel" requests from the app every 2 minutes (reel_requests.py). Each check is one small
# Drive query; the reel itself is only made when a request is waiting. Runs while the Mac is awake; requests
# sent while it sleeps are picked up when it wakes. Logs go to reels/out/requests.log.
#   ./install_requests.sh          install / update
#   ./install_requests.sh remove   stop it
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/com.efem.oscar-requests.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
if [ "${1:-}" = remove ]; then rm -f "$PLIST"; echo "Removed."; exit 0; fi
mkdir -p "$HERE/out"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.efem.oscar-requests</string>
  <key>ProgramArguments</key><array><string>$HERE/.venv/bin/python</string><string>$HERE/reel_requests.py</string></array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StartInterval</key><integer>120</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HERE/out/requests.log</string>
  <key>StandardErrorPath</key><string>$HERE/out/requests.log</string>
</dict></plist>
PL
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Checking for reel requests every 2 minutes → $HERE/out/requests.log"

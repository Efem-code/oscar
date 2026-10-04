#!/usr/bin/env bash
# Run make_reel.py every evening at 8 pm. If the Mac is asleep at 8, macOS runs
# it as soon as it wakes. Logs go to reels/out/reel.log.
#   ./install_schedule.sh          install / update
#   ./install_schedule.sh remove   stop it
set -euo pipefail
cd "$(dirname "$0")"
HERE="$(pwd)"
PLIST="$HOME/Library/LaunchAgents/com.efem.oscar-reel.plist"
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
if [ "${1:-}" = remove ]; then rm -f "$PLIST"; echo "Removed."; exit 0; fi
mkdir -p "$HERE/out"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.efem.oscar-reel</string>
  <key>ProgramArguments</key><array><string>$HERE/.venv/bin/python</string><string>$HERE/make_reel.py</string></array>
  <key>WorkingDirectory</key><string>$HERE</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>20</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$HERE/out/reel.log</string>
  <key>StandardErrorPath</key><string>$HERE/out/reel.log</string>
</dict></plist>
PL
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Scheduled: every day at 8:00 pm → $HERE/out/reel.log"

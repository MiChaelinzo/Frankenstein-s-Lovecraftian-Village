#!/usr/bin/env bash
# Headless screenshot of the web demo.
# Usage: tools/screenshot.sh <out.png> <hash e.g. '#seed=1818&sanity=100'> [WxH] [query e.g. '?reduced=1']
# Pack mode (?pack=1) gets capture=1 added automatically: the animated frame loop never lets Chrome's
# virtual-time clock finish when pattern textures are drawn (exit 124), so capture=1 renders the static still frame.
# Env: CHROME overrides the browser binary; PORT overrides the port (default 8123).
set -euo pipefail
OUT=${1:?usage: screenshot.sh <out.png> <hash> [WxH] [query]}
HASH=${2:-}
SIZE=${3:-1100x1000}
QUERY=${4:-}
PORT=${PORT:-8123}
if [[ "$QUERY" == *pack=1* && "$QUERY" != *capture=1* ]]; then QUERY="$QUERY&capture=1"; fi
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DEFAULT=/inner_container/opt/playwright/chromium_headless_shell-1232/chrome-headless-shell-linux64/chrome-headless-shell
CHROME=${CHROME:-}
if [ -z "$CHROME" ]; then
  if [ -x "$DEFAULT" ]; then CHROME=$DEFAULT
  else CHROME=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
  fi
fi
[ -n "$CHROME" ] || { echo "no chrome binary found; set CHROME" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
python3 -m http.server "$PORT" -d "$ROOT/web" >/dev/null 2>&1 &
SERVER=$!
UD=$(mktemp -d)
trap 'kill $SERVER 2>/dev/null || true; rm -rf "$UD"' EXIT
for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/" >/dev/null && break; sleep 0.1; done
timeout "${SHOT_TIMEOUT:-60}" "$CHROME" --no-sandbox --user-data-dir="$UD" --hide-scrollbars --screenshot="$OUT" \
  --window-size="${SIZE/x/,}" --virtual-time-budget=4000 "http://127.0.0.1:$PORT/$QUERY$HASH" >/dev/null 2>&1
ls -la "$OUT"

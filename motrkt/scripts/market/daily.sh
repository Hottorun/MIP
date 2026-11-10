#!/bin/sh
# Daily refresh: pull new results and listings, recompute the model with today as cut-off, check the app still
# builds and commit the new data locally (never pushes).
#   sh scripts/market/daily.sh [WORK]     (default WORK: ~/Documents/MIP-Marktdaten)
set -e
W=${1:-$HOME/Documents/MIP-Marktdaten}
HERE=$(cd "$(dirname "$0")" && pwd)
APP=$(cd "$HERE/../.." && pwd)
ROOT=$(git -C "$APP" rev-parse --show-toplevel)
LOG="$W/web/update-$(date +%F).log"
export PATH="$HOME/.local/node/bin:$PATH"

echo "Log: $LOG"
sh "$HERE/update.sh" "$W" > "$LOG" 2>&1
(cd "$APP" && npx tsc --noEmit -p .) >> "$LOG" 2>&1

cd "$ROOT"
git add motrkt/src/data/real/market-model.json motrkt/src/data/real/asks.json motrkt/src/data/real/sales.csv
if git diff --cached --quiet; then
  echo "Keine neuen Daten."
else
  git commit -q -m "Marktdaten vom $(date +%d.%m.%Y)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git log --oneline -1
fi

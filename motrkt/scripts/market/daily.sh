#!/bin/sh
# Daily refresh: pull new results and listings, recompute the model with today as cut-off, check the app still
# builds and the data did not shrink (check.py), then commit the new data (pushes only with MIP_PUSH=1).
#   sh scripts/market/daily.sh [WORK]     (default WORK: ~/Documents/MIP-Marktdaten)
# Runs every morning on GitHub Actions (.github/workflows/marktdaten.yml) with MIP_PUSH=1.
set -e
W=${1:-$HOME/Documents/MIP-Marktdaten}
HERE=$(cd "$(dirname "$0")" && pwd)
APP=$(cd "$HERE/../.." && pwd)
ROOT=$(git -C "$APP" rev-parse --show-toplevel)
LOG="$W/web/update-$(date +%F).log"
export PATH="$HOME/.local/node/bin:$PATH"

echo "Log: $LOG"
: > "$LOG"
# approved cars of users (purchase contract checked) from Postgres, for model.py; in a temporary folder, not in $W,
# which GitHub Actions keeps in its cache, and deleted after the run
UC=$(mktemp -d)
trap 'rm -rf "$UC"' EXIT
if [ -n "$DATABASE_URL" ] || grep -q '^DATABASE_URL=.' "$APP/.env" 2>/dev/null; then
  (cd "$APP" && npx tsx scripts/db/export-user-cars.ts "$UC/usercars.csv") >> "$LOG" 2>&1 || echo "   Nutzerfahrzeuge nicht exportiert" >> "$LOG"
fi
[ -f "$UC/usercars.csv" ] && export MIP_USER_CARS="$UC/usercars.csv"
sh "$HERE/update.sh" "$W" >> "$LOG" 2>&1
(cd "$APP" && npx tsc --noEmit -p .) >> "$LOG" 2>&1
if ! python3 -I "$HERE/check.py" >> "$LOG" 2>&1; then
  tail -4 "$LOG"
  git -C "$APP" checkout -- src/data/real/market-model.json src/data/real/asks.json src/data/real/sales.csv src/data/real/listing-history.json
  echo "Abbruch: neue Daten deutlich kleiner als die alten (siehe Log), nichts übernommen."
  exit 1
fi
# load the new data into Postgres when a database is configured (DATABASE_URL in the environment or .env)
if [ -n "$DATABASE_URL" ] || grep -q '^DATABASE_URL=.' "$APP/.env" 2>/dev/null; then
  (cd "$APP" && npm run -s db:migrate && npm run -s db:import) >> "$LOG" 2>&1
fi

cd "$ROOT"
git add motrkt/src/data/real/market-model.json motrkt/src/data/real/asks.json motrkt/src/data/real/sales.csv motrkt/src/data/real/listing-history.json
if git diff --cached --quiet; then
  echo "Keine neuen Daten."
else
  git commit -q -m "Marktdaten vom $(date +%d.%m.%Y)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
  git log --oneline -1
  if [ "$MIP_PUSH" = 1 ]; then
    git pull -q --rebase && git push -q
  fi
fi

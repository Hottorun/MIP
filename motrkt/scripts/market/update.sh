#!/bin/sh
# Marktwerte aktualisieren: neue Auktionsergebnisse und Angebote holen, Modell neu rechnen, App-Daten schreiben.
#   sh scripts/market/update.sh WORK            (WORK: Arbeitsordner mit den Rohdaten, nicht im Repo)
# Dauer: rund 30-60 Minuten, je nach Zahl neuer Inserate (Abrufe mit Pausen, wie es die Seiten erlauben).
set -e
W=${1:?Arbeitsordner angeben}
HERE=$(cd "$(dirname "$0")" && pwd)
APP=$HERE/../../src/data/real
mkdir -p "$W/web/fx" "$W/web/ucp" "$W/tools"
cp "$HERE/classify.py" "$W/tools/classify.py"

echo "1/6 Wechselkurse (EZB)"
curl -sL -o "$W/web/fx/eurofxref-hist.zip" https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip
(cd "$W/web/fx" && unzip -o -q eurofxref-hist.zip)

echo "2/6 Bring a Trailer (neueste Ergebnisse)"
python3 -I "$HERE/batfetch.py" "$W/web/bat_porsche.jsonl" 1 --until-known || true

echo "3/6 Auktionshäuser (RM Sotheby's, Bonhams, Broad Arrow, Artcurial … über ultimatecarpage.com)"
LAST=$(ls "$W/web/ucp" | sed 's/.html//' | sort -n | tail -1)
sh "$HERE/ucpfetch.sh" "$W" $((LAST > 10 ? LAST - 10 : 1)) $((LAST + 40))
python3 -I "$HERE/ucpparse.py" "$W/web/ucp" "$W/web/ucp.json"

echo "4/6 Angebote in Europa (Classic Trader)"
python3 -I "$HERE/ctfetch.py" "$W"
python3 -I "$HERE/ctparse.py" "$W"

echo "5/6 Links zu den Originalseiten der Auktionshäuser, Zuordnung und Modell"
python3 -I "$HERE/linkfetch.py" "$W"
python3 -I "$HERE/build.py" "$W"
python3 -I "$HERE/model.py" "$W" "$APP/market-model.json" "$APP/asks.json"

echo "6/6 Verkaufsliste für die App"
python3 -I "$HERE/export.py" "$W" "$APP/sales.csv"
echo "Fertig. Stichtag ist heute (oder MIP_AS_OF=JJJJ-MM-TT); die App übernimmt ihn aus market-model.json."

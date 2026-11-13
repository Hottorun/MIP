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
cp "$HERE/sales_old.csv" "$W/web/sales_old.csv"  # frühere Verkäufe von Hand (Mecum, Barrett-Jackson, Presse …), gepflegt im Repo

echo "1/6 Wechselkurse (EZB)"
curl -sL -o "$W/web/fx/eurofxref-hist.zip" https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip
(cd "$W/web/fx" && unzip -o -q eurofxref-hist.zip)

echo "2/6 Bring a Trailer (neueste Ergebnisse)"
python3 -I "$HERE/batfetch.py" "$W/web/bat_porsche.jsonl" 1 --until-known || true
# einmalig je Modellseite alle Ergebnisse seit 2015 (bat_models.done merkt sich fertige Modelle, danach ohne Abruf)
python3 -I "$HERE/batmodels.py" "$W" || echo "   Modellseiten unvollständig, beim nächsten Lauf weiter"

echo "3/6 Auktionshäuser (RM Sotheby's, Bonhams, Broad Arrow, Artcurial … über ultimatecarpage.com)"
LAST=$(ls "$W/web/ucp" | sed 's/.html//' | sort -n | tail -1)
# leerer Ordner: alle Auktionen seit 2015 (ultimatecarpage-Nummern bis rund 480, Stand November 2026)
[ -n "$LAST" ] || LAST=460
sh "$HERE/ucpfetch.sh" "$W" $((LAST > 460 ? LAST - 10 : 1)) $((LAST + 40))
python3 -I "$HERE/ucpparse.py" "$W/web/ucp" "$W/web/ucp.json" "$HERE/ucp-snapshot.json"
echo "   Auktionshäuser direkt (Ergebnisse mit Lotseite, Fahrgestellnummer und Laufleistung)"
# Bonhams (bonhamsfetch.py) fehlt hier: Bonhams' Such-API antwortet mit einer Bot-Abfrage, bis Bonhams den Zugang freigibt
for f in rmfetch goodingfetch broadarrowfetch artcurialfetch; do
  python3 -I "$HERE/$f.py" "$W" || echo "   $f fehlgeschlagen, weiter mit ultimatecarpage"
done

echo "4/6 Angebote in Europa (Classic Trader)"
python3 -I "$HERE/ctfetch.py" "$W"
python3 -I "$HERE/ctparse.py" "$W"
echo "   Fotos der Händlerfahrzeuge (manual/haendler.csv)"
python3 -I "$HERE/dealerphotos.py" "$W" || echo "   Händlerfotos fehlgeschlagen, weiter ohne neue Fotos"

echo "5/6 Links zu den Originalseiten der Auktionshäuser, Zuordnung und Modell"
# linkfetch braucht die Zuordnung eines früheren Laufs (sales_all.json); beim allerersten Lauf erst einmal bauen
[ -f "$W/web/sales_all.json" ] || python3 -I "$HERE/build.py" "$W"
python3 -I "$HERE/linkfetch.py" "$W"
python3 -I "$HERE/build.py" "$W"
python3 -I "$HERE/model.py" "$W" "$APP/market-model.json" "$APP/asks.json"

echo "6/6 Verkaufsliste für die App"
python3 -I "$HERE/export.py" "$W" "$APP/sales.csv"
python3 -I "$HERE/track.py" "$W" "$APP/listing-history.json"
echo "Fertig. Stichtag ist heute (oder MIP_AS_OF=JJJJ-MM-TT); die App übernimmt ihn aus market-model.json."

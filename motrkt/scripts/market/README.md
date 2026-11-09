# Marktmodell aus Auktionsergebnissen

Erzeugt `src/data/real/market-model.json` und `src/data/real/sales.csv`. `WORK` ist ein beliebiges Arbeitsverzeichnis
(heruntergeladene Rohdaten liegen unter `WORK/web`, nicht im Repo). Python-Skripte mit `python3 -I` ausführen.

1. Wechselkurse: ECB `eurofxref-hist.csv` nach `WORK/web/fx/` entpacken.
2. Bring a Trailer: `batfetch.py WORK` (alle Porsche-Ergebnisse der letzten ~10.000 Auktionen) und
   `batmodels.py WORK [modell-seiten…]` (Modellseiten bis 2015 zurück).
3. Ultimatecarpage (RM Sotheby's, Gooding, Bonhams, Broad Arrow, Artcurial …): `ucpfetch.sh WORK 1 475`, dann
   `ucpparse.py WORK/web/ucp WORK/web/ucp.json`.
4. `build.py WORK` ordnet jeden Titel per `classify.py` genau einer Variante zu (oder verwirft ihn: Umbauten, Replikas,
   Teile, nicht eindeutige Modelle) und rechnet in EUR zum Kurs des Verkaufstags um.
5. `model.py WORK src/data/real/market-model.json`: robuster Zeitindex je Segment (Kernel-gewichtete Mediane der
   Log-Preise), Niveau je Variante, ab 12 Verkäufen eigene Drift (zum Index hin geschrumpft). Eigene Indizes für
   Supersportwagen (F), Rennwagen (G) und 356/luftgekühlte 911 über 250.000 € (H).
6. `export.py WORK src/data/real/sales.csv`.

Prüfen: `report.py WORK src/data/real/market-model.json` (braucht `WORK/web/old_values.txt` mit den Katalogwerten) und
`show.py WORK <variante> [n]` für die Einzelverkäufe einer Variante.

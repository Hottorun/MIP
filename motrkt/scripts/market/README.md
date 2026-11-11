# Marktwerte: Methode und Aktualisierung

Erzeugt `src/data/real/market-model.json` (Marktwert und Verlauf je Variante), `src/data/real/asks.json` (die
Angebote, die in den Wert eingehen) und `src/data/real/sales.csv` (Auktionsergebnisse). `WORK` ist ein beliebiges
Arbeitsverzeichnis mit den Rohdaten (nicht im Repo). Alles in einem Schritt: `sh update.sh WORK`.

Täglich: `sh daily.sh` holt neue Daten, rechnet mit **heute** als Stichtag (abweichend: `MIP_AS_OF=JJJJ-MM-TT`), prüft
die App und committet die Datendateien lokal (ohne Push). Die App liest den Stichtag aus `market-model.json`, das Datum
„Marktdaten vom …“ stimmt also immer mit den Daten überein. Läuft als geplante Aufgabe „MIP: Marktdaten täglich
aktualisieren“ jeden Morgen um 6 Uhr in der Claude-App. Händlerbestände in `manual/haendler.csv` werden dabei nicht
automatisch erneuert.

## Inserate verfolgen (`track.py`)

Läuft mit jedem Update und schreibt `src/data/real/listing-history.json`: für jedes Inserat erster und letzter Tag,
Preisänderungen (ab 1 %) und ob es nicht mehr online ist (verkauft oder zurückgezogen; ein Inserat, das plötzlich
keinen Preis mehr zeigt, zählt auch so). Classic Trader wird täglich abgerufen. Für die Zeilen in `manual/*.csv` wird
bei jedem Lauf ein Schnappschuss gespeichert (`WORK/web/track/manual/`): einen Preis in der CSV ändern ist eine
Preisänderung an diesem Tag, eine Zeile löschen heißt „nicht mehr online“, eine neue Zeile beginnt am `datum`.
Schlüssel ist die URL, sie sollte sich also nicht ändern. Nach einigen Wochen misst das, wie weit der letzte
Angebotspreis vor dem Verschwinden über den Auktionsergebnissen liegt; dann kann `model.py` diesen Abschlag statt
des allgemeinen Angebotsaufschlags verwenden.

## Was der Marktwert bedeutet

Der Preis, zu dem ein Fahrzeug der Variante heute in Deutschland bzw. Europa tatsächlich den Besitzer wechselt –
gemessen auf der Skala der **Auktionsergebnisse in Europa** (inklusive Aufgeld, also was Käufer zahlen). Kein
Angebotspreis, kein US-Preis, keine Schätzung aus Katalogwerten.

## Belege

| Kanal | Quelle | Abruf |
| --- | --- | --- |
| `EU_AUC` Auktionen Europa | RM Sotheby's, Bonhams, Broad Arrow, Artcurial, Gooding … (Verkäufe in EUR, GBP, CHF) | `ucpfetch.sh` + `ucpparse.py` (ultimatecarpage.com) |
| `EU_AUC` / `US_AUC` | Auktionshäuser direkt: RM Sotheby's, Gooding & Company, Broad Arrow, Artcurial (nur verkaufte Lose; unverkaufte veröffentlicht Artcurial nicht) – mit Lotseite, Fahrgestellnummer und Laufleistung (falls genannt); ersetzen dieselben Lose von ultimatecarpage (gleiche Fahrgestellnummer ±7 Tage, sonst Variante, Datum und Preis). Bonhams: `bonhamsfetch.py` ist fertig, läuft aber nicht mit, solange Bonhams' Such-API mit einer Bot-Abfrage antwortet | `rmfetch.py`, `goodingfetch.py`, `broadarrowfetch.py`, `artcurialfetch.py` |
| `EU_ASK` Angebote Europa | Classic Trader (Händler und privat, Linkslenker, Standort Europa) | `ctfetch.py` + `ctparse.py` |
| `EU_ASK` / `EU_AUC` | von Hand: mobile.de, Elferspot, Kleinanzeigen, Händlerauskünfte | `manual/*.csv`, siehe `manual/README.md` |
| `US_AUC` Auktionen USA | Bring a Trailer, RM Sotheby's, Gooding, Broad Arrow … (Verkäufe in USD) | `batfetch.py`, `ucpfetch.sh` |

Nicht automatisch abrufbar (geprüft am 10. November 2026): mobile.de (Such- und Inseratsseiten per robots.txt gesperrt;
für die offizielle Search API braucht es Zugangsdaten von mobile.de, der Client liegt schon in `server/mobilede.ts`),
Kleinanzeigen (Nutzungsbedingungen verbieten Crawler ohne schriftliche Zustimmung), Elferspot, Classic Driver, Dyler,
Cars & Bids (Bot-Schutz), Catawiki, Car & Classic, Coys (sperren Abrufe), AutoScout24, Collecting Cars, PCARMARKET,
Dorotheum, Aguttes, H&H, Mecum, Hemmings (sperren KI-Crawler ausdrücklich), Barrett-Jackson (nur Google erlaubt).
Diese Sperren werden nicht umgangen.

Jeder Titel wird per `classify.py` genau einer Variante zugeordnet oder verworfen (Umbauten, Replikas, Teile, nicht
eindeutige Modelle). Preise werden zum EZB-Kurs des Tages in EUR umgerechnet.

## Modell (`model.py`)

    log p = a_v + f_g(t) + δ_c,k + λ_v(t)·d_v(t) + e

1. **Zeitindex** `f_g` je Marktsegment aus allen Auktionsergebnissen (kernelgewichtete Mediane der Log-Preise,
   robust gegen Ausreißer). Damit werden ältere Preise auf heute hochgerechnet.
2. **Kanalabstand** `δ`: Für jede Variante mit Preisen in zwei Kanälen wird die Differenz der Mediane gebildet und über
   alle solchen Varianten gepoolt (gewichteter Median). Daraus folgt per gewichteter kleinster Quadrate, um wie viel
   Angebotspreise und US-Ergebnisse im Mittel über bzw. unter den europäischen Auktionsergebnissen liegen. Der
   US-Abstand wird getrennt für Klassiker und moderne Fahrzeuge geschätzt, der Angebotsaufschlag gemeinsam für alle
   (er hängt am Verkaufsweg, nicht an der Baureihe). Dieser Abstand wird abgezogen.
3. **Gewicht je Kanal**: Der Kanalmedian einer Variante zählt mit der Präzision `1 / (π/2 · s_c² / n + τ_c²)`. `s_c`
   ist die gemessene Streuung der Einzelpreise des Kanals, `τ_c` die gemessene Streuung des Kanalabstands zwischen den
   Varianten. Für indirekte Belege (US, Angebote) begrenzt `τ_c` das Gewicht – auch tausend US-Verkäufe können den Wert
   einer Variante nicht weiter verschieben, als es der gemessene Unterschied zwischen den Märkten erlaubt.
4. **Aktualität**: Innerhalb eines Kanals zählen jüngere Preise mehr (Gewicht `exp(−Alter/2 Jahre)`).
5. **Eigener Verlauf** ab 12 Belegen (zum Segmentindex hin geschrumpft), sonst folgt die Kurve dem Segment.
6. **Unplausible Preise raus**: Classic-Trader-Inserate, die laut Inserat Nachbau, Umbau, Rennwagen, Projekt-,
   Teile- oder Unfallfahrzeug sind (Merkmale `isReplica`/`isConverted`/`isRacingCar` und Titel/Beschreibung des
   Verkäufers, `ctparse.py`), gehen nicht ein. Danach fällt jeder Preis heraus, der weiter als 2 × die gemessene
   Streuung seiner Quelle vom Niveau der Variante entfernt liegt, höchstens Faktor 2 in beide Richtungen
   (`OUT_K`, `OUT_MAX`). Die App zeigt alle ausgeschlossenen Belege mit Grund.
7. **Mindestens 3 Belege** für einen Marktwert. Darunter zeigt die App keinen Wert, keinen Verlauf und keine
   Empfehlung, sondern nur die Einzelbelege.

Alle Zwischenergebnisse (Abstände, Streuungen, Gewichte, Kanalanteile je Variante) stehen in `market-model.json` und
werden in der App unter „Belege für den Marktwert“ angezeigt.

## Prüfen

`report.py WORK src/data/real/market-model.json` und `show.py WORK <variante> [n]` für die Einzelverkäufe einer
Variante.

# Von Hand erfasste Inserate, Verkäufe und Auktionsergebnisse

mobile.de, Elferspot, AutoScout24 und Kleinanzeigen sperren automatische Abrufe (robots.txt bzw. Bot-Schutz). Inserate
von dort lassen sich hier von Hand eintragen und fließen beim nächsten `update.sh` genauso in den Marktwert ein wie die
automatisch erfassten Angebote von Classic Trader. Dasselbe gilt für Bestände, Verkäufe und Auktionsergebnisse von
Händlern und Auktionshäusern in Europa, den USA und Kanada.

Eine Datei pro Quelle oder Monat, z. B. `2026-11-elferspot.csv`, Trennzeichen `;`, UTF-8, Spalten wie in
`VORLAGE.csv.txt`:

| Spalte | Inhalt |
| --- | --- |
| datum | Tag, an dem das Inserat gesehen wurde (JJJJ-MM-TT) |
| quelle | z. B. `mobile.de`, `Elferspot`, `Kleinanzeigen`, Händler- oder Auktionshausname. `Bring a Trailer`, `Cars & Bids` und `PCARMARKET` zählen als US-Online-Auktionen |
| art | `Angebot` (Angebotspreis), `Verkauf` (belegter Verkaufspreis, z. B. Händlerauskunft mit Rechnung) oder `Auktion` (Zuschlag inkl. Aufgeld eines verkauften Loses; unverkaufte Lose nicht eintragen) |
| url | Link auf das Inserat (wird in der App als Beleg verlinkt) |
| fahrzeug | Modellbezeichnung wie im Inserat, z. B. `911 Carrera RS`, `911 Carrera 3.2 Targa` |
| baujahr | Baujahr bzw. Modelljahr |
| preis | Preis als Zahl ohne Punkte |
| waehrung | `EUR`, `CHF`, `GBP`, `USD`, `CAD` … (Umrechnung zum EZB-Kurs des Tages) |
| km | Kilometerstand (leer, wenn unbekannt) |
| anbieter | `Händler` oder `Privat` |
| land | ISO-Ländercode des Standorts, z. B. `DE`, `NL`, `GB`, `US`, `CA` (bestimmt, wie der Preis zählt, siehe unten) |
| variant_id | leer lassen (wird aus `fahrzeug` + `baujahr` zugeordnet) oder eine ID aus `variant_ids.json` erzwingen |

Nur Fahrzeuge mit Linkslenkung eintragen; Umbauten, Replikas und Projekte weglassen. Verkäufe nur mit Nachweis.

Wie ein Eintrag zählt, ergibt sich aus `land` und `art`:

| land | `Verkauf` / `Auktion` | `Angebot` |
| --- | --- | --- |
| Europa (`DE`, `AT`, `CH`, `NL`, `GB`, `FR`, `IT` …) | wie Auktionsergebnisse in Europa (`EU_AUC`, Bezugsgröße) | Angebote Europa (`EU_ASK`) |
| `US`, `CA` | Auktionen USA (`US_AUC`); Bring a Trailer, Cars & Bids, PCARMARKET: Online-Auktionen USA (`US_ONL`) | Angebote USA (`US_ASK`) |
| andere Länder | werden noch nicht verwendet (beim Lauf von `model.py` gemeldet) | ebenso |

Jeder Kanal bekommt seinen eigenen, gemessenen Abstand zu den Auktionsergebnissen in Europa; alle US-Kanäle zusammen
haben ein begrenztes Gewicht. Je mehr europäische Belege dazukommen, desto weniger hängt ein Wert an US-Daten.

## Händlerbestände (`haendler.csv`)

Bestand mit Preis von early911s, Janzen Klassik, Karero, Oliver Neumann Sportclassics, Fiegenschuh, DAVID Finest
Sports Cars und Motorlegenden (Stand 10.11.2026) sowie Elevenclassics, 11er Ecke, Fischer Oldtimer, Röhrle Mobility,
Carworld Classics (Maastricht, NL) und Pitstop Car Trading (Dronten, NL) (Stand 12.11.2026). Alle dreizehn Seiten
erlauben das Lesen laut robots.txt. Die Basis-Carrera (997 bis 992) sind seit 12.11.2026 eingetragen. Die
wassergekühlten Allradler haben seit 12.11.2026 eigene Varianten (Carrera 4 und 4S je Baureihe, 4 GTS beim 992; der
992.2 hat keinen einfachen Carrera 4): Carrera 4 und Targa 4 stehen beim Carrera 4, Carrera 4S und Targa 4S beim
Carrera 4S, Carrera 4 GTS und Targa 4 GTS beim Carrera 4 GTS. Ab dem 997 ist jeder Targa ein Allradler und zählt
deshalb nie beim Carrera oder Carrera S. Das gilt genauso für Auktionsergebnisse (`classify.py`) und die Angebote von
Classic Trader (`ctparse.py`). Der 997 GTS, der 991 GTS und der US-Carrera 2.7 haben noch keine eigene Variante und
sind deshalb nicht eingetragen, ebenso SUVs und Limousinen. Gelesen wurde nur die öffentliche Fahrzeugliste bzw. die
Detailseiten, mit Pausen zwischen den Abrufen. Fahrzeuge mit „Preis auf Anfrage“, Unikate (Prototypen, Presse-
oder Rennfahrzeuge ohne passende Variante), Rechtslenker und Projekte sind nicht eingetragen; die Variante ist
von Hand zugeordnet. Bei Netto-Preisen ist die MwSt. (19 %) aufgeschlagen. Kilometerstände unter 1.100 km (meist „nach Restaurierung“) stehen als unbekannt drin.
Zum Aktualisieren die Bestände erneut abrufen und die Datei ersetzen; verkaufte Fahrzeuge fallen dabei heraus.

## Auktionsergebnisse korrigieren (`auktionen-korrekturen.csv`)

Für einzelne Ergebnisse, die von Hand auf der Ergebnisseite des Auktionshauses geprüft wurden: `los_id` (wie in
`sales.csv`, z. B. `UCP-468-147`), Zuschlag mit Aufgeld (`preis`, `waehrung`) und der direkte Link zum Los. Preis
und Link des Hauses ersetzen dann die Angaben von ultimatecarpage. Leerer Preis: nur den Link ersetzen (z. B. nicht
verkauft). Gilt für den nächsten Lauf von `build.py` bzw. `update.sh`.

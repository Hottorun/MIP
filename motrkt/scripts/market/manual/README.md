# Von Hand erfasste Inserate und Verkäufe

mobile.de, Elferspot, AutoScout24 und Kleinanzeigen sperren automatische Abrufe (robots.txt bzw. Bot-Schutz). Inserate
von dort lassen sich hier von Hand eintragen und fließen beim nächsten `update.sh` genauso in den Marktwert ein wie die
automatisch erfassten Angebote von Classic Trader.

Eine Datei pro Quelle oder Monat, z. B. `2026-11-elferspot.csv`, Trennzeichen `;`, UTF-8, Spalten wie in
`VORLAGE.csv.txt`:

| Spalte | Inhalt |
| --- | --- |
| datum | Tag, an dem das Inserat gesehen wurde (JJJJ-MM-TT) |
| quelle | z. B. `mobile.de`, `Elferspot`, `Kleinanzeigen`, Händlername |
| art | `Angebot` (Angebotspreis) oder `Verkauf` (belegter Verkaufspreis, z. B. Händlerauskunft mit Rechnung) |
| url | Link auf das Inserat (wird in der App als Beleg verlinkt) |
| fahrzeug | Modellbezeichnung wie im Inserat, z. B. `911 Carrera RS`, `911 Carrera 3.2 Targa` |
| baujahr | Baujahr bzw. Modelljahr |
| preis | Preis als Zahl ohne Punkte |
| waehrung | `EUR`, `CHF`, `GBP` … (Umrechnung zum EZB-Kurs des Tages) |
| km | Kilometerstand (leer, wenn unbekannt) |
| anbieter | `Händler` oder `Privat` |
| land | ISO-Ländercode des Standorts, z. B. `DE` |
| variant_id | leer lassen (wird aus `fahrzeug` + `baujahr` zugeordnet) oder eine ID aus `variant_ids.json` erzwingen |

Nur Fahrzeuge mit Linkslenkung und Standort in Europa eintragen; Umbauten, Replikas und Projekte weglassen.
Belegte Verkäufe (`art` = `Verkauf`) zählen wie Auktionsergebnisse in Europa – nur mit Nachweis eintragen.

## Händlerbestände (`haendler.csv`)

Bestand mit Preis von early911s, Janzen Klassik, Karero und Oliver Neumann Sportclassics, Stand 09./10.11.2026.
Alle vier Seiten erlauben das Lesen laut robots.txt. Gelesen wurde nur die öffentliche Fahrzeugliste bzw. die
Detailseiten, mit Pausen zwischen den Abrufen. Fahrzeuge mit „Preis auf Anfrage“, Unikate (Prototypen, Presse-
oder Rennfahrzeuge ohne passende Variante), Rechtslenker und Projekte sind nicht eingetragen; die Variante ist
von Hand zugeordnet. Kilometerstände unter 1.100 km (meist „nach Restaurierung“) stehen als unbekannt drin.
Zum Aktualisieren die Bestände erneut abrufen und die Datei ersetzen; verkaufte Fahrzeuge fallen dabei heraus.

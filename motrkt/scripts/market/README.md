# Marktwerte: Methode und Aktualisierung

Erzeugt `src/data/real/market-model.json` (Marktwert und Verlauf je Variante), `src/data/real/asks.json` (die
Angebote, die in den Wert eingehen) und `src/data/real/sales.csv` (Auktionsergebnisse). `WORK` ist ein beliebiges
Arbeitsverzeichnis mit den Rohdaten (nicht im Repo). Alles in einem Schritt: `sh update.sh WORK`.

Täglich: `sh daily.sh` holt neue Daten, rechnet mit **heute** als Stichtag (abweichend: `MIP_AS_OF=JJJJ-MM-TT`), prüft
die App und mit `check.py`, dass die Daten nicht geschrumpft sind (Verkäufe mindestens 95 %, Angebote 60 %, Varianten
mit Wert 90 % des letzten Stands; sonst Abbruch ohne Änderung), lädt sie in Postgres (falls `DATABASE_URL` gesetzt) und
committet die Datendateien. Die App liest den Stichtag aus `market-model.json`, das Datum „Marktdaten vom …“ stimmt
also immer mit den Daten überein. Händlerbestände in `manual/haendler.csv` werden dabei nicht automatisch erneuert.

Läuft jeden Morgen um 4 Uhr auf GitHub Actions (`.github/workflows/marktdaten.yml`, auch von Hand startbar): dort mit
`MIP_PUSH=1`, der Push löst das Deployment auf Vercel aus. Der Arbeitsordner liegt zwischen den Läufen im Actions-Cache.
Fehlt er, holt der Lauf alles seit 2015 neu (einige Stunden; `batmodels.py` läuft dabei einmal je Bring-a-Trailer-
Modellseite); nur der Preisverlauf der Inserate beginnt dann von vorn. `sales_old.csv` (frühere Verkäufe von Hand:
Mecum, Barrett-Jackson, Iconic, Pressemeldungen) liegt im Repo und wird bei jedem Lauf in den Arbeitsordner kopiert –
Änderungen also hier eintragen.

ultimatecarpage.com beantwortet Abrufe aus Rechenzentren (GitHub Actions) mit einer Cloudflare-Bot-Abfrage; die wird
nicht umgangen. `ucpfetch.sh` bricht dann nach der ersten Abfrage ab, und `ucpparse.py` nimmt die Auktionen aus
`ucp-snapshot.json` (Stand 13.11.2026, alle Porsche-Lose, dazu je Los nur das Währungszeichen der übrigen für die
Währung der Auktion). Neue ultimatecarpage-Auktionen kommen nur bei Abrufen von einem normalen Anschluss hinzu; die
Ergebnisse von RM Sotheby's, Gooding, Broad Arrow und Artcurial holt das Update ohnehin direkt bei den Häusern.

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
| `EU_AUC` / `US_AUC` | Auktionshäuser direkt: RM Sotheby's, Bonhams, Gooding & Company, Broad Arrow, Artcurial (nur verkaufte Lose; unverkaufte veröffentlicht Artcurial nicht) – mit Lotseite, Fahrgestellnummer und Laufleistung (falls genannt); ersetzen dieselben Lose von ultimatecarpage (gleiche Fahrgestellnummer ±7 Tage, sonst Variante, Datum und Preis). Bonhams: Name der Auktion und Laufleistung fehlen, solange Bonhams diese Abfragen mit einer Bot-Abfrage beantwortet (wird nicht umgangen) | `rmfetch.py`, `bonhamsfetch.py`, `goodingfetch.py`, `broadarrowfetch.py`, `artcurialfetch.py` |
| `EU_ASK` Angebote Europa | Classic Trader (Händler und privat, Linkslenker, Standort Europa) | `ctfetch.py` + `ctparse.py` |
| `EU_ASK` / `EU_AUC` | von Hand: mobile.de, Elferspot, Kleinanzeigen, Händler und Auktionshäuser in Europa | `manual/*.csv`, siehe `manual/README.md` |
| `US_AUC` Auktionen USA | RM Sotheby's, Gooding, Broad Arrow … (Saalauktionen, Verkäufe in USD); von Hand: Verkäufe und Auktionsergebnisse von US-/kanadischen Händlern und Häusern | `rmfetch.py`, `goodingfetch.py`, `ucpfetch.sh`, `manual/*.csv` |
| `US_AUC` Barrett-Jackson | alle Porsche-Lose seit 2015 mit Lotseite, Fahrgestellnummer und Laufleistung aus der Ergebnissuche der Website (rund 5 Abrufe je Lauf). Lose mit Mindestpreis bleiben weg: die Seite führt auch unverkaufte als „Sold“ zum Höchstgebot plus 10 %; sie kommen weiter aus Hammer Price | `barrettfetch.py` |
| `US_AUC` GAA Classic Cars | alle Porsche-Lose der Ergebnisseiten (seit 2016) mit Lotseite und Fahrgestellnummer, unverkaufte mit Höchstgebot; ein Abruf alle 10 Sekunden (Crawl-delay der Seite), täglich 4 Listenseiten. GAA nennt den Zuschlag ohne Aufgeld, `build.py` schlägt es auf (7 %, ab 2023 8 %). Der Tag einiger Auktionen 2016–2022 ist aus GAAs üblichem Kalender geschätzt (bis etwa eine Woche daneben) | `gaafetch.py` |
| `US_PCM` PCARMARKET | alle beendeten Porsche-Auktionen seit März 2019 (ältere führt die Seite nicht), verkauft und unverkauft mit Höchstgebot; Fahrgestellnummer und Laufleistung von der Auktionsseite, je Lauf höchstens 600 neue. Eigener Kanal mit eigenem Abstand: PCARMARKET verkauft dieselben Varianten rund 7 % unter Bring a Trailer (315 Varianten-Jahre verglichen, November 2026). Gewicht gedeckelt wie bei Bring a Trailer | `pcarfetch.py` |
| `US_ONL` Online-Auktionen USA | Bring a Trailer (von Hand auch Cars & Bids): eigene Quelle mit eigenem Abstand, damit die größte Plattform den Abstand der Saalauktionen nicht verwischt | `batfetch.py` |
| `US_ASK` Angebote USA | von Hand: Angebote von US-/kanadischen Händlern | `manual/*.csv` |
| alle Auktionskanäle | Hammer Price (App, mit schriftlicher Erlaubnis von Hand ausgelesen, Baujahre 1948–2026): Verkäufe und Höchstgebote vieler Häuser, auch solcher, die wir nicht abrufen können (Mecum vor 2023, Barrett-Jackson, Historics, COYS …). Ein Los, das wir schon vom Haus haben (gleiches Haus, Datum ±14 Tage, gleiche Losnummer und gleiches Baujahr bzw. Variante, oder bei Verkäufen Variante und Preis auf 2 % gleich), wird nicht doppelt gezählt; die Daten des Hauses gelten, Hammer Price ergänzt nur das Höchstgebot. Verkäufe in Japan und Saudi-Arabien stehen in der Liste, gehen aber nicht in den Marktwert ein. Nennt die App nur „911“, „911 Targa“ o. ä., ordnet `by_year` nach Baujahr zu, wo nur ein Serienmodell in Frage kommt (1978–1983 911 SC, 1984–1988 Carrera 3.2, 1986–1988 924 S); der Titel bleibt wie in der App. Jede Korrektur (Währung, Datum, Preis 0) steht in der Spalte `hinweis` | `hammerprice.csv` + `hammerprice.py` (in `build.py`) |
| `EU_BID` / `US_BID` Höchstgebote | Höchstgebote unverkaufter Lose (Hammer Price, Bring a Trailer) | wie oben |
| Loslinks und Fotos | Ergebnisse aus ultimatecarpage und Hammer Price ohne eigene Losseite werden mit den Loslisten der Häuser verknüpft (gleiches Haus, Losnummer, Tag ±3, Baujahr): Bonhams, RM Sotheby's (auch Auctions America), Mecum, Iconic, Artcurial. Ergebnis: Link zur Losseite und, wo die Liste es nennt, das Hauptfoto (Spalte `bild` in `sales.csv`). Weitere Fotos liest die App beim Öffnen von der Losseite (`server/lotPhotos.ts`). Ändert keine Preise | `lotlinks.py` (in `build.py`), `manual/bonhams-lose.json` |

Nicht automatisch abrufbar (geprüft am 10. November 2026): mobile.de (Such- und Inseratsseiten per robots.txt gesperrt;
für die offizielle Search API braucht es Zugangsdaten von mobile.de, der Client liegt schon in `server/mobilede.ts`),
Kleinanzeigen (Nutzungsbedingungen verbieten Crawler ohne schriftliche Zustimmung), Elferspot, Classic Driver, Dyler,
Cars & Bids (Bot-Schutz), Catawiki, Car & Classic, Coys (sperren Abrufe), AutoScout24, Collecting Cars,
Dorotheum, Hemmings (sperren KI-Crawler ausdrücklich).
Diese Sperren werden nicht umgangen. Häuser, deren robots.txt Abrufe ausschließt, rufen wir nur mit ihrer Zustimmung
ab (im Kopf des jeweiligen Abrufskripts vermerkt): Mecum, Aguttes, seit 18. November 2026 Barrett-Jackson,
PCARMARKET und GAA Classic Cars. Auch mit Zustimmung nicht abrufbar (geprüft am 18. November 2026), weil die Seiten jede Anfrage mit einer
Bot-Abfrage beantworten: Historics Auctioneers (JavaScript-Rätsel), Kruse Auctions (früher Worldwide Auctioneers,
Cloudflare) und H&H (Cloudflare). Dafür müsste das Haus unseren Abruf freischalten oder die Ergebnisse als Datei
liefern; bis dahin kommen sie aus Hammer Price.

**Preise immer mit Aufgeld**, also was der Käufer zahlt – so veröffentlichen es die Häuser (RM Sotheby's, Bonhams,
Gooding, Broad Arrow, Mecum, Iconic, Artcurial, Aguttes; Osenat ab 2017, davor aus den Verkaufsbedingungen
aufgeschlagen) und so führt es Hammer Price mit „Include Buyer Premiums“. Bring a Trailer zeigt bei „Sold for“ den
Zuschlag ohne Käufergebühr; `build.py` schlägt sie auf (5 %, mindestens 250, höchstens 5.000, ab 2024 7.500; Verkäufe
in EUR/GBP mit denselben Zahlen). PCARMARKET zeigt ebenfalls das Gebot ohne Gebühr; `build.py` schlägt sie auf (5 %,
mindestens 500, höchstens 5.000 USD, für Auktionen nach dem 27. Juni 2025 7.500). Barrett-Jackson veröffentlicht mit
Aufgeld (Zuschlag × 1,10). GAA Classic Cars nennt den Zuschlag; `build.py` schlägt 7 % auf, ab 2023 8 %. Der Zuschlag von der Seite bleibt in `sales.csv` als `zuschlag_original` erhalten.
Höchstgebote unverkaufter Lose bleiben ohne Aufgeld; ihr Abstand wird als eigener Kanal gemessen.

Jeder Titel wird per `classify.py` genau einer Variante zugeordnet oder verworfen (Umbauten, Replikas, Teile, nicht
eindeutige Modelle, „Re-Creation“, DP-Umbauten). Sondermodelle, die nur den Namen einer Serienvariante tragen, zählen
nicht für diese Variante: Prototypen, Werks-GT- und Rennversionen (IMSA, SCCA, T/R, 914/6 GT und M471, N-GT bzw. N/GT, GT3-R),
Club Coupé, 964 Carrera 4 Leichtbau, CTR sowie Tuning- und Karosserieumbauten.
Steht im Titel ein Hubraum, muss er zur Variante passen („911 S 2.2“ ist der 2.2 S, auch mit Baujahr 1969; „930 3.3“
von 1977 oder „Turbo 3.4L“ sind Umbauten und fallen weg). Nennt der Titel „997.2“, „(991.2)“ o. ä., entscheidet das
am Generationswechsel, sofern das Baujahr in die Bauzeit dieser Variante fällt (`variant_years.json`, aus dem Katalog);
sonst gilt das Baujahr. „Turbo“ im Titel einer Variante ohne Turbo, Boxster oder Cayman bei einer 911-Variante und
Tuner-Motoren werden verworfen. Schreibweisen wie „Carrera 2S“, „Carrera 4 S“, „Turbo 'S'“, „Boxster 3.2 S“, „GT4RS“
werden dem richtigen Modell zugeordnet. Preise werden zum EZB-Kurs des Tages in EUR umgerechnet.

## Modell (`model.py`)

    log p = a_v + f_g(t) + δ_c,k + λ_v(t)·d_v(t) + e

1. **Zeitindex** `f_g` je Marktsegment aus allen Auktionsergebnissen (kernelgewichtete Interquartilsmittel der
   Log-Preise, robust gegen Ausreißer). Damit werden ältere Preise auf heute hochgerechnet. Das Fenster wird bei wenigen
   Verkäufen in kleinen Schritten breiter; mit dem Median und groben Schritten sprang der Index der kleinen Gruppe
   959/Carrera GT/918 in den letzten zwei Wochen um 12 %, ohne dass sich der Markt bewegt hatte. Ebenso der eigene
   Verlauf `d_v` je Variante.
2. **Kanalabstand** `δ`: Für jede Variante mit Preisen in zwei Kanälen wird die Differenz der Mediane gebildet und über
   alle solchen Varianten gepoolt (gewichteter Median). Daraus folgt per gewichteter kleinster Quadrate, um wie viel
   Angebotspreise und US-Ergebnisse im Mittel über bzw. unter den europäischen Auktionsergebnissen liegen. Der
   Abstand der Auktionskanäle (`US_AUC`, `US_ONL`) wird getrennt für Klassiker und moderne Fahrzeuge geschätzt, der
   Angebotsaufschlag (`EU_ASK`, `US_ASK`) gemeinsam für alle (er hängt am Verkaufsweg, nicht an der Baureihe). Dieser
   Abstand wird abgezogen. Ein Kanal ohne Vergleichsvarianten bekommt den Abstand 0 und das Standardgewicht.
3. **Gewicht je Kanal**: Der Kanalmedian einer Variante zählt mit der Präzision `1 / (π/2 · s_c² / n + τ_c²)`. `s_c`
   ist die gemessene Streuung der Einzelpreise des Kanals, `τ_c` die gemessene Streuung des Kanalabstands zwischen den
   Varianten. Für indirekte Belege (US, Angebote) begrenzt `τ_c` das Gewicht – auch tausend US-Verkäufe können den Wert
   einer Variante nicht weiter verschieben, als es der gemessene Unterschied zwischen den Märkten erlaubt. Die drei
   US-Kanäle teilen sich einen gemeinsamen Anteil `US_TAU` = 12 % (Mindestwert, auch wenn weniger gemessen wird):
   Zusammen zählen alle US-Belege einer Variante höchstens mit `1 / US_TAU²`, egal wie viele es sind. Je mehr
   europäische Belege dazukommen, desto kleiner wird damit der US-Anteil, ohne dass US-Daten gelöscht werden.
   **Bring a Trailer** ist mit Abstand die größte Einzelquelle. Damit die Plattform den Wert nicht allein bestimmt,
   werden ihre Belege (Verkäufe und Gebote) je Variante mit einem gemeinsamen Faktor heruntergewichtet, bis sie
   nicht mehr Gewicht haben als das Auktionshaus mit dem größten Gewicht für diese Variante (Gewicht aus der Zahl
   seiner Belege wie oben). Untergrenze ist das Gewicht von 5 Verkäufen (`BAT_FLOOR`), damit dort, wo andere Häuser
   die Variante nur ein- oder zweimal verkauft haben, nicht ein einzelner Verkauf den Wert setzt. Ohne anderes
   Auktionshaus behält Bring a Trailer sein volles Gewicht. Der Faktor steht je Variante als `batWeight` in
   `market-model.json`.
4. **Aktualität**: Innerhalb eines Kanals zählen jüngere Preise mehr (Gewicht `exp(−Alter/2 Jahre)`).
   **Standzeit der Angebote**: Ein Angebot zählt voll, solange das Auto bis zu 90 Tage angeboten wird
   (`STALE_DAYS`). Steht es länger unverkauft im Netz, ist es vermutlich über dem Markt bepreist: Sein Gewicht halbiert
   sich je weitere 180 Tage (`STALE_HALF`), höchstens bis auf ein Viertel (`STALE_MIN`). Ein Inserat, das offline
   gegangen ist (vermutlich verkauft), zählt mit seinem letzten Preis voll. Classic Trader nennt kein Einstelldatum,
   nummeriert die Inserate aber fortlaufend. `ctfetch.py` leitet deshalb aus den Sitemaps (`lastmod` aller
   Inserate, jeder Marke) je Nummer das späteste mögliche Einstelldatum ab und sammelt es in
   `WORK/web/ct/listed.json`. Die Standzeit ist damit eher unter- als überschätzt. Ein neu eingestelltes Auto, das
   schon einmal inseriert war, gilt ab dem ersten Inserat. Für Inserate in `manual/*.csv` zählt `datum` als
   Einstelltag.
5. **Eigener Verlauf** ab 12 Belegen (zum Segmentindex hin geschrumpft), sonst folgt die Kurve dem Segment.
6. **Unplausible Preise raus**: Classic-Trader-Inserate, die laut Inserat Nachbau, Umbau, Rennwagen, Projekt-,
   Teile- oder Unfallfahrzeug sind (Merkmale `isReplica`/`isConverted`/`isRacingCar` und Titel/Beschreibung des
   Verkäufers, `ctparse.py`), gehen nicht ein. Danach fällt jeder Preis heraus, der weiter als 2 × die gemessene
   Streuung seiner Quelle vom Niveau der Variante entfernt liegt, höchstens Faktor 2 (`OUT_K`, `OUT_MAX`). Nach oben
   bleibt ein Preis in jedem Fall drin, solange er höchstens 125 % über dem Niveau vergleichbarer Fahrzeuge liegt
   (`OUT_UP`; bei stark streuenden Varianten bis Faktor 3 wie bisher), damit Ausnahmefahrzeuge mit wenig Kilometern oder besonderer Herkunft in den Wert eingehen. Die
   App zeigt alle ausgeschlossenen Belege mit Grund.
7. **Höchstgebote unverkaufter Lose** (`EU_BID`, `US_BID`): Ein Gebot zeigt, was mindestens ein Käufer zu zahlen
   bereit war, liegt aber meist unter dem Preis, zu dem verkauft wird. Es geht als eigener Kanal ein; sein Abstand zu
   den Verkäufen wird wie bei den anderen Kanälen gemessen und abgezogen (je Klassiker/moderne Fahrzeuge), `US_BID`
   teilt sich den US-Anteil. Wird dasselbe Fahrzeug (Haus, Variante, Titel) binnen 400 Tagen erneut angeboten und
   liegt der spätere Preis bzw. das spätere Gebot höchstens 30 % entfernt, zählt nur der spätere Beleg. Gebote gehen
   nicht in den Zeitindex und nicht in den Verlauf der Variante ein und zählen nicht für die Mindestzahl. Sie
   korrigieren den Wert nur schwach: zusammen höchstens 8 % Gewicht (`BID_SHARE`) und nie mehr als 3 % Änderung
   (`BID_MAX`), wie viele Gebote es auch gibt.
8. **Mindestens 3 Belege** (Verkäufe oder Angebote) für einen Marktwert. Darunter zeigt die App keinen Wert, keinen Verlauf und keine
   Empfehlung, sondern nur die Einzelbelege. Ausnahme sind die seltensten Varianten (`EARLY_RESULTS` in `classify.py`,
   derzeit der 911 GT1 Straßenversion): ihnen reicht ein Verkauf seit 2015, fortgeschrieben mit dem Index ihres Segments.
   Die App nennt dann, auf wie wenigen Verkäufen der Wert beruht. Ihre Ergebnisse vor 2015 stehen in der Liste, zählen
   aber nicht zum Wert.

Alle Zwischenergebnisse (Abstände, Streuungen, Gewichte, Kanalanteile je Variante) stehen in `market-model.json` und
werden in der App unter „Belege für den Marktwert“ angezeigt.

## Prüfen

`report.py WORK src/data/real/market-model.json` und `show.py WORK <variante> [n]` für die Einzelverkäufe einer
Variante.

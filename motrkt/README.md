# MIP – Marktintelligenz für Sportwagen

Web-App für Marktwerte, Auktionen, Inserate und Sammlungsportfolios von Sportwagen, vom Klassiker bis zum Neuwagen (Porsche).

## Starten

Braucht Postgres (Konten, Sitzungen und Marktdaten). Lokal z. B. mit Homebrew:

```bash
brew services start postgresql@18 && createdb mip
cp .env.example .env     # DATABASE_URL=postgres://localhost:5432/mip
npm install
npm run db:migrate       # Tabellen anlegen (db/migrations)
npm run db:import        # Marktdaten aus src/data/real laden
npm run dev              # http://localhost:5173
npm test                 # Vitest: *.test.ts in src/ und server/ (läuft auch in der CI vor dem Build)
```

Produktion:

```bash
npm run build
npm start            # http://localhost:4173 (PORT überschreibbar)
```

## Anmeldung

Ohne Anmeldung liefert der Server nur die Anmeldeseite (`/anmelden`): App, Marktdaten und API bleiben gesperrt. Dort
lässt sich auch ein eigenes Konto mit Benutzername und Passwort anlegen; man bleibt dauerhaft angemeldet (die Sitzung
läuft ein Jahr und verlängert sich bei jedem Besuch), bis man sich abmeldet.

**Demo-Konto zum Testen:** Benutzername `demo`, Passwort `turbo-carrera-8987`

Das Demo-Konto ist bei `npm run dev` immer aktiv (abschalten mit `MIP_DEMO_ACCOUNT=0`). Weil dieses Repository
öffentlich ist, ist es im Produktionsserver aus und wird dort nur mit `MIP_DEMO_ACCOUNT=1` eingeschaltet.

Konten und Sitzungen liegen in Postgres (`db/migrations/002_accounts.sql`). Gespeichert werden nur ein scrypt-Hash je
Passwort und SHA-256-Werte der Sitzungs-Tokens. Nach 8 Fehlversuchen in 15 Minuten wird die Anmeldung für Name bzw.
Adresse kurz gesperrt (ein Name allein erst nach 50 Fehlversuchen von beliebigen Adressen, damit niemand fremde Konten
mutwillig sperren kann). Je Konto gelten außerdem Budgets (`server/limits.ts`, Tabelle `db/migrations/006_rate_limits.sql`):
60 Co-Pilot-Antworten und 600 mobile.de-Abfragen je Stunde, 10 Dokument-Uploads je Tag.

## Premium freischalten: Kaufvertrag oder Wertgutachten (Portfolio, `/portfolio#melden`)

Nutzer belegen ein Auto mit einem Dokument (PDF oder Foto, höchstens 4 MB) und erhalten nach der Freigabe Premium.
Zwei Wege, beide im Abschnitt „Premium freischalten“ auf der Portfolio-Seite (`src/components/portfolio/UserCars.tsx`,
auch über das Kontomenü erreichbar, `/fahrzeug-melden` leitet dorthin; in der Bestandstabelle startet das Symbol
neben „Bearbeiten“ das Formular mit den Angaben des Fahrzeugs):

- **Kaufvertrag** (`kind = 'kaufvertrag'`): ein Auto, das der Nutzer gekauft oder verkauft hat. Der geprüfte Preis geht
  in die Marktwerte ein.
- **Wertgutachten** (`kind = 'gutachten'`): ein Auto im Besitz des Nutzers, bewertet von Classic Data, TÜV, DEKRA, GTÜ
  oder einem Sachverständigen. Zusätzliche Felder: Organisation des Gutachters, Art des Werts (Marktwert,
  Wiederbeschaffungs- oder Wiederherstellungswert), Zustandsnote. Ein Gutachtenwert ist kein Verkaufspreis:
  `scripts/db/export-user-cars.ts` lässt ihn aus, das Marktmodell sieht ihn nicht.

Der Ablauf ist für beide gleich; unten steht er für den Kaufvertrag.

1. **Daten**: Variante, Bezeichnung, Baujahr, Fahrgestellnummer, Kilometerstand, Preis mit Währung, Vertragsdatum,
   Land, Gegenseite (privat, Händler, Auktion), dazu optional Karosserie, Getriebe, Lenkung, Farben, Zustandsnote,
   Matching Numbers, Unfallfreiheit und Anmerkungen. Der Nutzer willigt in Speicherung, Prüfung und Verwendung ein;
   Zeitpunkt und Fassung des Textes werden gespeichert (`consent_at`, `consent_version`). Der Vertrag darf geschwärzt
   sein, solange Fahrzeug, FIN, Preis und Datum lesbar bleiben, und wird verschlüsselt gespeichert
   (`server/contractVault.ts`, AES-256-GCM, Schlüssel `MIP_CONTRACT_KEY`).
2. **KI-Vorprüfung** (`server/contractCheck.ts`, läuft nach dem Upload im Hintergrund), nur wenn der Nutzer das
   zusätzliche Häkchen gesetzt hat (`ai_consent`): Claude liest den Vertrag und vergleicht ihn mit den Angaben
   (Fahrzeug, FIN, Preis, Datum, Kilometer, Verkäufer). Ergebnis: passt, Abweichungen, unklar oder kein Kaufvertrag,
   dazu Auffälligkeiten. Braucht `ANTHROPIC_API_KEY`; ohne Häkchen oder ohne Schlüssel prüft der Prüfer von Hand.
3. **Prüfung** (`/pruefung`, nur für Prüfer): Angaben, Vertrag und KI-Ergebnis nebeneinander. Der Prüfer kann
   Variante, Preis, Datum, Kilometer und Baujahr nach dem Vertrag korrigieren, dann freigeben oder mit Begründung
   ablehnen. **Beide Entscheidungen löschen den Vertrag**; danach bleiben nur die geprüften Fahrzeugdaten. Jedes
   Öffnen und jede Entscheidung steht mit Prüfer und Zeit in `contract_access`. **Ohne Entscheidung wird das
   Dokument 24 Stunden nach dem Hochladen gelöscht** (Status „Dokument gelöscht“, `expired`); der Nutzer lädt es dann
   an derselben Meldung erneut hoch. Prüfer sollten also täglich hineinsehen; die Prüfseite zeigt die Restzeit.
4. **Freigabe**: Der Nutzer erhält 12 Monate Premium (`users.premium_until`, verlängert sich bei jeder weiteren
   Freigabe). Ein Bezahlbereich existiert noch nicht, bis dahin sieht jeder alles.
5. **Analyse**: Der tägliche Lauf (`daily.sh`) exportiert die freigegebenen Fahrzeuge aus Postgres
   (`scripts/db/export-user-cars.ts`) ohne FIN und ohne Nutzer in eine temporäre Datei, die `model.py` wie einen
   dokumentierten Verkauf liest (Quelle „Carbay-Nutzer (Kaufvertrag geprüft)“). Danach gelten die üblichen Regeln
   (Ausreißer, Gewichtung). Die Daten landen nicht im öffentlichen Repository und nicht im Actions-Cache.

**Löschen:** Der Nutzer kann jede Meldung selbst löschen. Eine freigegebene wird dabei nur vom Konto gelöst (ohne FIN,
Notizen und KI-Ergebnis) und bleibt anonym im Modell; das dafür gewährte Premium entfällt (es bleibt, was andere freigegebene Meldungen ergeben). Ohne Zutun gelten die Fristen in `RETENTION` (`server/userCars.ts`):
hochgeladene Dokumente 24 Stunden (auf Supabase löscht sie ein pg_cron-Lauf alle 15 Minuten, angelegt von
`db/migrations/011_appraisals.sql`; `sweepUserCars` tut dasselbe bei Seitenaufrufen), Meldungen ohne Dokument nach
30 Tagen, abgelehnte und abgelaufene Meldungen 90 Tage nach der Entscheidung. Das geteilte Demo-Konto kann keine Fahrzeuge melden.

Prüfer sind die Benutzernamen in `MIP_ADMINS` (kommagetrennt). Nur der Vite-Entwicklungsserver (`npm run dev`) macht
zusätzlich das Demo-Konto zum Prüfer; `npm start` und Vercel nie, auch nicht über `MIP_ADMINS`, weil das Passwort
öffentlich ist. Tabelle: `db/migrations/004_user_cars.sql`, `011_appraisals.sql`.

## Konto, Impressum, Datenschutz

Unter `/konto` ändern Nutzer ihr Passwort (andere Browser werden abgemeldet), laden alle zu ihrem Konto gespeicherten
Daten als JSON herunter und löschen ihr Konto (Sitzungen, gespeicherte Daten, Zähler und alle nicht freigegebenen
Meldungen samt Verträgen werden gelöscht; freigegebene Fahrzeuge ohne FIN und Forumsbeiträge bleiben ohne
Kontobezug). Das Demo-Konto kann nichts davon. Beim Abmelden löscht die App ihre Kopie der Kontodaten aus dem
Browser, damit der Nächste am selben Gerät sie weder sieht noch in sein Konto übernimmt.

**Datenschutz:** [`DATENSCHUTZ.md`](DATENSCHUTZ.md) hält fest, was verarbeitet wird (Verzeichnis nach Art. 30 DSGVO),
welche Schutzmaßnahmen der Code umsetzt und was der Betreiber noch selbst erledigen muss (Schlüssel, AV-Verträge,
Betreiberangaben). Die App lädt nichts von Dritten nach außer Fotos von Inseraten und Auktionslosen: keine Analyse,
keine Werbung, Schriften aus `public/fonts` statt von Google Fonts, ein einziges notwendiges Cookie und deshalb kein
Cookie-Banner. Auf Supabase ist für alle Tabellen Row Level Security eingeschaltet
(`db/migrations/010_row_level_security.sql`); **neue Tabellen brauchen dieselbe Zeile.** Impressum und Datenschutzerklärung (`/impressum`, `/datenschutz`) zeigen die Texte aus `src/legal.ts`; ohne
Sitzung liefert sie der Server als eigene Seiten (`server/legalPages.ts`), damit sie von der Anmeldeseite aus
erreichbar sind. **Vor der Veröffentlichung `OPERATOR` in `src/legal.ts` ausfüllen** – solange Angaben fehlen,
zeigen beide Seiten einen Warnhinweis.

Fehler im Browser (Rendering, unbehandelte Ausnahmen) meldet die App an `/api/fehler`; der Server protokolliert sie,
auf Vercel stehen sie in den Runtime-Logs. Live-Inserate von mobile.de werden erst geladen, wenn eine Seite sie
zeigt (Kaufen, Modellseite), nicht beim App-Start.

## Forum je Modell

Ganz unten auf jeder Modellseite (`/markt/:variante#forum`) tauschen sich angemeldete Nutzer in Themen aus: Thema mit
erstem Beitrag eröffnen, antworten, lesen. Wer ein Auto dieser Variante mit geprüftem Kaufvertrag oder Wertgutachten gemeldet hat, trägt
das Abzeichen „Besitzer“. Autoren bearbeiten und löschen eigene Beiträge, andere melden Beiträge an die Prüfer
(`/pruefung` zeigt gemeldete Beiträge mit Begründung), Prüfer (`MIP_ADMINS`) blenden Beiträge und ganze Themen aus;
die Zeilen bleiben mit `hidden_at` in der Datenbank. Je Nutzer und Stunde höchstens 30 Beiträge und 5 Themen; Themen
werden seitenweise (30) geladen. `/forum` zeigt die zuletzt bewegten Themen aller Modelle (Eintrag im Menü), Links
öffnen das Thema auf der Modellseite (`?thema=<id>#forum`); die Suche findet Themen nach Titel, Inserate nach
Titel, Anbieter oder Ort, Händler (alle ihre Inserate auf Kaufen) und Auktionshäuser (ihre Ergebnisse auf
Auktionen, `?haus=`). Server: `server/forum.ts`, Tabellen: `db/migrations/005_forum.sql`, `008_forum_reports.sql`.

## Konfiguration (`.env`)

`.env.example` nach `.env` kopieren und ausfüllen, danach `npm run dev` neu starten:

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres für Konten, Sitzungen und Marktdaten (auf Vercel auch `POSTGRES_URL`) |
| `ANTHROPIC_API_KEY` | AI Co-Pilot und KI-Vorprüfung der Kaufverträge und Wertgutachten mit Claude (ohne: lokaler Analysemodus, Dokumente von Hand prüfen) |
| `MIP_ADMINS` | Benutzernamen der Prüfer für gemeldete Fahrzeuge, kommagetrennt |
| `MIP_TRUST_PROXY` | `1`, wenn `npm start` hinter einem eigenen Reverse-Proxy (nginx, Caddy) läuft: Client-Adresse für die Anmeldebremse aus `X-Forwarded-For`; auf Vercel nicht nötig |
| `MOBILEDE_USERNAME`, `MOBILEDE_PASSWORD` | Live-Inserate über die offizielle [mobile.de Search API](https://services.mobile.de/docs/search-api.html) (Zugang über den mobile.de-Kundenservice) |

Angezeigte Marken: `src/config.ts` (`ENABLED_BRANDS`, aktuell nur Porsche).

## Veröffentlichen (Vercel)

`vercel.json` leitet jede Anfrage an eine Funktion (`api/server.ts` → `server/app.ts`): Anmeldeseite, APIs und die
gebaute App. Die App liegt nur in der Funktion, nicht öffentlich im CDN; öffentlich ausgeliefert werden nur `public/`
(Favicon, Fotos). Region Frankfurt (`fra1`).

Die Marktdaten (`market-model.json`, `asks.json`, `listing-history.json`, `sales.csv`) stecken nicht im Skript: der
Build legt sie mit Inhalts-Hash unter `dist/data/` ab (brotli/gzip daneben), `index.html` trägt das Manifest in
`<meta name="mip-data">`, und `src/main.tsx` lädt die vier Dateien parallel zum Code, bevor die App startet
(`src/data/real/load.ts`, `dataset.ts`). Browser behalten die Daten ein Jahr, bis sich der Hash ändert; Code-Updates
laden sie nicht neu. Im Dev-Server kommen sie direkt aus `src/data/real`.

1. Vercel-Projekt mit diesem Repository verbinden, **Root Directory `motrkt`**, Node.js 24.
2. Postgres über den Vercel Marketplace anlegen (Neon oder Supabase, Region Frankfurt); setzt `DATABASE_URL` bzw.
   `POSTGRES_URL` im Projekt.
3. Weitere Umgebungsvariablen: `ANTHROPIC_API_KEY`, optional `MOBILEDE_USERNAME`/`MOBILEDE_PASSWORD`, `MIP_DEMO_ACCOUNT=1`.
4. Einmal Tabellen anlegen und Marktdaten laden, mit der Datenbank-URL von Vercel:
   `DATABASE_URL=… npm run db:migrate && DATABASE_URL=… npm run db:import`
5. Deployen (Push auf `main` oder `vercel --prod`).

Das tägliche Update (`scripts/market/daily.sh`) lädt neue Marktdaten in die Datenbank, wenn `DATABASE_URL` gesetzt ist.

## mobile.de

Der Server ruft die Search API mit Basic Auth ab (Zugangsdaten bleiben serverseitig, Antworten 20 Minuten gecacht). Pro Baureihe wird nach Marke/Modell-Code und Erstzulassung gesucht; der Browser ordnet jedes Inserat anhand des Titels einer Variante zu. Auf **Kaufen** lässt sich zwischen „mobile.de live“ und „Demo“ umschalten. Scraping von mobile.de ist laut AGB § 11 untersagt – nur die API wird genutzt.

## AI Co-Pilot

Der Co-Pilot nutzt Claude Haiku 5.5 (`claude-haiku-5-5`) über den Server-Endpunkt `/api/copilot`; der API-Key bleibt serverseitig.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Ohne Zugangsdaten antwortet ein lokaler Analysemodus, der Ausblick, Variantenvergleich, Kaufrisiko, Auktionstrends und Portfolio direkt aus den Marktdaten berechnet.

## Bereiche

| Route | Inhalt |
|---|---|
| `/` | Marktüberblick: Gesamtindex, Markenindizes, Gewinner/Verlierer, bemerkenswerte Verkäufe |
| `/markt/:variante` | Detailansicht einer Variante (Wertentwicklung, Seltenheit, Optionen, Verkäufe, Empfehlung, Co-Pilot, Forum) |
| `/modelle` | Katalog mit Filtern, Tabellenansicht und Vergleich (bis 4 Varianten) |
| `/auktionen` | Durchsuchbare Auktionsergebnisse (ID, FIN, Haus) |
| `/portfolio` | Bestand, Wertentwicklung, Allokation, Watchlist, Preisalarme, CSV-Export |
| `/insights` | Marktzyklus, Heatmap, Segmente, Rendite-Risiko-Streudiagramme |
| `/kaufen` | Aktuelle Inserate (Classic Trader, Händlerseiten, optional mobile.de) mit Deal-Score gegenüber dem fairen Marktwert, Preissenkungen aus der täglichen Erfassung (Filter „Preis gesenkt“, Preisverlauf im Inserat) |
| `/forum` | Neueste Forumsthemen aller Modelle |
| `/konto` | Passwort, Datenexport, Konto löschen |
| `/ai` | Co-Pilot im Vollbild mit Prompt-Bibliothek |

## Daten

- **Echte Verkäufe:** `src/data/real/sales.csv` (öffentlich berichtete Ergebnisse mit Quellen-URL) bzw. CSV-Import im Kontomenü. Varianten mit ≥ 3 Verkäufen in 24 Monaten werden daraus bewertet („Echte Daten“).
- **Fotos, Präsentationsfarben, Spezifikationen:** `src/data/real/*.json` und `public/cars/` (Wikimedia Commons, freie Lizenzen, siehe `/bildnachweise`). Recherche-Helfer: `scripts/commons.py`.
- **Marktwert:** nur tatsächlich bezahlte Preise aus Auktionen (Europa voll, USA umgerechnet und begrenzt), dazu schwach gewichtete Höchstgebote unverkaufter Lose und geprüfte Käufe der Nutzer. Angebote von Händlern und Privatleuten zählen derzeit nicht (`ASKS_IN_VALUE` in `scripts/market/model.py`); sie werden weiter angezeigt und nur auf Plausibilität geprüft.
- **Inserate:** die echten Angebote aus `src/data/real/asks.json` (Classic Trader und Händlerseiten), die am letzten Erfassungstag noch online waren, ohne Nachbauten, Umbauten, Unfallwagen und unplausible Preise. Angaben, die die Quelle nicht nennt (Zustand, Farbe, FIN), bleiben leer.
- Watchlist, Portfolio, Preisalarme, gemerkte Inserate und gelesene Benachrichtigungen liegen je Konto in Postgres
  (`user_state`, `db/migrations/007_user_state.sql`, `server/userState.ts`) und folgen dem Konto auf jedes Gerät; der
  Browser hält eine Kopie im `localStorage`. Beim Laden gewinnt die Server-Kopie, jede Änderung wird nach kurzer
  Verzögerung hochgeladen. Das Demo-Konto und der Chatverlauf bleiben nur im Browser.

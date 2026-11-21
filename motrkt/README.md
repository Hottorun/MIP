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

Ohne Anmeldung ist man Gast: Die App öffnet sich mit den Lite-Daten (Katalog, Marktwerte, Angebote, Auktionskalender,
Forum zum Lesen ohne Benutzernamen). Watchlist, Preisalarme, Portfolio, gemerkte Inserate und Schreiben im Forum fragen
nach einem kostenlosen Konto (`useNeedsAccount` in `src/lib/plan.tsx`); die vollständigen Daten bleiben Premium. Auf der
Anmeldeseite (`/anmelden`, mit `?neu` gleich auf „Konto anlegen“) legt man ein Konto mit Benutzername, E-Mail-Adresse und
Passwort an; es entsteht erst, wenn der 6-stellige Code aus der Mail an diese Adresse eingegeben ist (Versand über
Resend, `server/mail.ts`; lokal ohne `RESEND_API_KEY` steht der Code im Server-Log). Man bleibt dauerhaft angemeldet (die Sitzung läuft ein Jahr und verlängert sich bei jedem Besuch), bis man
sich abmeldet.

**Passwort vergessen:** „Passwort vergessen?“ auf der Anmeldeseite (`/anmelden?vergessen` öffnet gleich dort) nimmt
Benutzername oder E-Mail-Adresse und schickt einen Link an die Adresse des Kontos (`POST /api/auth/forgot`). Die Antwort
ist immer dieselbe und geht hinaus, bevor das Konto gesucht wird; je Konto gibt es höchstens 10 Links am Tag. Wer noch
angemeldet ist, fordert den Link unter `/konto` an („Passwort vergessen? Link per E-Mail senden“,
`POST /api/auth/password/forgot`). Der Link (`/passwort-neu#<Schlüssel>`) gilt eine Stunde und einmal; die Seite prüft
ihn beim Öffnen (`POST /api/auth/reset/check`), nennt das Konto und führt bei einem abgelaufenen Link direkt zum Anfordern
eines neuen. Mit dem neuen Passwort (`POST /api/auth/reset`) ist man angemeldet, alle anderen Geräte sind abgemeldet,
und an die Adresse des Kontos geht ein Hinweis, dass das Passwort geändert wurde (ebenso nach einer Änderung unter
`/konto`). Lokal ohne `RESEND_API_KEY` stehen Link und Hinweis im Server-Log.

**Demo-Konto zum Testen:** Benutzername `demo`, Passwort `turbo-carrera-8987`

Das Demo-Konto ist bei `npm run dev` immer aktiv (abschalten mit `MIP_DEMO_ACCOUNT=0`). Weil dieses Repository
öffentlich ist, ist es im Produktionsserver aus und wird dort nur mit `MIP_DEMO_ACCOUNT=1` eingeschaltet.

Konten und Sitzungen liegen in Postgres (`db/migrations/002_accounts.sql`). Gespeichert werden nur ein scrypt-Hash je
Passwort und SHA-256-Werte der Sitzungs-Tokens. Nach 8 Fehlversuchen in 15 Minuten wird die Anmeldung für Name bzw.
Adresse kurz gesperrt (ein Name allein erst nach 50 Fehlversuchen von beliebigen Adressen, damit niemand fremde Konten
mutwillig sperren kann). Je Konto gelten außerdem Budgets (`server/limits.ts`, Tabelle `db/migrations/006_rate_limits.sql`):
60 Co-Pilot-Antworten und 600 mobile.de-Abfragen je Stunde, 10 Dokument-Uploads je Tag.

## Premium freischalten: Kaufvertrag oder Kauf (Portfolio, `/portfolio#melden`)

Zwei Wege führen zu Premium, beide im Abschnitt „Premium freischalten“ auf der Portfolio-Seite
(`src/components/portfolio/UserCars.tsx`) und im Premium-Dialog (`src/components/premium/Upgrade.tsx`):

- **Kaufvertrag (kostenlos):** Der Nutzer belegt ein Auto, das er gekauft oder verkauft hat, mit dem Kaufvertrag (PDF
  oder Foto, höchstens 4 MB) und erhält nach der Freigabe 12 Monate Premium. Der geprüfte Preis geht in die Marktwerte
  ein. Ablauf siehe unten.
- **Kauf (Stripe):** einmalige Zahlung für eine feste Laufzeit, kein Abo. Erscheint nur, wenn Stripe eingerichtet ist;
  siehe „Bezahlen“ weiter unten.

Wertgutachten waren bis November 2026 ein weiterer Weg und werden nicht mehr angenommen (kein neues Formular, kein
Upload, keine KI-Prüfung). Früher freigegebene Gutachten (`kind = 'gutachten'`) bleiben im Konto sichtbar und behalten
ihr Premium; ins Marktmodell gingen sie nie ein (`scripts/db/export-user-cars.ts`).

Zum Formular gelangt man auch über das Kontomenü (`/fahrzeug-melden` leitet dorthin); in der Bestandstabelle startet das
Symbol neben „Bearbeiten“ das Formular mit den Angaben des Fahrzeugs.

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
   Freigabe und bei jedem Kauf, `server/premium.ts`).
5. **Analyse**: Der tägliche Lauf (`daily.sh`) exportiert die freigegebenen Fahrzeuge aus Postgres
   (`scripts/db/export-user-cars.ts`) ohne FIN und ohne Nutzer in eine temporäre Datei, die `model.py` wie einen
   dokumentierten Verkauf liest (Quelle „Cartag-Nutzer (Kaufvertrag geprüft)“). Danach gelten die üblichen Regeln
   (Ausreißer, Gewichtung). Die Daten landen nicht im öffentlichen Repository und nicht im Actions-Cache.

**Löschen:** Der Nutzer kann jede Meldung selbst löschen. Eine freigegebene wird dabei nur vom Konto gelöst (ohne FIN,
Notizen und KI-Ergebnis) und bleibt anonym im Modell; das dafür gewährte Premium entfällt (es bleibt, was andere freigegebene Meldungen und Käufe ergeben). Ohne Zutun gelten die Fristen in `RETENTION` (`server/userCars.ts`):
hochgeladene Dokumente 24 Stunden (auf Supabase löscht sie ein pg_cron-Lauf alle 15 Minuten, angelegt von
`db/migrations/011_appraisals.sql`; `sweepUserCars` tut dasselbe bei Seitenaufrufen), Meldungen ohne Dokument nach
30 Tagen, abgelehnte und abgelaufene Meldungen 90 Tage nach der Entscheidung. Das geteilte Demo-Konto kann keine Fahrzeuge melden.

Prüfer sind die Benutzernamen in `MIP_ADMINS` (kommagetrennt). Nur der Vite-Entwicklungsserver (`npm run dev`) macht
zusätzlich das Demo-Konto zum Prüfer; `npm start` und Vercel nie, auch nicht über `MIP_ADMINS`, weil das Passwort
öffentlich ist. Tabelle: `db/migrations/004_user_cars.sql`, `011_appraisals.sql`.

### Bezahlen (Stripe)

Premium lässt sich kaufen, sobald Stripe eingerichtet ist (`server/payments.ts`, Tabellen `db/migrations/014_payments.sql`
und `015_subscriptions.sql`). Ohne die Variablen unten oder ohne die Tabellen bleibt alles wie zuvor: kein Preis, kein
Kaufen-Knopf, der Kaufvertrag ist der einzige Weg.

Der Preis in Stripe entscheidet, was verkauft wird:

- **Wiederkehrender Preis** (pro Monat oder pro Jahr): ein **Abo**. Jede bezahlte Rechnung hält Premium für den
  bezahlten Zeitraum (plus drei Tage Kulanz, falls eine Abbuchung erst beim zweiten Versuch klappt). Es verlängert sich
  von selbst, bis der Nutzer unter `/konto` → „Abo verwalten oder kündigen“ kündigt (Kundenportal von Stripe); Premium
  bleibt dann bis zum Ende des bezahlten Zeitraums. Ein Konto hat höchstens ein Abo. Wer sein Konto löscht, dessen Abo
  endet bei Stripe sofort. Monate aus einem Kaufvertrag zählen nicht obendrauf: es gilt das spätere Datum.
- **Einmaliger Preis**: eine Zahlung für 12 Monate (anderer Wert in den Metadaten des Preises als `months`), nichts
  verlängert sich. Die Monate kommen zu dem hinzu, was noch läuft.

**Monatlich und jährlich nebeneinander:** `STRIPE_PRICE_ID_YEARLY` nennt einen zweiten Preis desselben Produkts, ein
Abo pro Jahr. Die App zeigt dann beide Zeiträume zur Wahl (vorgewählt ist der jährliche, mit der Ersparnis je Monat
in Prozent), und der gewählte Preis geht an die Zahlungsseite. Angeboten wird er nur neben einem Abo-Preis mit
kürzerem Zeitraum in derselben Währung; passt er nicht, steht das im Log und es bleibt beim einen Preis. Ohne die
Variable ändert sich nichts. Soll es nur das Jahresabo geben, genügt der Jahrespreis als `STRIPE_PRICE_ID`.

Für das Jahresabo gilt Nr. 6 der AGB (§ 309 Nr. 9 BGB): Nach dem ersten Jahr ist es jederzeit mit einer Frist von
einem Monat kündbar, der Rest wird anteilig erstattet. Der Code dazu: Eine Kündigung über `/kuendigen` in einem
bereits verlängerten Jahr beendet das Abo bei Stripe einen Monat später (oder zum späteren Wunschdatum) statt zum
Ende des Jahres; die Mail an den Betreiber nennt die Teilerstattung als Aufgabe, **erstatten muss er von Hand**. Das
Kundenportal von Stripe kündigt dagegen immer zum Ende des bezahlten Zeitraums. Endet ein Abo bei Stripe vor dem
Ende des bezahlten Zeitraums, endet Premium mit ihm (Ereignis `customer.subscription.deleted`).

Ablauf: Der Knopf öffnet die Zahlungsseite von Stripe (Checkout, Weiterleitung; die App lädt kein Stripe-Skript und
sieht keine Kartendaten). Nach der Zahlung kommt der Nutzer auf die Seite zurück, von der er kam; der Server fragt die
Zahlung bei Stripe ab und schaltet frei. Derselbe Schritt läuft über den Webhook, falls der Nutzer das Fenster vorher
schließt oder eine Lastschrift erst Tage später eingeht; die Verlängerungen eines Abos kommen nur über den Webhook
(`invoice.paid`). Jede Zahlung zählt genau einmal. Eine volle Erstattung in Stripe nimmt weg, was die Zahlung gab.
Zahlungen stehen unter `/konto` und im Datenexport.

Einrichten:

1. `npm run db:migrate:prod` (Migrationen 014 und 015), **vor** dem Setzen der Variablen. Ohne sie zeigt die App
   keinen Preis.
2. In Stripe ein Produkt „Cartag Premium“ mit einem Preis anlegen: wiederkehrend (monatlich oder jährlich) für ein Abo
   oder einmalig. Betrag inklusive Umsatzsteuer, denn die App zeigt genau diesen Betrag.
3. Webhook anlegen: Endpunkt `https://www.cartag.info/api/stripe/webhook` (mit `www`: `cartag.info` leitet dorthin um,
   und Stripe folgt keinen Weiterleitungen), Ereignisse `checkout.session.completed`,
   `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `customer.subscription.deleted`.
4. Nur beim Abo: in Stripe das Kundenportal einschalten (Einstellungen → Billing → Kundenportal, einmal speichern;
   Kündigen erlauben, am besten „zum Ende des Abrechnungszeitraums“). Ohne das öffnet sich „Abo verwalten“ nicht.
5. In Vercel setzen (Production): `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` (`price_…`), `STRIPE_WEBHOOK_SECRET`
   (`whsec_…`), dazu `MIP_PUBLIC_URL=https://www.cartag.info`. Optional: `STRIPE_PRICE_ID_YEARLY` (Jahresabo neben
   dem Monatsabo, siehe oben), `STRIPE_REQUIRE_TERMS=1` (Käufer muss die in
   Stripe hinterlegten AGB bestätigen), `STRIPE_AUTOMATIC_TAX=1` (Stripe Tax), `STRIPE_PROMO_CODES=1` (Feld für
   Gutscheincodes). Danach neu deployen.
6. Erst mit Testschlüsseln (`sk_test_…`) und der Testkarte 4242 4242 4242 4242 lokal prüfen, dann die Live-Schlüssel
   in Vercel setzen.

Die Anfragen an Stripe nennen eine feste API-Version (`STRIPE_VERSION` in `server/payments.ts`); Ereignisse des
Webhooks liest der Server deshalb nicht aus, sondern fragt das Objekt selbst noch einmal ab.

Lokal testen: die Variablen in `.env`, dann `stripe listen --forward-to localhost:5173/api/stripe/webhook` (Stripe CLI;
gibt das `whsec_…` für `.env` aus). Auch ohne Webhook schaltet die Rückkehr von der Zahlungsseite frei.

Für den Verkauf an Verbraucher gibt es im Code: AGB (`/agb`) und Widerrufsbelehrung mit Widerrufsfunktion (`/widerruf`,
§ 356a BGB), die Kündigungsseite ohne Anmeldung (`/kuendigen`, § 312k BGB; beendet die Verlängerung bei Stripe, wenn die
E-Mail-Adresse zu einem Konto mit Abo gehört) und die Bestellbestätigung per E-Mail mit beiden Texten. Texte in
`src/terms.ts`, Seiten in `server/legalPages.ts`, Verarbeitung in `server/notices.ts`, Tabelle `contract_notices`
(Migration 018). Jeder Widerruf und jede Kündigung geht zusätzlich per Mail an die Adresse im Impressum: erstatten muss
der Betreiber von Hand, binnen 14 Tagen. Nicht Teil des Codes: `VAT` in `src/terms.ts` setzen (Umsatzsteuer oder
§ 19 UStG), Telefonnummer im Impressum, Belegversand in Stripe, AV-Vertrag mit Stripe.
Siehe `DATENSCHUTZ.md`.

## Konto, Impressum, Datenschutz

Unter `/konto` ändern Nutzer ihr Passwort (andere Browser werden abgemeldet; wer das aktuelle vergessen hat, lässt sich dort den Link zum Zurücksetzen schicken), laden alle zu ihrem Konto gespeicherten
Daten als JSON herunter und löschen ihr Konto (Sitzungen, gespeicherte Daten, Zähler und alle nicht freigegebenen
Meldungen samt Verträgen werden gelöscht; freigegebene Fahrzeuge ohne FIN und Forumsbeiträge bleiben ohne
Kontobezug). Das Demo-Konto kann nichts davon. Beim Abmelden löscht die App ihre Kopie der Kontodaten aus dem
Browser, damit der Nächste am selben Gerät sie weder sieht noch in sein Konto übernimmt.

**Datenschutz:** [`DATENSCHUTZ.md`](DATENSCHUTZ.md) hält fest, was verarbeitet wird (Verzeichnis nach Art. 30 DSGVO),
welche Schutzmaßnahmen der Code umsetzt und was der Betreiber noch selbst erledigen muss (Schlüssel, AV-Verträge,
Betreiberangaben). Die App lädt nichts von Dritten nach außer Fotos von Inseraten und Auktionslosen: keine
Werbung, Schriften aus `public/fonts` statt von Google Fonts, ein einziges notwendiges Cookie und deshalb kein
Cookie-Banner. Seitenaufrufe zählt Vercel Web Analytics ohne Cookies (`src/bootstrap.tsx`): nur im gebauten Stand,
Skript und Anfragen laufen über die eigene Adresse (`/_vercel/insights/…`), übermittelt wird die Adresse der Seite
ohne das, was auf `?` oder `#` folgt. Genauso misst Vercel Speed Insights die Ladezeiten (Core Web Vitals,
`/_vercel/speed-insights/…`). Auf Supabase ist für alle Tabellen Row Level Security eingeschaltet
(`db/migrations/010_row_level_security.sql`); **neue Tabellen brauchen dieselbe Zeile.** Impressum und Datenschutzerklärung (`/impressum`, `/datenschutz`) zeigen die Texte aus `src/legal.ts`; ohne
Sitzung liefert sie der Server als eigene Seiten (`server/legalPages.ts`), damit sie von der Anmeldeseite aus
erreichbar sind. **Vor der Veröffentlichung `OPERATOR` in `src/legal.ts` ausfüllen** – solange Angaben fehlen,
zeigen beide Seiten einen Warnhinweis.

Fehler im Browser (Rendering, unbehandelte Ausnahmen) meldet die App an `/api/fehler`; der Server protokolliert sie,
auf Vercel stehen sie in den Runtime-Logs. Live-Inserate von mobile.de werden erst geladen, wenn eine Seite sie
zeigt (Kaufen, Modellseite), nicht beim App-Start.

## Forum je Modell

Ganz unten auf jeder Modellseite (`/markt/:variante#forum`) tauschen sich angemeldete Nutzer in Themen aus. Jedes
Thema liegt in einer Kategorie (Kaufberatung, Technik und Wartung, Markt und Preise, Historie und Originalität, Teile
und Zubehör, Erfahrungen, Allgemein) und ist eine Frage oder eine Diskussion; bei einer Frage markiert der Autor
(oder ein Prüfer) die Antwort, die sie geklärt hat. Die Themenliste lässt sich durchsuchen (Titel und Beiträge,
Fundstelle hervorgehoben), über die Bereiche links nach Kategorie filtern (mit Anzahl je Bereich), über Reiter nach
Status (offene Fragen, geklärt, von Besitzern, eigene) und sortieren (zuletzt aktiv, neueste, meiste Antworten);
„Ganze Baureihe zeigen“ nimmt die Themen der Schwestervarianten hinzu. Übersicht, einzelnes Thema und das Formular
für ein neues Thema teilen sich denselben Aufbau: schmale Spalte zur Orientierung, daneben der Inhalt. Autor und Prüfer ordnen ein Thema
nachträglich anders ein. Wer ein Auto dieser Variante mit geprüftem Kaufvertrag gemeldet hat,
trägt das Abzeichen „Besitzer“. Autoren bearbeiten und löschen eigene Beiträge, andere melden Beiträge an die Prüfer
(`/pruefung` zeigt gemeldete Beiträge mit Begründung), Prüfer (`MIP_ADMINS`) blenden Beiträge und ganze Themen aus;
die Zeilen bleiben mit `hidden_at` in der Datenbank. Je Nutzer und Stunde höchstens 30 Beiträge und 5 Themen; Themen
werden seitenweise (30) geladen. Eine eigene Forumsseite gibt es nicht mehr (`/forum` leitet zum Katalog); die
Suche im Kopf findet Themen nach Titel und öffnet sie auf der Modellseite (`?thema=<id>#forum`), dazu Inserate nach
Titel, Anbieter oder Ort, Händler (alle ihre Inserate auf Kaufen) und Auktionshäuser (ihre Ergebnisse auf
Auktionen, `?haus=`). Server: `server/forum.ts`, gemeinsame Kennungen: `src/lib/forumShared.ts`, Tabellen:
`db/migrations/005_forum.sql`, `008_forum_reports.sql`, `012_forum_structure.sql`.

## Konfiguration (`.env`)

`.env.example` nach `.env` kopieren und ausfüllen, danach `npm run dev` neu starten:

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres für Konten, Sitzungen und Marktdaten (auf Vercel auch `POSTGRES_URL`) |
| `ANTHROPIC_API_KEY` | AI Co-Pilot und KI-Vorprüfung der Kaufverträge mit Claude (ohne: lokaler Analysemodus, Dokumente von Hand prüfen) |
| `MIP_ADMINS` | Benutzernamen der Prüfer für gemeldete Fahrzeuge, kommagetrennt |
| `CRON_SECRET` | Schlüssel für den täglichen Lauf des Suchagenten (siehe „Suchagent“); ohne ihn startet der Lauf nicht |
| `MIP_TRUST_PROXY` | `1`, wenn `npm start` hinter einem eigenen Reverse-Proxy (nginx, Caddy) läuft: Client-Adresse für die Anmeldebremse aus `X-Forwarded-For`; auf Vercel nicht nötig |
| `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` | Premium kaufen über Stripe (siehe „Bezahlen“); ohne sie gibt es keinen Kauf |
| `STRIPE_SEARCH_PRICE_ID` | Abo-Preis für einen zusätzlichen Suchauftrag (siehe „Suchagent“); ohne ihn gibt es nur die in Premium enthaltenen |
| `STRIPE_PRICE_ID_YEARLY` | optional: Jahresabo zur Wahl neben dem Abo aus `STRIPE_PRICE_ID` |
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
6. Für die Reichweitenmessung im Projekt unter „Analytics“ Web Analytics einschalten und noch einmal deployen: erst
   dann liefert Vercel `/_vercel/insights/script.js` aus. Mit `npm start` außerhalb von Vercel gibt es die Adresse
   nicht; das Skript lädt dann nicht (eine Zeile in der Konsole), die App läuft normal. Dasselbe gilt für die
   Ladezeiten: im Projekt unter „Speed Insights“ einschalten und noch einmal deployen
   (`/_vercel/speed-insights/script.js`).

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

## Suchagent

Kunden mit Konto richten unter `/suchagent` Suchaufträge ein (Freitext, optional Variante aus dem Katalog, Preis,
Baujahr, Laufleistung). Wie viele laufen dürfen: ohne Konto keiner, mit Lite keiner inklusive, mit Premium drei; dazu
kann jedes Konto weitere als Abo buchen, ein Preis je Auftrag (siehe unten). Prüfer (`MIP_ADMINS`) tragen unter `/suchquellen` die Bestandsseiten von Händlern oder
einzelne Inserate ein. Einmal täglich liest Claude Opus 5.5 (`claude-opus-5-5`) jede Quelle und gleicht danach jeden
Auftrag mit dem gelesenen Bestand ab:

- **Lesen** (`server/searchAgent.ts`, `scanSource`): Claude ruft die Seite über das Werkzeug „web fetch“ von Anthropic
  ab (läuft auf deren Servern, auf die Website des Händlers beschränkt, höchstens 10 Seiten je Quelle) und gibt die
  Fahrzeuge als Liste zurück. Seiten, die den Bestand erst per JavaScript nachladen, kann es nicht lesen; das steht dann
  bei der Quelle. Links auf andere Websites werden verworfen (`server/searchJobs.ts`).
- **Abgleichen** (`matchOrder`): je Auftrag die passenden Fahrzeuge mit Punktzahl, Begründung und offenen Fragen, dazu
  drei bis fünf Sätze zur Marktlage; mit Variante fließt unser Marktwert ein. Hat sich am Bestand für einen Auftrag
  nichts geändert, wird er nicht erneut ausgewertet.
- **Täglicher Lauf**: Vercel ruft `/api/suchagent/cron` auf (`vercel.json`, 5:30 UTC) und schickt dabei
  `Authorization: Bearer $CRON_SECRET`. Der Lauf arbeitet die Warteschlange in Schritten zu je vier Quellen ab; jeder
  Schritt startet den nächsten als eigene Anfrage. Neue Quellen und neue oder geänderte Aufträge laufen sofort.
- **Kosten**: `/suchquellen` zeigt je Lauf Dauer, abgerufene Seiten und geschätzte Kosten (Token zu Listenpreisen).
- **Weitere Suchaufträge im Abo** (`server/searchPayments.ts`): In Stripe einen wiederkehrenden Preis anlegen (z. B.
  6,90 € pro Monat, Produkt „Zusätzlicher Suchauftrag“) und seine ID als `STRIPE_SEARCH_PRICE_ID` setzen;
  `STRIPE_SECRET_KEY` und `STRIPE_WEBHOOK_SECRET` sind die von Premium, der Webhook braucht dieselben Ereignisse
  (dazu `customer.subscription.deleted`). Jeder Kauf ist ein eigenes Abo mit seiner Anzahl (auf der Zahlungsseite
  änderbar); die jüngste bezahlte Rechnung eines Abos sagt, wie viele Aufträge es bis wann trägt (`search_payments`).
  Aufträge über dem Kontingent ruhen (die ältesten laufen zuerst) und werden nicht gelöscht. Kündigen: Kundenportal
  von Stripe („Abo verwalten oder kündigen“ beim Suchagenten) oder ohne Anmeldung über `/kuendigen`. Ohne die
  Preis-ID wird nichts verkauft; Premium-Konten haben dann ihre drei Aufträge, Lite-Konten keinen.

Einrichten: `npm run db:migrate` (`017_search_agent.sql`), in Vercel `CRON_SECRET` setzen (z. B. `openssl rand -hex 32`)
und neu deployen; `ANTHROPIC_API_KEY` ist dieselbe Variable wie für den Co-Pilot.

## Bereiche

| Route | Inhalt |
|---|---|
| `/` | Marktüberblick: Gesamtindex, Markenindizes, Gewinner/Verlierer, bemerkenswerte Verkäufe |
| `/markt/:variante` | Detailansicht einer Variante (Wertentwicklung, Seltenheit, Optionen, Verkäufe, Empfehlung, Co-Pilot, Forum) |
| `/modelle` | Katalog mit Filtern, Tabellenansicht und Vergleich (bis 4 Varianten) |
| `/auktionen` | Durchsuchbare Auktionsergebnisse (ID, FIN, Haus) |
| `/portfolio` | Bestand, Wertentwicklung (vor dem ersten Kauf: Marktwert der Fahrzeuge, gepunktet), Watchlist, Fahrzeug belegen; erreichbar über das Kontomenü |
| `/insights` | Marktzyklus, Heatmap, Segmente, Rendite-Risiko-Streudiagramme |
| `/kaufen` | Aktuelle Inserate (Classic Trader, Händlerseiten, optional mobile.de) mit Deal-Score gegenüber dem fairen Marktwert, Preissenkungen aus der täglichen Erfassung (Filter „Preis gesenkt“, Preisverlauf im Inserat) |
| `/konto` | Passwort, Datenexport, Konto löschen |
| `/ai` | Co-Pilot im Vollbild mit Prompt-Bibliothek |
| `/suchagent` | Suchagent (Konto nötig; Premium drei Aufträge inklusive, weitere im Abo): Suchaufträge des Kunden, tägliche Treffer aus dem Bestand ausgewählter Händler, Marktlage je Auftrag |
| `/suchquellen` | Nur Prüfer: Händlerseiten und Inserate, die der Suchagent liest; Ergebnis je Quelle, Läufe und Kosten |

## Daten

- **Echte Verkäufe:** `src/data/real/sales.csv` (öffentlich berichtete Ergebnisse mit Quellen-URL) bzw. CSV-Import im Kontomenü. Varianten mit ≥ 3 Verkäufen in 24 Monaten werden daraus bewertet („Echte Daten“).
- **Fotos, Präsentationsfarben, Spezifikationen:** `src/data/real/*.json` und `public/cars/` (Wikimedia Commons, freie Lizenzen, siehe `/bildnachweise`). Recherche-Helfer: `scripts/commons.py`.
- **Marktwert:** nur tatsächlich bezahlte Preise aus Auktionen (Europa voll, USA umgerechnet und begrenzt), dazu schwach gewichtete Höchstgebote unverkaufter Lose und geprüfte Käufe der Nutzer. Angebote von Händlern und Privatleuten zählen derzeit nicht (`ASKS_IN_VALUE` in `scripts/market/model.py`); sie werden weiter angezeigt und nur auf Plausibilität geprüft.
- **Inserate:** die echten Angebote aus `src/data/real/asks.json` (Classic Trader und Händlerseiten), die am letzten Erfassungstag noch online waren, ohne Nachbauten, Umbauten, Unfallwagen und unplausible Preise. Angaben, die die Quelle nicht nennt (Zustand, Farbe, FIN), bleiben leer.
- Watchlist, Portfolio, Preisalarme, gemerkte Inserate und gelesene Benachrichtigungen liegen je Konto in Postgres
  (`user_state`, `db/migrations/007_user_state.sql`, `server/userState.ts`) und folgen dem Konto auf jedes Gerät; der
  Browser hält eine Kopie im `localStorage`. Beim Laden gewinnt die Server-Kopie, jede Änderung wird nach kurzer
  Verzögerung hochgeladen. Das Demo-Konto und der Chatverlauf bleiben nur im Browser.

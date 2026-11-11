# MIP – Marktintelligenz für klassische Sportwagen

Web-App für Marktwerte, Auktionen, Inserate und Sammlungsportfolios klassischer Sportwagen (Porsche).

## Starten

Braucht Postgres (Konten, Sitzungen und Marktdaten). Lokal z. B. mit Homebrew:

```bash
brew services start postgresql@18 && createdb mip
cp .env.example .env     # DATABASE_URL=postgres://localhost:5432/mip
npm install
npm run db:migrate       # Tabellen anlegen (db/migrations)
npm run db:import        # Marktdaten aus src/data/real laden
npm run dev              # http://localhost:5173
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
Adresse kurz gesperrt.

## Konfiguration (`.env`)

`.env.example` nach `.env` kopieren und ausfüllen, danach `npm run dev` neu starten:

| Variable | Zweck |
|---|---|
| `DATABASE_URL` | Postgres für Konten, Sitzungen und Marktdaten (auf Vercel auch `POSTGRES_URL`) |
| `ANTHROPIC_API_KEY` | AI Co-Pilot mit Claude (ohne: lokaler Analysemodus) |
| `MOBILEDE_USERNAME`, `MOBILEDE_PASSWORD` | Live-Inserate über die offizielle [mobile.de Search API](https://services.mobile.de/docs/search-api.html) (Zugang über den mobile.de-Kundenservice) |

Angezeigte Marken: `src/config.ts` (`ENABLED_BRANDS`, aktuell nur Porsche).

## Veröffentlichen (Vercel)

`vercel.json` leitet jede Anfrage an eine Funktion (`api/server.ts` → `server/app.ts`): Anmeldeseite, APIs und die
gebaute App. Die App liegt nur in der Funktion, nicht öffentlich im CDN; öffentlich ausgeliefert werden nur `public/`
(Favicon, Fotos). Region Frankfurt (`fra1`).

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

Der Co-Pilot nutzt Claude (`claude-opus-5-5`) über den Server-Endpunkt `/api/copilot`; der API-Key bleibt serverseitig.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Ohne Zugangsdaten antwortet ein lokaler Analysemodus, der Ausblick, Variantenvergleich, Kaufrisiko, Auktionstrends und Portfolio direkt aus den Marktdaten berechnet.

## Bereiche

| Route | Inhalt |
|---|---|
| `/` | Marktüberblick: Gesamtindex, Markenindizes, Gewinner/Verlierer, bemerkenswerte Verkäufe |
| `/markt/:variante` | Detailansicht einer Variante (Wertentwicklung, Seltenheit, Optionen, Verkäufe, Empfehlung, Co-Pilot) |
| `/modelle` | Katalog mit Filtern, Tabellenansicht und Vergleich (bis 4 Varianten) |
| `/auktionen` | Durchsuchbare Auktionsergebnisse (ID, FIN, Haus) |
| `/portfolio` | Bestand, Wertentwicklung, Allokation, Watchlist, Preisalarme, CSV-Export |
| `/insights` | Marktzyklus, Heatmap, Segmente, Rendite-Risiko-Streudiagramme |
| `/kaufen` | Aktuelle Inserate (Classic Trader, Händlerseiten, optional mobile.de) mit Deal-Score gegenüber dem fairen Marktwert |
| `/ai` | Co-Pilot im Vollbild mit Prompt-Bibliothek |

## Daten

- **Echte Verkäufe:** `src/data/real/sales.csv` (öffentlich berichtete Ergebnisse mit Quellen-URL) bzw. CSV-Import im Kontomenü. Varianten mit ≥ 3 Verkäufen in 24 Monaten werden daraus bewertet („Echte Daten“).
- **Fotos, Präsentationsfarben, Spezifikationen:** `src/data/real/*.json` und `public/cars/` (Wikimedia Commons, freie Lizenzen, siehe `/bildnachweise`). Recherche-Helfer: `scripts/commons.py`.
- **Inserate:** die echten Angebote aus `src/data/real/asks.json` (Classic Trader und Händlerseiten), die am letzten Erfassungstag noch online waren, ohne Nachbauten, Umbauten, Unfallwagen und unplausible Preise. Angaben, die die Quelle nicht nennt (Zustand, Farbe, FIN), bleiben leer.
- Watchlist, Portfolio, Alarme und Chatverlauf liegen im `localStorage` des Browsers und starten leer.

# MOTRKT – Marktintelligenz für klassische Sportwagen

Web-App für Marktwerte, Auktionen, Inserate und Sammlungsportfolios klassischer Sportwagen (Porsche, Ferrari, Lamborghini, Mercedes-Benz, BMW, Aston Martin, Jaguar).

## Starten

```bash
npm install
npm run dev          # http://localhost:5173
```

Produktion:

```bash
npm run build
npm start            # http://localhost:4173 (PORT überschreibbar)
```

## Konfiguration (`.env`)

`.env.example` nach `.env` kopieren und ausfüllen, danach `npm run dev` neu starten:

| Variable | Zweck |
|---|---|
| `ANTHROPIC_API_KEY` | AI Co-Pilot mit Claude (ohne: lokaler Analysemodus) |
| `MOBILEDE_USERNAME`, `MOBILEDE_PASSWORD` | Live-Inserate über die offizielle [mobile.de Search API](https://services.mobile.de/docs/search-api.html) (Zugang über den mobile.de-Kundenservice) |

Angezeigte Marken: `src/config.ts` (`ENABLED_BRANDS`, aktuell nur Porsche). Daten der anderen Marken bleiben erhalten.

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
| `/auktionen` | Kommende Auktionen und durchsuchbare Ergebnisse (ID, FIN, Haus) |
| `/portfolio` | Bestand, Wertentwicklung, Allokation, Watchlist, Preisalarme, CSV-Export |
| `/insights` | Marktzyklus, Heatmap, Segmente, Rendite-Risiko-Streudiagramme |
| `/kaufen` | Inserate mit Deal-Score gegenüber dem fairen Marktwert |
| `/ai` | Co-Pilot im Vollbild mit Prompt-Bibliothek |

## Daten

- **Echte Verkäufe:** `src/data/real/sales.csv` (öffentlich berichtete Ergebnisse mit Quellen-URL) bzw. CSV-Import im Kontomenü. Varianten mit ≥ 3 Verkäufen in 24 Monaten werden daraus bewertet („Echte Daten“).
- **Fotos, Präsentationsfarben, Spezifikationen:** `src/data/real/*.json` und `public/cars/` (Wikimedia Commons, freie Lizenzen, siehe `/bildnachweise`). Recherche-Helfer: `scripts/commons.py`.
- Übrige Werte, Inserate (ohne mobile.de) und kommende Auktionen sind **synthetisch** und werden deterministisch aus dem Katalog in `src/data/catalog.ts` erzeugt (`src/data/generate.ts`, Datenstand 02.11.2026). Watchlist, Portfolio, Alarme und Chatverlauf liegen im `localStorage` des Browsers und lassen sich über das Kontomenü (JD) zurücksetzen.

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

Alle Marktdaten sind **synthetisch** und werden deterministisch aus dem Katalog in `src/data/catalog.ts` erzeugt (`src/data/generate.ts`, Datenstand 02.11.2026). Watchlist, Portfolio, Alarme und Chatverlauf liegen im `localStorage` des Browsers und lassen sich über das Kontomenü (JD) zurücksetzen.

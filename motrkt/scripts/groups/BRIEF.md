# Research brief: real photos, launch colors and verified specs

Project: MOTRKT, a classic-sports-car market app at /Users/dimik/Coding/Apps/MIP/motrkt (Vite + React).
Your group's variants are listed in scripts/groups/<group>.txt (one per line: id | title | years | production | PS | litres | newPrice EUR | current color).

For EVERY variant in your file, produce one entry in src/data/real/<group>.json (create it; pretty-printed JSON object keyed by variant id). Write the file incrementally (e.g. after every few variants) so progress is never lost.

## 1. Launch ("communication") color — required
The paint the car was first presented to the public in: world-premiere show car, official press photos, or the brochure/launch campaign hero car. Examples of the idea: Porsche 959 → white; Porsche 911 Dakar → white with Rallye Design package.
- Research with WebSearch/WebFetch (manufacturer press archives/newsrooms, museum pages, Wikipedia, reputable registries/press coverage).
- Record the official paint name (manufacturer language, optionally German translation), a realistic hex value for that paint, a source URL, and confidence: "high" (manufacturer/press source states it), "medium" (consistent secondary sources / clearly visible in launch photos), "low" (best guess). Never invent a source; if unsure, say so in "note" and use "low".

## 2. Verified specs — only what you can confirm
Check production count, power (PS, DIN), displacement (litres), production years and launch list price against Wikipedia (de/en) or manufacturer sources. Include ONLY fields you verified, plus the source URLs. Prices: give the original amount + currency and an EUR equivalent (DEM ÷ 1.95583, ITL ÷ 1936.27; for GBP/USD use the approximate exchange rate of that year and say so).

## 3. Real photos — 1 to 3 per variant
Only from Wikimedia Commons, via the helper (rate-limited, refuses non-free licenses):
  python3 scripts/commons.py category "Porsche 964 Carrera RS"     # browse categories (lists subcategories too)
  python3 scripts/commons.py search "Porsche 959" --limit 15
  python3 scripts/commons.py fetch "File:Exact title.jpg" --out public/cars/<variant-id>-1.jpg
- The FIRST image (-1) is the hero: prefer the exact variant, in its launch color, a clean exterior 3/4 or side view, not heavily modified/race-liveried. If no launch-color photo exists, take the best exact-variant photo.
- LOOK at candidates before choosing: download to /tmp first or open the preview URL with WebFetch is not enough — use the Read tool on the downloaded file to view it, then fetch the chosen one to public/cars/. Delete rejected downloads from public/cars/.
- Must be the right model. If Commons has no photo of the exact variant, you may use the closest sibling (same generation) and mark "exact": false.
- Never use non-free images, never use images from any other website.

## Output format (per variant id)
{
  "launchColor": { "name": "Rubinsternrot (Rubystone Red)", "hex": "#9c1f4b", "source": "https://…", "confidence": "high|medium|low", "note": "optional" },
  "specs": { "production": 2282, "hp": 260, "liters": 3.6, "years": [1992, 1993], "newPrice": { "amount": 145450, "currency": "DEM", "eur": 74368, "year": 1992 }, "sources": ["https://…"] },
  "images": [
    { "file": "/cars/<variant-id>-1.jpg", "title": "File:…", "page": "https://commons.wikimedia.org/wiki/File:…", "author": "…", "license": "CC BY-SA 4.0", "licenseUrl": "https://…", "exact": true, "launchColor": true, "caption": "short German caption, e.g. 'Porsche 911 Carrera RS (964), Rubinsternrot'" }
  ]
}
"specs" may be partial or omitted; "images" may be empty only if Commons truly has nothing usable (say why in "note" inside launchColor or a top-level "note").

Constraints: do not edit any source files other than your JSON; do not scrape auction-house or commercial sites; keep each image ≤ ~250 KB (the helper resizes). When finished, validate the JSON with `python3 -m json.tool src/data/real/<group>.json > /dev/null` and report: variants done, how many with exact launch-color hero photos, low-confidence colors, and anything you couldn't find (under 200 words).

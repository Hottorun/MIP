"""Write src/data/real/sales.csv: scraped auction results + earlier hand-collected rows from other houses (re-checked)."""
import json, sys, csv, re, collections, os, datetime
S, OUT = sys.argv[1], sys.argv[2]
sys.path.insert(0, S + "/tools")
from classify import classify
rows = json.load(open(S + "/web/sales_all.json"))
AS_OF = os.environ.get("MIP_AS_OF") or datetime.date.today().isoformat()  # cut-off day: today unless set
rows = [r for r in rows if "2015-01-01" <= r["date"] <= AS_OF]
# earlier curated rows from sources other than ultimatecarpage (Mecum, Barrett-Jackson, Iconic, press releases)
old = list(csv.reader(open(S + "/web/sales_old.csv"), delimiter=";"))
hdr = old[0]; kept = []; dropped = []
for r in old[1:]:
    d = dict(zip(hdr, r))
    if "ultimatecarpage.com" in d["url"]: continue
    title = re.sub(r"\s*\((\d{3})\)", r" \1", d["fahrzeug"])
    c = classify(title)
    if not c or c[0] != d["variant_id"]: dropped.append((d["variant_id"], d["fahrzeug"], c and c[0])); continue
    price = int(d["preis_eur"]) if d["preis_eur"] else None
    # same car already in the scraped data (same variant, ±10 days, price within 2 %)?
    dup = any(x["variant"] == d["variant_id"] and abs((int(x["date"][:4]) * 372 + int(x["date"][5:7]) * 31 + int(x["date"][8:])) - (int(d["datum"][:4]) * 372 + int(d["datum"][5:7]) * 31 + int(d["datum"][8:]))) <= 10
              and ((price and x["eur"] and abs(x["eur"] / price - 1) < 0.02) or (not price and not x["sold"])) for x in rows)
    if dup: continue
    kept.append(d)
json.dump({"kept": kept, "dropped": dropped}, open(S + "/web/old_review.json", "w"), ensure_ascii=False, indent=1)
H = ["variant_id", "fahrzeug", "datum", "quelle", "haus", "preis_eur", "schaetzung_von", "schaetzung_bis", "verkauft", "zustand", "km", "kaeuferland", "herkunft",
     "auslieferung", "farbe", "karosserie", "getriebe", "fin", "los_id", "url", "preis_original", "waehrung", "standort"]
out = []
for r in rows:
    gear = r["gear"] or ("Automatik" if r["year"] >= 1999 and r["src"] == "bat" and not re.search(r"\d-speed", r["title"].lower()) and False else "")
    out.append([r["variant"], r["title"].replace(";", ","), r["date"], "Auktion", r["house"], r["eur"] or "", "", "", "ja" if r["sold"] else "nein", "",
                r["km"] or "", "", "", "", "", r["body"], r["gear"], r["vin"].replace(";", ","), r["lot"], r["url"], r["orig"] or "", r["cur"] or "", r["loc"]])
# Earlier hand-collected rows are not carried over: the scrape covers those auctions, the rest (press reports) cannot be re-checked.
out.sort(key=lambda x: (x[0], x[2]), reverse=False)
with open(OUT, "w", newline="") as f:
    f.write(";".join(H) + "\n")
    for r in out: f.write(";".join(str(x) for x in r) + "\n")
print(len(out), "rows;", len(kept), "kept old;", len(dropped), "dropped old")

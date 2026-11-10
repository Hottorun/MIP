"""Follow every listing over time: when it appeared, price changes, and when it went offline.

usage: python3 -I track.py WORK OUT.json

Sources
- Classic Trader: WORK/web/asks.json (one row per listing and fetch day, ctparse.py). A fetch day only counts if it
  saw at least 80 % as many listings as the median day, so a failed fetch does not mark listings as gone.
- Hand-recorded listings (scripts/market/manual/*.csv, art = Angebot): every run stores a snapshot of all rows under
  WORK/web/track/manual/<day>.json. Editing a price in the CSV is a price change on that day, deleting a row means the
  listing is gone (sold or withdrawn), adding a row starts a new listing on its `datum`.

A listing is keyed by its URL. A listing is "gone" when its source was checked on a later day and it was not there.
Writes OUT.json for the app (per listing: first/last day seen, price history, status) and a summary: how often prices
are cut, by how much, and how long gone listings were online. Once enough listings have gone, this measures how far
the last asking price sits above the actual sale price better than the first ask.
"""
import csv, datetime as dt, glob, json, os, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from classify import classify  # noqa: E402

W, OUT = sys.argv[1], sys.argv[2]
TODAY = os.environ.get("MIP_AS_OF") or dt.date.today().isoformat()

# --- Classic Trader: observations per listing and the days that were fetched completely
ct = json.load(open(os.path.join(W, "web", "asks.json"))) if os.path.exists(os.path.join(W, "web", "asks.json")) else []
per_day = {}
for a in ct:
    per_day[a["day"]] = per_day.get(a["day"], 0) + 1
full = statistics.median(per_day.values()) * 0.8 if per_day else 0
ct_days = sorted(d for d, n in per_day.items() if n >= full)

obs = {}  # url -> {"src", "variant", "title", "cur", "seen": {day: price}}


def add(url, src, variant, title, cur, day, price):
    o = obs.setdefault(url, {"src": src, "variant": variant, "title": title, "cur": cur, "seen": {}})
    o["seen"][day] = price
    if variant: o["variant"] = variant


for a in ct:
    if a.get("price") and a.get("url") and not a.get("auction"):
        add(a["url"], "Classic Trader", a.get("variant"), "Porsche %s" % a["model"], a.get("cur") or "EUR", a["day"], a["price"])

# --- hand-recorded listings: snapshot today, then replay all snapshots
rows = []
for fn in sorted(glob.glob(os.path.join(HERE, "manual", "*.csv"))):
    for r in csv.DictReader(open(fn, encoding="utf-8"), delimiter=";"):
        if not r.get("url") or not r.get("preis") or not r.get("datum"): continue
        if (r.get("art") or "Angebot").lower().startswith("verkauf"): continue
        vid = (r.get("variant_id") or "").strip()
        if not vid:
            c = classify("%s Porsche %s" % (r.get("baujahr", ""), r.get("fahrzeug", "")))
            vid = c[0] if c else None
        rows.append({"url": r["url"].strip(), "src": r.get("quelle") or "manuell", "variant": vid, "title": "Porsche %s" % r["fahrzeug"],
                     "cur": (r.get("waehrung") or "EUR").strip(), "datum": r["datum"], "price": float(r["preis"])})
snap_dir = os.path.join(W, "web", "track", "manual")
os.makedirs(snap_dir, exist_ok=True)
json.dump(rows, open(os.path.join(snap_dir, TODAY + ".json"), "w"), ensure_ascii=False)
manual_days = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.path.join(snap_dir, "*.json")))
for day in manual_days:
    for r in json.load(open(os.path.join(snap_dir, day + ".json"))):
        # a row's own date is when it was first seen; snapshot days after that show it is still listed (or repriced)
        if r["url"] not in obs and r["datum"] < day: add(r["url"], r["src"], r["variant"], r["title"], r["cur"], r["datum"], r["price"])
        add(r["url"], r["src"], r["variant"], r["title"], r["cur"], day, r["price"])
        obs[r["url"]]["manual"] = True

# --- per listing: history, status
listings, cuts, raises, gone_days, gone_total_cut = {}, [], 0, [], []
for url, o in obs.items():
    days = sorted(o["seen"])
    checked = manual_days if o.get("manual") else ct_days
    later = [d for d in checked if d > days[-1]]
    status = "gone" if later else "active"
    hist = []
    for d in days:
        # changes under 1 % are rounding of converted prices (CHF, GBP shown in EUR), not a new asking price
        if not hist or abs(o["seen"][d] / hist[-1][1] - 1) >= 0.01: hist.append([d, o["seen"][d]])
    rec = {"src": o["src"], "variant": o["variant"], "cur": o["cur"], "first": days[0], "last": days[-1], "status": status, "prices": hist}
    if status == "gone": rec["goneOn"] = later[0]
    listings[url] = rec
    for (d0, p0), (d1, p1) in zip(hist, hist[1:]):
        if p1 < p0: cuts.append(p1 / p0 - 1)
        else: raises += 1
    if status == "gone":
        on = (dt.date.fromisoformat(later[0]) - dt.date.fromisoformat(days[0])).days
        gone_days.append(on)
        gone_total_cut.append(hist[-1][1] / hist[0][1] - 1)


def med(xs): return round(statistics.median(xs), 4) if xs else None


summary = {
    "asOf": TODAY,
    "days": {"Classic Trader": ct_days, "manuell": manual_days},
    "tracked": len(listings),
    "active": sum(1 for l in listings.values() if l["status"] == "active"),
    "gone": len(gone_days),
    "priceCuts": len(cuts),
    "priceRaises": raises,
    "medianCut": med(cuts),
    "goneMedianDaysOnline": med(gone_days),
    "goneMedianFirstToLast": med(gone_total_cut),
}
json.dump({"summary": summary, "listings": listings}, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print("tracking:", json.dumps(summary, ensure_ascii=False)[:400])

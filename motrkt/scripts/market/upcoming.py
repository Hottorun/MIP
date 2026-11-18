"""Coming auctions: the sales still to come at the auction houses in our data, for the list in the Auktionen tab.

usage: python3 -I upcoming.py WORK OUT

Two sources, no request of its own:
1. The fetchers (rmfetch, goodingfetch, mecumfetch, aguttesfetch, osenatfetch, barrettfetch, gaafetch) write the Porsche lots of sales that are
   not over yet to WORK/web/<house>/upcoming_lots.json while they read the house's lot list anyway. They are grouped
   into sales here: name, first and last day, link to the sale, number of Porsche lots that classify.py assigns.
2. scripts/market/manual/auktionstermine.csv: dates of houses without a fetcher (Historics, Barrett-Jackson, ...),
   entered by hand from the houses' own calendars. A row is left out when a fetcher already has that sale.
Sales whose last day is before today are dropped. Writes OUT (src/data/real/auction-calendar.json), sorted by date.
A house whose fetcher failed today keeps yesterday's file, so its sales stay in the list until they are over.
"""
import csv, datetime as dt, glob, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

W, OUT = sys.argv[1], sys.argv[2]
TODAY = dt.date.today().isoformat()
MANUAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manual", "auktionstermine.csv")
# link for a sale whose fetcher gives no sale page
HOUSE_URL = {"Gooding & Company": "https://www.goodingco.com/", "RM Sotheby's": "https://rmsothebys.com/upcoming/",
             "Mecum": "https://www.mecum.com/auctions/", "Aguttes": "https://www.aguttes.com/ventes/prochaines-ventes",
             "Osenat": "https://www.osenat.com/", "Barrett-Jackson": "https://www.barrett-jackson.com/",
             "GAA Classic Cars": "https://www.gaaclassiccars.com/vehicles"}

sales = {}
for p in sorted(glob.glob(os.path.join(W, "web", "*", "upcoming_lots.json"))):
    try: rows = json.load(open(p))
    except (OSError, ValueError): continue
    for r in rows:
        if not r.get("house"): continue
        name = re.sub(r"\s+", " ", r.get("sale") or "").strip() or r["house"]
        key = (r["house"], name)
        s = sales.setdefault(key, dict(house=r["house"], name=name, date=None, end=None, place="", country=r.get("country") or "",
                                       url=r.get("saleUrl") or HOUSE_URL.get(r["house"]), porsche=0, online=bool(r.get("online")), seen=set()))
        if r.get("date") and (not s["date"] or r["date"] < s["date"]): s["date"] = r["date"]
        if r.get("end") and (not s["end"] or r["end"] > s["end"]): s["end"] = r["end"]
        if not s["country"] and r.get("country"): s["country"] = r["country"]
        if r.get("saleUrl") and s["url"] == HOUSE_URL.get(r["house"]): s["url"] = r["saleUrl"]
        if r.get("url") and r["url"] not in s["seen"] and classify(r.get("title") or ""):
            s["seen"].add(r["url"]); s["porsche"] += 1

out = []
for s in sales.values():
    del s["seen"]
    if not s["date"]: continue
    if (s["end"] or s["date"]) < TODAY: continue
    if s["end"] == s["date"]: s["end"] = None
    out.append(s)

if os.path.exists(MANUAL):
    for r in csv.DictReader(open(MANUAL, encoding="utf-8"), delimiter=";"):
        house, date = (r.get("haus") or "").strip(), (r.get("von") or "").strip()
        if not house or not re.match(r"\d{4}-\d\d-\d\d$", date): continue
        end = (r.get("bis") or "").strip() or None
        if (end or date) < TODAY: continue
        if any(s["house"] == house and s["date"] == date for s in out): continue
        out.append(dict(house=house, name=(r.get("auktion") or "").strip() or house, date=date, end=end if end != date else None,
                        place=(r.get("ort") or "").strip(), country=(r.get("land") or "").strip(), url=(r.get("url") or "").strip() or None,
                        porsche=None, online=False))

out.sort(key=lambda s: (s["date"], s["house"], s["name"]))
json.dump({"asOf": TODAY, "sales": out}, open(OUT, "w"), ensure_ascii=False, indent=1)
print(len(out), "coming auctions from", len({s["house"] for s in out}), "houses", flush=True)

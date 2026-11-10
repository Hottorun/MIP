"""Build sales rows (EUR) from Bring a Trailer + ultimatecarpage auction results."""
import json, os, re, sys, csv, datetime as dt, collections, bisect, html
sys.path.insert(0, sys.argv[1] + "/tools")
from classify import classify
S = sys.argv[1]
# links to the original lot pages (linkfetch.py); results without one keep the result list they were taken from
LINKS = json.load(open(S + "/web/links/links.json")) if os.path.exists(S + "/web/links/links.json") else {}
# results checked by hand against the auction house's own results page (manual/auktionen-korrekturen.csv): the house's
# price and lot link win over the aggregator
KORR = {}
_kf = os.path.join(os.path.dirname(os.path.abspath(__file__)), "manual", "auktionen-korrekturen.csv")
if os.path.exists(_kf):
    for r in csv.DictReader(open(_kf, encoding="utf-8"), delimiter=";"): KORR[r["los_id"].strip()] = r
# --- FX (ECB reference rates, units of currency per 1 EUR)
fx = {}
rows = list(csv.reader(open(S + "/web/fx/eurofxref-hist.csv")))
hdr = rows[0]
for r in rows[1:]:
    d = r[0]
    for cur in ("USD", "GBP", "CHF", "JPY", "AUD", "CAD"):
        v = r[hdr.index(cur)]
        if v not in ("N/A", ""): fx.setdefault(cur, {})[d] = float(v)
fxdates = {c: sorted(v) for c, v in fx.items()}
def to_eur(amount, cur, date):
    if cur == "EUR": return amount
    ds = fxdates[cur]; i = bisect.bisect_right(ds, date) - 1
    return amount / fx[cur][ds[max(i, 0)]]

def km_from_title(t):
    m = re.search(r"([\d,\.]+)(k?)-(Mile|Kilometer|Km)\b", t)
    if not m: return None
    n = float(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
    return round(n * (1.609344 if m.group(3) == "Mile" else 1) / 100) * 100

out = []
# --- Bring a Trailer
seen = set()
import os, itertools
bat_lines = itertools.chain(*(open(S + "/web/" + fn) for fn in ("bat_porsche.jsonl", "bat_models.jsonl") if os.path.exists(S + "/web/" + fn)))
for line in bat_lines:
    it = json.loads(line)
    if it["id"] in seen: continue
    seen.add(it["id"])
    title = html.unescape(it["title"])
    c = classify(title)
    if not c: continue
    vid, body, gear, year = c
    st = it["sold_text"] or ""
    if st.startswith("Sold for"): sold = True
    elif st.startswith("Bid to"): sold = False
    else: continue
    date = dt.datetime.utcfromtimestamp(it["timestamp_end"]).strftime("%Y-%m-%d")
    cur = it["currency"] or "USD"
    amt = it["current_bid"]
    m = re.search(r"([A-Z]{3}) \$?([\d,]+)", st)
    if m: cur, amt = m.group(1), int(m.group(2).replace(",", ""))
    if not amt: continue
    eur = round(to_eur(amt, cur, date))
    out.append(dict(variant=vid, title=title, date=date, house="Bring a Trailer", eur=eur if sold else None, bid=eur if not sold else None,
                    sold=sold, orig=amt, cur=cur, km=km_from_title(title), loc=it.get("country_code") or "", body=body, gear=gear,
                    vin="", lot="BAT-%s" % it["id"], url=it["url"], year=year, src="bat"))
# --- ultimatecarpage (RM Sotheby's, Gooding, Bonhams, Broad Arrow, Artcurial ...)
MONTHS = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"])}
CURSYM = {"$": "USD", "€": "EUR", "£": "GBP", "CHF": "CHF"}
U = json.load(open(S + "/web/ucp.json"))
bycur = collections.defaultdict(collections.Counter)
for x in U:
    for sym, cur in CURSYM.items():
        if x["price"].startswith(sym): bycur[x["auction"]][cur] += 1
def house_of(ev):
    ev = re.sub(r"^\d{4} ", "", ev)
    for k, v in [("RM Sotheby", "RM Sotheby's"), ("Gooding", "Gooding & Company"), ("Bonhams", "Bonhams"), ("Broad Arrow", "Broad Arrow"), ("Artcurial", "Artcurial"), ("Mecum", "Mecum"), ("Barrett", "Barrett-Jackson"), ("Collecting Cars", "Collecting Cars"), ("Dorotheum", "Dorotheum"), ("Aguttes", "Aguttes"), ("Osenat", "Osenat"), ("Silverstone", "Silverstone Auctions"), ("H&H", "H&H"), ("Iconic", "Iconic Auctioneers")]:
        if k in ev: return v
    return ev.split(" ")[0]
def house_search(house, title):
    """Search page for this car at houses whose lot pages we could not match; better than the ultimatecarpage list."""
    import urllib.parse
    e = urllib.parse.quote(re.sub(r"\s*\([^)]*\)", "", title).strip())
    if house == "Broad Arrow": return "https://www.broadarrowauctions.com/vehicles/results?ftx=" + e
    if house == "RM Sotheby's": return "https://rmsothebys.com/search/?SearchTerm=%s#?SortBy=Availability&SearchTerm=%s&page=1&pageSize=40" % (e, e)
    # no linkable search: the house's page with past auction results
    return {"Bonhams": "https://cars.bonhams.com/auctions/results/", "Gooding & Company": "https://www.goodingco.com/results",
            "Artcurial": "https://www.artcurial.com/en/results-auctions-sales", "Keno": "https://www.kenoauctions.com/"}.get(house)
for x in U:
    b = x["b"]
    if not any("Porsche" in s for s in b): continue
    t = (b[0].strip() + " " + b[1]) if len(b) > 1 and b[0].strip().isdigit() else b[0]
    c = classify(t, x["note"])
    if not c: continue
    vid, body, gear, year = c
    p = x["price"]
    if p.startswith("No Sale"): sold, amt, cur = False, None, None
    else:
        m = re.match(r"^(\$|€|£|CHF)?\s*([\d,\.]+)$", p.replace("\xa0", " ").strip())
        if not m: continue
        cur = CURSYM.get(m.group(1)) if m.group(1) else (bycur[x["auction"]].most_common(1)[0][0] if bycur[x["auction"]] else None)
        if not cur: continue
        amt = int(m.group(2).replace(",", "").split(".")[0]); sold = True
    ym = re.match(r"(\d{4})", x["event"]); yr = int(ym.group(1))
    if yr < 2015: continue
    dm = re.match(r"([A-Z][a-z]+)\s+(\d+)", x["date"] or "")
    if dm and dm.group(1) in MONTHS: date = "%04d-%02d-%02d" % (yr, MONTHS[dm.group(1)], int(dm.group(2)))
    else: continue
    eur = round(to_eur(amt, cur, date)) if sold else None
    out.append(dict(variant=vid, title=t + (" (" + x["note"] + ")" if x["note"] else ""), date=date, house=house_of(x["event"]), eur=eur, bid=None, sold=sold,
                    orig=amt, cur=cur, km=None, loc="", body=body, gear=gear, vin=x["chassis"], lot="UCP-%s-%s" % (x["auction"], x["lot"]),
                    url=LINKS.get("UCP-%s-%s" % (x["auction"], x["lot"]), {}).get("url") or house_search(house_of(x["event"]), t) or "https://www.ultimatecarpage.com/auction/%s/" % x["auction"],
                    year=year, src="ucp", event=x["event"]))
for o in out:
    k = KORR.get(o["lot"])
    if not k: continue
    if k.get("url"): o["url"] = k["url"].strip()
    if k.get("preis"):
        o["orig"], o["cur"] = int(float(k["preis"])), (k.get("waehrung") or o["cur"]).strip()
        o["eur"] = round(to_eur(o["orig"], o["cur"], o["date"])); o["sold"] = True
json.dump(out, open(S + "/web/sales_all.json", "w"), ensure_ascii=False)
c = collections.Counter(o["variant"] for o in out if o["sold"])
print(len(out), sum(c.values()))

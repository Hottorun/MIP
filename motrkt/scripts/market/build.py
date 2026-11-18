"""Build sales rows (EUR) from Bring a Trailer, ultimatecarpage and the auction houses' own results."""
import json, os, re, sys, csv, datetime as dt, collections, bisect, html
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # classify.py next to this script (-I leaves the folder out)
from classify import classify, EARLY_RESULTS
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
def bat_fee(hammer, date):
    """Bring a Trailer's buyer's fee on top of the "Sold for" price (the hammer price): 5 %, at least 250, at most 5,000
    (7,500 from 2024; BaT raised the cap in January 2024). The few sales in EUR or GBP get the same figures in their
    currency. Every other house publishes its results with the buyer's premium, so BaT sales are put on that footing."""
    return int(min(max(round(hammer * 0.05), 250), 7500 if date >= "2024-01-01" else 5000))
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
    hammer = amt
    if sold: amt += bat_fee(amt, date)   # price paid; the bid of an unsold lot stays as bid
    eur = round(to_eur(amt, cur, date))
    out.append(dict(variant=vid, title=title, date=date, house="Bring a Trailer", eur=eur if sold else None, bid=eur if not sold else None,
                    sold=sold, orig=amt, hammer=hammer if sold else None, cur=cur, km=km_from_title(title), loc=it.get("country_code") or "", body=body, gear=gear,
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
    # one name per house: "RM Auctions" is RM Sotheby's before the rename, Silverstone Auctions became Iconic Auctioneers
    if ev.startswith("RM "): return "RM Sotheby's"
    if ev.startswith("Keno"): return "Keno Auctions"
    for k, v in [("RM Sotheby", "RM Sotheby's"), ("Gooding", "Gooding & Company"), ("Bonhams", "Bonhams"), ("Broad Arrow", "Broad Arrow"), ("Artcurial", "Artcurial"), ("Mecum", "Mecum"), ("Barrett", "Barrett-Jackson"), ("Collecting Cars", "Collecting Cars"), ("Dorotheum", "Dorotheum"), ("Aguttes", "Aguttes"), ("Osenat", "Osenat"), ("Silverstone", "Iconic Auctioneers"), ("H&H", "H&H"), ("Iconic", "Iconic Auctioneers")]:
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
            "Artcurial": "https://www.artcurial.com/en/results-auctions-sales", "Keno Auctions": "https://www.kenoauctions.com/"}.get(house)
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
    if yr < 2015 and vid not in EARLY_RESULTS: continue
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
# --- Results straight from the auction houses (rmfetch.py, bonhamsfetch.py, goodingfetch.py, broadarrowfetch.py,
# artcurialfetch.py, mecumfetch.py, iconicfetch.py, aguttesfetch.py, osenatfetch.py, barrettfetch.py, pcarfetch.py,
# gaafetch.py; each writes WORK/web/<key>/<key>.json):
# direct lot links, chassis numbers and stated mileage. These
# rows replace the same lots taken from ultimatecarpage: same chassis number within 7 days, or without one the same
# variant within 7 days at a price within 2 %. ultimatecarpage rows a house's own data does not cover are kept.
HOUSES = [("rm", "RM Sotheby's", "RM"), ("bonhams", "Bonhams", "BON"), ("gooding", "Gooding & Company", "GOO"),
          ("broadarrow", "Broad Arrow", "BA"), ("artcurial", "Artcurial", "ART"), ("mecum", "Mecum", "MEC"),
          ("iconic", "Iconic Auctioneers", "ICO"), ("aguttes", "Aguttes", "AGU"), ("osenat", "Osenat", "OSE"),
          ("barrett", "Barrett-Jackson", "BJ"), ("pcar", "PCARMARKET", "PCAR"), ("gaa", "GAA Classic Cars", "GAA")]
def gaa_premium(hammer, date):
    """GAA Classic Cars publishes the hammer price. Its buyer's premium, from the lots Hammer Price lists with premium:
    7 % in 2017-2019 (27 of 27 lots agree), 8 % in 2023-2026 (32 of 38; four cheap lots paid 11-13 %, a minimum fee we
    do not know). No lots to compare for 2020-2022: taken as 7 % (at most 1 % off)."""
    return round(hammer * (0.08 if date >= "2023-01-01" else 0.07))
def pcar_fee(bid, date):
    """PCARMARKET's buyer's fee on top of the winning bid it shows: 5 %, at least 500, at most 5,000 USD (7,500 for
    auctions closed after 27 June 2025; from its FAQ). Added like Bring a Trailer's (bat_fee), so that every sold price
    is what the buyer paid."""
    return int(min(max(round(bid * 0.05), 500), 7500 if date > "2025-06-27" else 5000))
# VINs and chassis numbers never use the letter O; some catalogues print "WPO…" for "WP0…"
def chassis_key(c): return re.sub(r"[^A-Z0-9]", "", (c or "").upper()).replace("O", "0")
def day(d): return dt.date.fromisoformat(d).toordinal()
for key, house, prefix in HOUSES:
    path = "%s/web/%s/%s.json" % (S, key, key)
    if not os.path.exists(path): continue
    own, ids = [], set()
    for x in json.load(open(path)):
        c = classify(x["title"])
        if not c or (x["sold"] and (not x["amt"] or (x["cur"] != "EUR" and x["cur"] not in fx))): continue
        vid, body, gear, year = c
        # an online platform has no sales: its lots carry the platform's code, which is the prefix already
        lot = "%s-%s" % (prefix, x["lot"]) if str(x["code"]).upper() == prefix else "%s-%s-%s" % (prefix, str(x["code"]).upper(), x["lot"])
        if lot in ids: continue
        ids.add(lot)
        amt = x["amt"]
        if key == "pcar" and x["sold"]: amt += pcar_fee(amt, x["date"])   # price paid; the bid of an unsold lot stays as bid
        if key == "gaa" and x["sold"]: amt += gaa_premium(amt, x["date"])
        own.append(dict(variant=vid, title=x["title"], date=x["date"], house=house, eur=round(to_eur(amt, x["cur"], x["date"])) if x["sold"] else None,
                        bid=None, sold=x["sold"], orig=amt if x["sold"] else None, cur=x["cur"] if x["sold"] else None, km=x["km"], loc=x["country"],
                        body=body, gear=gear, vin=x["chassis"], lot=lot, url=x["url"], year=year, src=key, event=x["sale"]))
        if key in ("pcar", "gaa") and x["sold"]: own[-1]["hammer"] = x["amt"]   # the price as the site shows it
        # the highest bid of an unsold lot where the house's list gives it (PCARMARKET): its own channel in the model
        b = x.get("bid")
        if not x["sold"] and b and (x["cur"] == "EUR" or x["cur"] in fx):
            own[-1].update(bid=round(to_eur(b, x["cur"], x["date"])), bidCur=x["cur"], orig=b, cur=x["cur"])
        # the house's estimate, for unsold lots only: shown in the app, never part of the market value
        e = x.get("est")
        if not x["sold"] and e and (e[2] == "EUR" or e[2] in fx):
            own[-1].update(estLow=round(to_eur(e[0], e[2], x["date"])), estHigh=round(to_eur(e[1], e[2], x["date"])))
    by_chassis = collections.defaultdict(list)
    for r in own:
        if len(chassis_key(r["vin"])) >= 5: by_chassis[chassis_key(r["vin"])].append(r)
    def covered(u):
        k = chassis_key(u["vin"])
        if len(k) >= 5 and any(abs(day(r["date"]) - day(u["date"])) <= 7 for r in by_chassis.get(k, [])): return True
        return any(r["variant"] == u["variant"] and abs(day(r["date"]) - day(u["date"])) <= 7 and r["sold"] == u["sold"]
                   and (not u["sold"] or abs(r["eur"] / u["eur"] - 1) < 0.02) for r in own)
    before = len(out)
    out = [u for u in out if not (u["src"] == "ucp" and u["house"] == house and covered(u))]
    print("%s: %d results from the house, %d ultimatecarpage rows replaced" % (house, len(own), before - len(out)))
    out += own
# --- Hammer Price app (hammerprice.csv next to this script, see hammerprice.py): sales and houses we cannot fetch,
# and the highest bid of unsold lots
import hammerprice
_hp = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hammerprice.csv")
if os.path.exists(_hp):
    def _eur(a, c, d): return to_eur(a, c, d) if c == "EUR" or c in fx else None
    out += hammerprice.load(_hp, classify, _eur, out, house_search)
# --- lot links and photos for the rows that came without a lot page (lotlinks.py)
import lotlinks
out = lotlinks.apply(out, S)
json.dump(out, open(S + "/web/sales_all.json", "w"), ensure_ascii=False)
c = collections.Counter(o["variant"] for o in out if o["sold"])
print(len(out), sum(c.values()))

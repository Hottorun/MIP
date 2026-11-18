"""PCARMARKET results straight from PCARMARKET: every finished Porsche car auction with price, end day, VIN and mileage.

usage: python3 -I pcarfetch.py WORK [--lot-pages N]

1. Auction list: the search the PCARMARKET website uses itself for its results pages (the site's server function
   https://www.pcarmarket.com/_serverFn/<SEARCH>, which queries PCARMARKET's Basta auction index; the request body
   is TanStack Start's serialised {"data": {...}} as the site's JavaScript sends it), filtered on finished auctions
   of the make Porsche ("status:ITEM_CLOSED && schemaData.vehicle-2.make:=Porsche"), newest first, 250 auctions per
   request (pages of 20 where a page is too large for PCARMARKET's backend), about 80 requests for the whole list. Each auction carries its id, slug (the
   address /results/<slug>), title, end time, result (WON / PASSED), the winning or highest bid in cents, the number
   of bids, the location ("Burlingame, CA") and, for most auctions since 2021, the country ("United States"), and
   a sale made after the auction (directSell / ItemSoldNotification: an accepted offer or a MarketPlace "Buy Now").
   Porsche cars only: the make filter is PCARMARKET's own vehicle schema field, so parts, memorabilia and watches
   (other schemas) and other makes never come back; replicas of Porsches (Beck, Intermeccanica ...) are filed by
   PCARMARKET under their builder's make and are left out with them. Whatever else is not a road car (race cars,
   "outlaws", conversions) classify.py rejects. The index starts in March 2019: PCARMARKET's auctions from 2017 to
   early 2019 are not in it and cannot be fetched this way.
   A daily run reads newest first and stops at the first page whose auctions are all known and ended more than
   REFRESH days ago (an unsold auction can still be sold by offer or on the MarketPlace for 30 days), so usually one
   request.
2. VIN, odometer reading, true-mileage-unknown flag and build year: from the auction page's data (server function
   https://www.pcarmarket.com/_serverFn/<SALE> with the auction's slug, the request the auction page makes; the
   vehicle record PCARMARKET's sellers fill in: vin, odometerValue, odometerUnit, tmu, year, country), once per
   auction and only for auctions classify.py assigns to a variant (cached, reduced to these fields, in
   WORK/web/pcar/lots.json), newest first. --lot-pages N stops after N new auction pages, so that a first run can be
   spread over days; auctions without their page yet are written without VIN and mileage.
Result and price: an auction the site marks WON is sold, at the price the site shows: the winning bid, or the amount
of a sale PCARMARKET records after the auction (accepted offer). An auction that PASSED (reserve not met) but was then
sold by accepted offer or MarketPlace "Buy Now" (directSell) is sold at that amount, dated by the auction's end day
like every row. Every other PASSED auction is unsold, with its highest bid in `bid` (None without bids).
Buyer's fee: PCARMARKET's buyers pay 5 % of the winning bid on top (vehicles: minimum $500, maximum $5,000; $7,500
for auctions closed after 27 June 2025; FAQ "How much is the Buyer's Fee?"). The site shows and this file writes
the winning bid WITHOUT that fee, as Bring a Trailer does; nothing is added here.
Title: the site's title from the year on ("48k-Mile 1989 Porsche 911 Carrera" -> "1989 Porsche 911 Carrera"),
"Porsche" put after the year where PCARMARKET left it out; kept only if classify.py assigns both that and the full
title (a prefix such as "Modified" or "Turbocharged" still rules a car out). Date: the UTC day the auction ended
(PCARMARKET auctions end around noon Pacific time). Country: the vehicle record's country as ISO code, else "US" (a
Canadian province in the location gives "CA"). Mileage: odometerValue in its unit, converted to km, None if the seller
marked it TMU (true mileage unknown) or left it empty. All prices in US dollars.
Writes WORK/web/pcar/pcar.json, which build.py reads. PCARMARKET's permission for this access confirmed by the project
owner on 18 November 2026. One request every 1.5 seconds. Stops if PCARMARKET answers with a bot challenge.
"""
import datetime as dt, gzip, json, os, re, sys, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITE = "https://www.pcarmarket.com"
# the site's server functions (ids from its JavaScript bundle, /assets/index-*.js): search, and one auction by slug
SEARCH = "8bfe2e8c74b1d57f936e66478bcb4d4e5d62798af21e70eb849f93ad4dd32fa3"
SALE = "4e547137e4a9a7950d38c21a5f00acd740cc7aafdf1f645e2b94a6668d47f138"
FILTER = "status:ITEM_CLOSED && schemaData.vehicle-2.make:=Porsche"
DELAY = 1.5        # robots.txt (User-agent: *) sets no Crawl-delay and does not disallow these paths
PAGE = 100         # the index answers at most 250 hits per page, but refuses pages over 4 MB (long records)
SUB = 20           # page size for a page that was too large
REFRESH = 45       # days within which a known auction is read again (MarketPlace sales after the auction)
W = sys.argv[1]
# without --lot-pages: at most 600 new auction pages per run (about 45 minutes), so the daily run fills the first
# 5,000 over nine days instead of running for six hours once
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else 600
# replicas, conversions and tuner cars by the words of the auction's address (the title is checked by classify.py)
NOT_ORIGINAL = re.compile(r"(?:^|-)(?:replica|recreation|tribute|outlaw|restomod|backdate[d]?|modified|custom|ruf|rwb|singer|conversion|"
                          r"swap|swapped|project|salvage|rebuilt|widebody|hot-rod|build|clone|kit-car|lotec|gemballa|techart)(?:-|$)")
DIR = os.path.join(W, "web", "pcar")
os.makedirs(DIR, exist_ok=True)
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|cf_chl_opt|turnstile|captcha|Attention Required|Access denied", re.I)
COUNTRIES = {"united states": "US", "usa": "US", "us": "US", "canada": "CA", "mexico": "MX", "germany": "DE", "united kingdom": "GB",
             "uk": "GB", "england": "GB", "france": "FR", "italy": "IT", "netherlands": "NL", "belgium": "BE", "switzerland": "CH",
             "austria": "AT", "spain": "ES", "portugal": "PT", "sweden": "SE", "denmark": "DK", "norway": "NO", "japan": "JP",
             "australia": "AU", "new zealand": "NZ", "puerto rico": "PR", "united arab emirates": "AE", "hong kong": "HK",
             "singapore": "SG", "ireland": "IE", "luxembourg": "LU", "monaco": "MC", "poland": "PL", "czech republic": "CZ", "hungary": "HU", "finland": "FI", "greece": "GR", "south africa": "ZA",
             "brazil": "BR", "south korea": "KR", "taiwan": "TW", "israel": "IL", "saudi arabia": "SA", "qatar": "QA"}
PROVINCES = r",\s*(AB|BC|MB|NB|NL|NS|ON|PE|QC|SK|Alberta|British Columbia|Ontario|Quebec|Québec)\b"


class Blocked(Exception): pass


# ------------------------------------------------------------------- TanStack Start (seroval) request / response
def enc(v, ids):
    if v is None: return {"t": 2, "s": 0}
    if isinstance(v, bool): return {"t": 2, "s": 2 if v else 3}
    if isinstance(v, (int, float)): return {"t": 0, "s": v}
    if isinstance(v, str): return {"t": 1, "s": v}
    i = ids[0]; ids[0] += 1
    if isinstance(v, list): return {"t": 9, "i": i, "l": len(v), "a": [enc(x, ids) for x in v], "o": 0}
    return {"t": 10, "i": i, "p": {"k": list(v), "v": [enc(x, ids) for x in v.values()]}, "o": 0}


def unescape(s):
    return re.sub(r"\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|.)", lambda m: chr(int(m.group(1)[1:], 16)) if m.group(1)[0] in "xu" and len(m.group(1)) > 1
                  else {"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f", "v": "\v", "0": "\0"}.get(m.group(1), m.group(1)), s)


def dec(n, refs):
    t = n.get("t")
    if t == 0: return n["s"]
    if t == 1: return unescape(n["s"])
    if t == 2: return {2: True, 3: False}.get(n["s"])       # null, undefined, true, false (NaN etc. as None)
    if t == 4: return refs[n["i"]]
    if t == 9:
        a = refs[n["i"]] = []
        a.extend(dec(x, refs) if x else None for x in n["a"])
        return a
    if t in (10, 11):
        o = refs[n["i"]] = {}
        for k, v in zip(n["p"]["k"], n["p"]["v"]): o[k] = dec(v, refs)
        return o
    if t == 25: return {"error": dec(n["s"].get("message", {"t": 1, "s": ""}), refs) if isinstance(n.get("s"), dict) else str(n)}
    return None


def call(fn, data, referer):
    """Calls one of the site's server functions with data, returns its decoded result. None after three failed tries.
    Raises Blocked on a bot challenge, exits on an error the server reports."""
    time.sleep(DELAY)
    body = json.dumps({"t": enc({"data": data}, [0]), "f": 63, "m": []}).encode()
    req = urllib.request.Request(SITE + "/_serverFn/" + fn, data=body, headers={
        "User-Agent": UA, "Accept-Encoding": "gzip", "Content-Type": "application/json", "x-tsr-serverFn": "true",
        "Accept": "application/x-tss-framed, application/x-ndjson, application/json", "Origin": SITE, "Referer": referer})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if not t.lstrip().startswith("{"):
                    if CHALLENGE.search(t[:5000]): raise Blocked(fn)
                    raise ValueError("not JSON: %r" % t[:200])
                d = dec(json.loads(t), {}) or {}
                if d.get("error"):
                    # the index's backend refuses pages whose full records exceed 4 MB: the caller asks for smaller pages
                    if "ResourceExhausted" in str(d["error"]): return {"too_large": True}
                    # a timeout behind the site ("Basta read timed out"): tried again, then skipped
                    if re.search(r"timed? ?out|timeout|unavailable", str(d["error"]), re.I): raise ValueError(str(d["error"])[:200])
                    sys.exit("PCARMARKET server function error: %s" % str(d["error"])[:500])
                return d.get("result")
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.code in (403, 429, 503) and (CHALLENGE.search(t) or not t.lstrip().startswith("{")): raise Blocked("%s (HTTP %d)" % (fn, e.code))
            if e.code in (400, 404): print("failed", fn, e.code, t[:300], flush=True); return None
            print("retry", fn, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", fn, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p):
    json.dump(obj, open(p + ".tmp", "w"), ensure_ascii=False)
    os.replace(p + ".tmp", p)


def slug(a):
    parts = (a.get("slugFullPath") or "").strip("/").split("/")
    return parts[1] if len(parts) > 1 else ""


def keep(n):
    """The fields of a search hit this file uses."""
    sold = n.get("directSell") or next((x for x in n.get("notifications") or [] if x and x.get("__typename") == "ItemSoldNotification"), None)
    return dict(id=n["id"], slug=slug(n), title=n.get("title") or "", status=n.get("status"), result=n.get("itemResult"),
                bid=n.get("currentBid"), bids=n.get("totalBids"), cur=n.get("currency"), end=(n.get("dates") or {}).get("closingEnd"),
                location=n.get("location"), country=((n.get("schema") or {}).get("data") or {}).get("country"),
                offer=bool(n.get("offerEnabled")), buynow=bool(n.get("buyNowEnabled")),
                after=dict(amount=sold.get("amount"), source=sold.get("source"), date=sold.get("timestamp") or sold.get("date")) if sold else None)


def search(size, page):
    """One page of finished Porsche auctions, newest first: (search result, hits); (None, None) if too large."""
    d = call(SEARCH, {"type": "ITEM", "query": "*", "orderBy": "dates.closingEndEpoch:desc", "first": size, "page": page,
                      "filterBy": FILTER}, SITE + "/results/vehicles/porsche")
    if d and d.get("too_large"): return None, None
    if not d or not d.get("search"): sys.exit("PCARMARKET search failed on page %d" % page)
    s = d["search"]
    return s, [e["node"] for e in s.get("edges") or [] if e and (e.get("node") or {}).get("__typename") == "Item"]


try:
    # ------------------------------------------------------------------------------------------------ 1. auction list
    auctions, auctions_p = load("auctions.json", {})
    first_run = not auctions
    limit = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=REFRESH)).isoformat()
    page, total, new = 1, None, 0
    while True:
        s, hits = search(PAGE, page)
        if s is None:
            # too large: the same auctions as pages of SUB
            hits = []
            for sub in range((page - 1) * PAGE // SUB + 1, page * PAGE // SUB + 1):
                s2, h2 = search(SUB, sub)
                if s2 is None: sys.exit("PCARMARKET search: page %d of %d still too large" % (sub, SUB))
                hits += h2
            s = dict(s2, pageInfo=dict(s2["pageInfo"], totalPages=-(-s2["pageInfo"]["totalRecords"] // PAGE),
                                       hasNextPage=page * PAGE < s2["pageInfo"]["totalRecords"]))
        total = s["pageInfo"]["totalRecords"]
        known = all(h["id"] in auctions for h in hits)
        for h in hits:
            new += h["id"] not in auctions
            auctions[h["id"]] = keep(h)
        print("list page", page, "of", s["pageInfo"]["totalPages"], len(auctions), "of", total, "auctions", flush=True)
        if not s["pageInfo"].get("hasNextPage") or not hits: break
        # incremental: stop once a whole page is known and older than the refresh window
        if not first_run and known and min((h.get("dates") or {}).get("closingEnd") or "" for h in hits) < limit: break
        page += 1
    save(auctions, auctions_p)
    print(new, "new auctions;", len(auctions), "known,", total, "in PCARMARKET's index", flush=True)

    # results: finished auctions with a usable title
    cands, rejected = [], []
    for a in auctions.values():
        if a["status"] != "ITEM_CLOSED" or not a["end"] or not a["slug"] or (a["cur"] or "USD") != "USD": continue
        full = re.sub(r"\s+", " ", a["title"]).strip()
        m = re.search(r"\b(19[4-9]\d|20[0-3]\d)(?:\.5)?\b\s+(.*)$", full)
        title = None
        if m:
            rest = m.group(2)
            if not re.match(r"porsche\b", rest, re.I): rest = "Porsche " + rest
            title = "%s %s" % (m.group(1), rest)
        if not title or not classify(title) or not classify(full if re.search(r"\bporsche\b", full, re.I) else title):
            rejected.append(full)
            continue
        # the page address often says what the title leaves out ("1977 Porsche 911S Coupe" at .../1977-porsche-911-outlaw)
        if NOT_ORIGINAL.search(a.get("slug") or ""):
            rejected.append(full + " [" + a["slug"] + "]")
            continue
        cands.append((a, title))
    cands.sort(key=lambda c: c[0]["end"], reverse=True)
    print(len(cands), "auctions assigned to a variant,", len(rejected), "not; e.g.", "; ".join(rejected[:12]), flush=True)

    # ------------------------------------------------------------------------------------------------ 2. auction pages
    details, details_p = load("lots.json", {})
    todo = [a for a, _ in cands if a["id"] not in details]
    if LOT_PAGES is not None: todo = todo[:LOT_PAGES]
    new_lots = 0
    for a in todo:
        d = call(SALE, {"slug": a["slug"]}, SITE + "/results/" + a["slug"])
        if d is None: continue
        sale = d.get("sale") or {}
        items = [e["node"] for e in ((sale.get("items") or {}).get("edges") or []) if e and e.get("node")]
        it = next((x for x in items if x.get("id") == a["id"]), items[0] if items else None)
        v = ((it or {}).get("schema") or {}).get("data") or {}
        # an auction the site does not return any more is remembered as empty and not asked for again
        details[a["id"]] = {k: v.get(k) for k in ("vin", "odometerValue", "odometerUnit", "tmu", "5DigitOdometer", "year", "model", "country")} if it else {}
        if it: details[a["id"]]["reserveStatus"] = it.get("reserveStatus")
        new_lots += 1
        if new_lots % 25 == 0 or new_lots == len(todo):
            save(details, details_p)
            print("auction pages", new_lots, "of", len(todo), flush=True)
    save(details, details_p)
except Blocked as e:
    sys.exit("PCARMARKET answered with a bot challenge or blocked the request (%s); stopped. "
             "Ask PCARMARKET to allowlist this access or for an export." % e)


def country_of(a, lot):
    c = (lot.get("country") or a.get("country") or "").strip()
    if c:
        # "Canada (US-market car)": the name before a note
        iso = COUNTRIES.get(c.lower()) or COUNTRIES.get(re.split(r"\s*[(,/]", c)[0].strip().lower()) or (c.upper() if re.fullmatch(r"[A-Za-z]{2}", c) else None)
        if iso: return iso
        print("unknown country", repr(c), "->", "US", flush=True)
    if re.search(PROVINCES, a.get("location") or ""): return "CA"
    return "US"


def km_of(lot):
    """Odometer reading in km from the vehicle record; None if TMU or not given."""
    if lot.get("tmu"): return None
    try: n = float(str(lot.get("odometerValue")).replace(",", ""))
    except (TypeError, ValueError): return None
    if n <= 0: return None
    unit = (lot.get("odometerUnit") or "Miles").strip().lower()
    return int(round(n * (1 if unit.startswith("k") else 1.609344)))


def chassis_of(lot):
    c = re.sub(r"\s+", "", lot.get("vin") or "").upper()
    return "" if re.fullmatch(r"(N/?A|NONE|UNKNOWN|TBD|-+|0+)?", c) else c


def cents(x):
    try: return int(round(float(x) / 100)) if x else None
    except (TypeError, ValueError): return None


out, unsold_no_bid = [], 0
for a, title in cands:
    lot = details.get(a["id"]) or {}
    after = a.get("after") or {}
    if a["result"] and a["result"].startswith(("WON", "ITEM_RESULT_WON")):
        sold, amt = True, cents(after.get("amount")) or cents(a["bid"])
    elif after.get("amount"):
        sold, amt = True, cents(after["amount"])
    else:
        sold, amt = False, None
    if sold and not amt: continue
    rec = dict(code="PCAR", lot=a["slug"], title=title, date=a["end"][:10], sold=sold, amt=amt, cur="USD",
               country=country_of(a, lot), chassis=chassis_of(lot), km=km_of(lot), url="%s/results/%s" % (SITE, a["slug"]),
               sale="PCARMARKET")
    if not sold:
        rec["bid"] = cents(a["bid"]) if a.get("bids") else None
        unsold_no_bid += rec["bid"] is None
    out.append(rec)
save(out, os.path.join(DIR, "pcar.json"))
years = {}
for o in out: years.setdefault(o["date"][:4], [0, 0])[0 if o["sold"] else 1] += 1
print(len(out), "PCARMARKET results (%d sold, %d not sold, %d of them without bids); %d with VIN, %d with mileage;"
      % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out), unsold_no_bid, sum(bool(o["chassis"]) for o in out),
         sum(o["km"] is not None for o in out)), new_lots, "new auction pages, %d still without their page"
      % sum(a["id"] not in details for a, _ in cands), flush=True)
print("per year (sold, not sold):", ", ".join("%s %d/%d" % (y, s, u) for y, (s, u) in sorted(years.items())), flush=True)

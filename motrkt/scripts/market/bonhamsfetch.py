"""Bonhams results straight from Bonhams: every Porsche car lot with price, sale date, chassis number and mileage.

usage: python3 -I bonhamsfetch.py WORK [--lot-pages N]

1. Lot list: the search the Bonhams websites use themselves (Typesense behind https://api01.bonhams.com/search-proxy,
   collection "lots"; the public search-only key is read from the JS of cars.bonhams.com and cached in
   WORK/web/bonhams/key.json). Query: "porsche" in the lot title, department Cars (MOT-CAR), sold or bought in
   (SOLD, BI), hammer time since 2015-01-01; 250 lots per request, about 5 requests. Each lot carries the sale id, lot
   number, title with chassis number, local hammer time, sale country and currency, and the price including buyer's
   premium ("hammerPremium", what Bonhams shows as "Sold for"). The whole list is fetched on every run.
2. Sale names: from the "auctions-search" collection, 100 sales per request, once per sale (cached in
   WORK/web/bonhams/sales.json).
3. Mileage: from the lot's catalogue text ("catalogDesc"), fetched 50 lots per request, once per lot and only for
   auctioned lots that classify.py assigns to a variant (cached in WORK/web/bonhams/lots/). No HTML lot pages are
   needed. --lot-pages N stops after N new lot texts (for a first test run).
Writes WORK/web/bonhams/bonhams.json, which build.py reads. Bonhams' permission for this access confirmed by the
project owner on 11 November 2026 (again on 13 November 2026). One request every 1.5 seconds. A bot challenge is never
worked around: on the lot list nothing is written; on sale names or catalogue texts (filtered searches, which Bonhams
sometimes answers with a challenge) no further request is made and the results are written without sale name or
mileage, from what is cached.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITE = "https://cars.bonhams.com"
DELAY = 1.5
PAGE = 250
SINCE = int(dt.datetime(2015, 1, 1, tzinfo=dt.timezone.utc).timestamp())
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "bonhams")
os.makedirs(os.path.join(DIR, "lots"), exist_ok=True)


class Blocked(Exception): pass


def get(url, headers=None):
    """(status, body as text). Status None after three failed tries. Raises Blocked on a bot challenge."""
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", **(headers or {})})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if not t.lstrip().startswith(("{", "[")) and re.search(r"cf-chl|challenge-platform|captcha|Just a moment\.\.\.|_Incapsula_|akamai-bm|Access Denied", t[:5000], re.I):
                    raise Blocked(url)
                return r.status, t
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.code in (403, 429, 503) and re.search(r"cf-chl|challenge|captcha|Just a moment", t, re.I): raise Blocked(url)
            if e.code in (400, 401, 403, 404, 410): return e.code, t
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None, None


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


# ------------------------------------------------------------------------------------------------ search access
key, key_p = load("key.json", {})


def discover_key():
    """Host and search-only key of the Typesense proxy, as configured in the cars.bonhams.com JS bundle."""
    st, h = get(SITE + "/auctions/results/")
    if st != 200: sys.exit("Bonhams: cars.bonhams.com answered %s" % st)
    for js in re.findall(r'src="(/_next/static/chunks/pages/_app-[^"]+\.js)"', h):
        st, b = get(SITE + js)
        m = re.search(r'host:"([^"]+)",port:Number\("(\d+)"\),protocol:"(\w+)",path:"(/search-proxy)",apiKey:"([^"]+)"', b or "")
        if m:
            key.update(base="%s://%s:%s%s" % (m.group(3), m.group(1), m.group(2), m.group(4)), key=m.group(5))
            save(key, key_p)
            return
    sys.exit("Bonhams: search key not found in the site's JS")


def search(collection, **params):
    """One Typesense search request; the key is looked up again once if it was rejected."""
    for attempt in range(2):
        if not key: discover_key()
        url = "%s/collections/%s/documents/search?%s" % (key["base"], collection, urllib.parse.urlencode(params))
        st, b = get(url, {"X-TYPESENSE-API-KEY": key["key"], "Accept": "application/json",
                          "Origin": SITE, "Referer": SITE + "/"})
        if st in (401, 403) and attempt == 0:
            key.clear(); continue
        if st != 200: sys.exit("Bonhams search failed (%s): %s" % (st, (b or "")[:300]))
        return json.loads(b)


try:
    # -------------------------------------------------------------------------------------------- 1. lot list
    lots, page = {}, 1
    while True:
        d = search("lots", q="porsche", query_by="title", per_page=PAGE, page=page,
                   filter_by="department.code:=MOT-CAR && status:[SOLD,BI] && hammerTime.timestamp:>=%d" % SINCE,
                   sort_by="hammerTime.timestamp:desc", exclude_fields="catalogDesc,footnotes,image,styledDescription")
        for h in d["hits"]: lots[h["document"]["id"]] = h["document"]
        pages = (d["found"] + PAGE - 1) // PAGE
        print("list page", page, "of", pages, len(lots), "lots", flush=True)
        if page >= pages or not d["hits"]: break
        page += 1
    if len(lots) < d["found"]: print("note:", d["found"] - len(lots), "of", d["found"], "lots not returned this run", flush=True)

    LABEL = r"(?:Chassis\s+no\.?|Chassis\s+number|VIN\s*(?:no\.?)?\.?|Frame\s+no\.?)"
    STOP = r"(?=\s+(?:Engine|Body|Gearbox|Transmission|Registration|Coachwork|Frame|Car)\s+no\b|\s*\(|\s*,|\s+[–-]\s|$)"

    def split_title(t):
        """"1959 Porsche 356A 1600 Coupé Chassis no. 107613 Engine no. P821821 (see text)" ->
        ("1959 Porsche 356A 1600 Coupé", "107613")"""
        t = text(t)
        m = re.search(r"\s+" + LABEL + r"\s*", t, re.I)
        if not m: return re.split(r"\s+Engine\s+no\b", t, flags=re.I)[0].strip(), ""
        c = re.match(r"(.*?)" + STOP, t[m.end():])
        return t[: m.start()].strip(), (c.group(1).strip() if c else "")

    def local_date(ts):
        """Calendar day of a Bonhams time object at the saleroom."""
        if not ts or not ts.get("timestamp"): return None
        try: tz = ZoneInfo(ts["timezone"]["iana"])
        except Exception: tz = dt.timezone.utc
        return dt.datetime.fromtimestamp(ts["timestamp"], tz).date().isoformat()

    cands = []
    for x in lots.values():
        if x.get("status") not in ("SOLD", "BI") or x.get("brand") != "bonhams-cars": continue
        sold = x["status"] == "SOLD"
        amt = (x.get("price") or {}).get("hammerPremium")
        if sold and not amt: continue
        title, chassis = split_title(x["title"])
        c = classify(title)
        date = local_date(x.get("hammerTime")) or local_date(x.get("auctionEndDate"))
        if c and date and date >= "2015-01-01": cands.append((x, title, chassis, date, sold, round(amt) if sold else None))
    print(len(cands), "auction results assigned to a variant", flush=True)
except Blocked as e:
    sys.exit("Bonhams answered the lot list with a bot challenge (%s); stopped, nothing written." % e)

def lot_path(x): return os.path.join(DIR, "lots", "%s.json" % re.sub(r"[^A-Za-z0-9-]", "_", x["id"]))


# ------------------------------------------------------------------------------------------------ 2. sale names
sales, sales_p = load("sales.json", {})
new_pages, blocked = 0, None
try:
    todo = sorted({x["auctionId"] for x, *_ in cands} - set(sales))
    for i in range(0, len(todo), 100):
        ids = todo[i: i + 100]
        d = search("auctions-search", q="*", per_page=100, filter_by="id:[%s]" % ",".join("`%s`" % s for s in ids),
                   include_fields="id,auctionTitle,auctionHeading,dates,country")
        for h in d["hits"]:
            a = h["document"]
            sales[a["id"]] = dict(name=text(a.get("auctionTitle") or a.get("auctionHeading")),
                                  start=local_date((a.get("dates") or {}).get("start")), country=(a.get("country") or {}).get("code") or "")
        for s in ids: sales.setdefault(s, dict(name="", start=None, country=""))
        save(sales, sales_p)
        print("sales", i + len(ids), "of", len(todo), flush=True)

    # -------------------------------------------------------------------------------------------- 3. catalogue texts
    todo = [x for x, *_ in cands if not os.path.exists(lot_path(x))]
    if LOT_PAGES is not None: todo = todo[:LOT_PAGES]
    for i in range(0, len(todo), 50):
        part = todo[i: i + 50]
        d = search("lots", q="*", per_page=50, filter_by="id:[%s]" % ",".join("`%s`" % x["id"] for x in part),
                   include_fields="id,catalogDesc,footnotes")
        for h in d["hits"]:
            doc = h["document"]
            p = os.path.join(DIR, "lots", "%s.json" % re.sub(r"[^A-Za-z0-9-]", "_", doc["id"]))
            save(dict(catalogDesc=doc.get("catalogDesc") or "", footnotes=doc.get("footnotes") or ""), p)
            new_pages += 1
        print("lot texts", i + len(part), "of", len(todo), flush=True)
except Blocked as e:
    blocked = str(e)
    print("Bonhams answered with a bot challenge, no further requests this run; results without the missing sale names"
          " and mileages", flush=True)


MILEAGE = r"\b(\d{1,3}(?:[,.] ?\d{3})+|\d+)\s*(kilometres|kilometers|kms?|miles)\b"
ODO = r"\b(odometer|speedometer|mileage|showing|shows|indicat|displays|reads|recorded|covered|from new)"


def km_of(desc):
    """Stated mileage (km, rounded to 100) from the catalogue text: the bullet points under the lot name, which state
    the odometer (e.g. "Displays a little over 62,515 kilometres"), else a sentence of the text that gives the
    odometer reading at the time of cataloguing."""
    body = re.split(r'<div class="LotDesc">', desc, maxsplit=1)[-1]
    bullets = [text(b) for b in re.findall(r"(?:•|&bull;|&#8226;)(.*?)(?=<br|•|&bull;|&#8226;|</div>|$)", body, re.S)]
    sents = [s for s in re.split(r"(?<=[.!?])\s+", text(body)) if re.search(r"odometer|speedometer", s, re.I)
             and re.search(r"cataloguing|catalogue|writing|currently|present|today|now (?:reads|shows|displays|indicates)", s, re.I)]
    for t in bullets + sents:
        if not re.search(ODO, t, re.I): continue
        # mileage since a rebuild/restoration/service, or of an engine, is not the odometer
        if re.search(r"\bsince\b|rebuil|restor|service|engine|overhaul|gearbox|warranty|tyres|interval", t, re.I) and not re.search(r"odometer|from new|total", t, re.I):
            continue
        m = re.search(MILEAGE, t, re.I)
        if m:
            n = int(re.sub(r"\D", "", m.group(1)))
            return round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100
    return None


def lot_no(x):
    """Lot number as printed ("123", "123A"); Bonhams gives it as {"full": ...}, as {"number", "letter"} or not at all."""
    n = x.get("lotNo")
    if isinstance(n, dict): return n.get("full") or ("%s%s" % (n.get("number") or "", n.get("letter") or "")).strip() or str(x["lotId"])
    return str(n or x["lotId"])


out = []
for x, title, chassis, date, sold, amt in cands:
    p = lot_path(x)
    desc = json.load(open(p))["catalogDesc"] if os.path.exists(p) else ""
    if not chassis:
        m = re.search(r'<div class="LotName">(.*?)</div>', desc, re.S)
        chassis = split_title(m.group(1))[1] if m else ""
    s = sales.get(x["auctionId"]) or {}
    out.append(dict(id=x["id"], code=x["auctionId"], lot=lot_no(x), title=title,
                    date=date, sold=sold, amt=amt, cur=(x.get("currency") or {}).get("iso_code") or None,
                    country=(x.get("country") or {}).get("code") or s.get("country") or "", chassis=chassis, km=km_of(desc),
                    url="https://www.bonhams.com/auction/%s/lot/%s/" % (x["auctionId"], x["lotId"]), sale=s.get("name") or ""))
json.dump(out, open(os.path.join(DIR, "bonhams.json"), "w"), ensure_ascii=False)
print(len(out), "Bonhams results since 2015;", new_pages, "new lot texts;", sum(1 for o in out if o["km"]), "with mileage", flush=True)

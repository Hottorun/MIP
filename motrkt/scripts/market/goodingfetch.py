"""Gooding & Company results straight from Gooding: every Porsche lot with price, sale date, chassis number and mileage.

usage: python3 -I goodingfetch.py WORK [--lot-pages N]

1. Lot list: the vehicle search the Gooding website uses itself (GraphQL at https://cdn.goodingco.com/graphql, query
   getVehicles, make "Porsche", the anonymous "Authorization: Bearer" header the site sends), all lots in one request
   of up to 1000. Each lot carries slug, lot number, title, sale name and type (live, online, private sale), currency
   and the price including buyer's premium (what Gooding shows as "Sold"; empty if not sold). The whole list is
   fetched on every run (one or two requests).
2. Chassis number, sale days, sale country, mileage and the estimate: from the lot's Gatsby page data
   (https://www.goodingco.com/page-data/lot/<slug>/page-data.json), once per lot and only for auctioned lots since 2015
   that classify.py assigns to a variant (cached in WORK/web/gooding/lots/). Live sales are dated by their first day
   (Gooding does not say on which day a lot crossed the block), online sales by their closing day. Mileage only from a highlight that states
   the odometer ("Displayed 25,903 Miles at the Time of Cataloguing"); Gooding's page data has no catalogue text.
   --lot-pages N stops after N new lot pages (for a first test run).
Gooding's records for sales before mid-2019 carry placeholder dates (e.g. Pebble Beach 2018 on 1 August instead of
24 August); those sales take their first day from LEGACY below.
Writes WORK/web/gooding/gooding.json, which build.py reads. Gooding & Company's permission for this access confirmed
by the project owner on 11 November 2026. One request every 1.5 seconds. Stops if Gooding answers with a bot challenge.
"""
import datetime as dt, gzip, json, os, re, sys, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITE = "https://www.goodingco.com"
API = "https://cdn.goodingco.com/graphql"
DELAY = 1.5
PAGE = 1000
SINCE = "2015-01-01"
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "gooding")
os.makedirs(os.path.join(DIR, "lots"), exist_ok=True)
NOW = dt.datetime.now(dt.timezone.utc)

# First sale day of sales whose Gooding record has a placeholder date (09:00-17:00 on a wrong day, set when the old
# results were imported); from the sale announcements, matches the dates ultimatecarpage gives.
LEGACY = {"Scottsdale Auctions 2015": "2015-01-16", "Amelia Island 2015": "2015-03-13", "Pebble Beach Auctions 2015": "2015-08-15",
          "Scottsdale Auctions 2016": "2016-01-29", "Amelia Island Auctions 2016": "2016-03-11", "Pebble Beach Auctions 2016": "2016-08-19",
          "Scottsdale Auctions 2017": "2017-01-20", "Amelia Island Auctions 2017": "2017-03-10", "Pebble Beach Auctions 2017": "2017-08-18",
          "Scottsdale Auctions 2018": "2018-01-19", "Amelia Island Auctions 2018": "2018-03-09", "Pebble Beach Auctions 2018": "2018-08-24",
          "Scottsdale Auctions 2019": "2019-01-18", "Amelia Island 2019": "2019-03-08"}

QUERY = """query GetVehiclesAndFilters($filtersInput: FiltersInput!, $pageNumber: Int, $sortBy: SortBy!, $hitsPerPage: Int) {
  getVehicles(filtersInput: $filtersInput, pageNumber: $pageNumber, sortBy: $sortBy, updateFilters: false, hitsPerPage: $hitsPerPage) {
    vehicles { objectID make modelYear model title slug lotNumber salePrice privateSalesPrice askingPrice currency
               auctionType auctionName auctionStartDate auctionEndDate upcomingAuctionEndDate activeAuction itemType }
    hitsPerPage page nbPages nbHits } }"""


class Blocked(Exception): pass


def get(url, body=None):
    """Response body as text; POSTs body as JSON to the GraphQL API. None after three failed tries, "" for a missing
    page. Raises Blocked on a bot challenge."""
    time.sleep(DELAY)
    headers = {"User-Agent": UA, "Accept-Encoding": "gzip"}
    if body is not None:
        headers.update({"Content-Type": "application/json", "Accept": "application/json", "Authorization": "Bearer",
                        "Origin": SITE, "Referer": SITE + "/"})
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if not t.lstrip().startswith(("{", "[")) and re.search(r"cf-chl|challenge-platform|captcha|Just a moment\.\.\.|_Incapsula_|akamai-bm|Access Denied", t[:5000], re.I):
                    raise Blocked(url)
                return t
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.code in (403, 429, 503) and re.search(r"cf-chl|challenge|captcha|Just a moment", t, re.I): raise Blocked(url)
            if e.code in (404, 410): return ""
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def ts_date(ms):
    """UTC date of an epoch-milliseconds string, or None."""
    try: return dt.datetime.fromtimestamp(int(ms) / 1000, dt.timezone.utc)
    except (TypeError, ValueError): return None


try:
    # -------------------------------------------------------------------------------------------- 1. lot list
    lots, page = {}, 0
    while True:
        raw = get(API, {"operationName": "GetVehiclesAndFilters", "query": QUERY,
                        "variables": {"filtersInput": {"make": ["Porsche"]}, "sortBy": "DEFAULT", "pageNumber": page, "hitsPerPage": PAGE}})
        if not raw: sys.exit("Gooding search failed on page %d" % page)
        d = json.loads(raw)
        if d.get("errors") or not (d.get("data") or {}).get("getVehicles"): sys.exit("Gooding search error: %s" % str(d.get("errors"))[:500])
        g = d["data"]["getVehicles"]
        for v in g["vehicles"]: lots[v["objectID"]] = v
        print("list page", page + 1, "of", g["nbPages"], len(lots), "of", g["nbHits"], "lots", flush=True)
        if page + 1 >= g["nbPages"] or not g["vehicles"]: break
        page += 1

    # results only: live and online auction lots that sold (price shown) or went unsold after the sale ended; upcoming
    # lots, private sales, lots with an undisclosed price ("privateSalesPrice") and non-cars are not needed
    cands = []
    for v in lots.values():
        if v.get("auctionType") not in ("Live Auction", "Online Only") or v.get("privateSalesPrice") or v.get("askingPrice"): continue
        if v.get("itemType") not in (None, "Cars") or v.get("lotNumber") is None or not v.get("slug"): continue
        start = ts_date(v.get("auctionStartDate"))
        end = ts_date(v.get("auctionEndDate") or v.get("upcomingAuctionEndDate")) or start
        if not start or start.date().isoformat() < SINCE: continue   # placeholder dates of old sales are never later than the real ones
        amt = int(re.sub(r"\D", "", str(v["salePrice"]))) if re.search(r"\d", str(v.get("salePrice") or "")) else None
        # without a price: unsold only once the sale is over (a few days for results to be posted)
        if not amt and (v.get("activeAuction") == "true" or not end or (NOW - end).days < 3): continue
        title = re.sub(r"\s+\([A-Z]{2,3}\d\d\)$", "", re.sub(r"\s+", " ", v.get("title") or "").strip())   # "(PB24)" sale tags
        if not re.match(r"\d{4} ", title) and v.get("modelYear"): title = "%s %s" % (v["modelYear"], title)
        if "porsche" not in title.lower(): title = "%s Porsche %s" % (v.get("modelYear") or "", v.get("model") or title)
        if classify(title): cands.append((v, title, amt))
    print(len(cands), "auction results assigned to a variant", flush=True)

    # -------------------------------------------------------------------------------------------- 2. lot pages
    def lot_path(v): return os.path.join(DIR, "lots", "%s.json" % re.sub(r"[^A-Za-z0-9-]", "_", v["slug"]))

    # newest sales first, so that a limited run and the daily runs fetch the new lots
    cands.sort(key=lambda c: -(int(c[0].get("auctionStartDate") or 0)))
    pages, new_pages = {}, 0
    for v, title, amt in cands:
        p = lot_path(v)
        if not os.path.exists(p):
            if LOT_PAGES is not None and new_pages >= LOT_PAGES: continue
            raw = get("%s/page-data/lot/%s/page-data.json" % (SITE, v["slug"]))
            if raw is None: continue
            new_pages += 1
            try: lot = json.loads(raw)["result"]["data"]["contentfulLot"] if raw else None
            except (ValueError, KeyError, TypeError): lot = None
            json.dump(lot, open(p, "w"), ensure_ascii=False)
        pages[v["objectID"]] = json.load(open(p))
except Blocked as e:
    sys.exit("Gooding answered with a bot challenge (%s); stopped, nothing written." % e)


MILEAGE = r"\b(\d{1,3}(?:[,.] ?\d{3})+|\d+)\s*(kilometres|kilometers|kms?|miles)\b"
ODO = r"\b(odometer|speedometer|show(?:s|ed|ing)|display(?:s|ed|ing)|indicat|reads|recorded|regist|from new|catalogu)"


def km_of(highlights):
    """Stated odometer reading (km, rounded to 100) from the lot's highlights, e.g. "Displayed 25,903 Miles at the Time
    of Cataloguing", "Showing Less than 7,400 Km from New"."""
    for t in [x for h in highlights or [] for x in h.split(";")]:
        if not re.search(ODO, t, re.I): continue
        # mileage since a rebuild/restoration/service, or of an engine, or a race distance is not the odometer
        if re.search(r"\bsince\b|rebuil|restor|service|engine|overhaul|gearbox|race|rally|endurance", t, re.I) and not re.search(r"odometer|from new|catalogu", t, re.I):
            continue
        m = re.search(MILEAGE, t, re.I)
        if m:
            n = int(re.sub(r"\D", "", m.group(1)))
            return round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100
    return None


def first_day(auction):
    """First sale day as printed in the sale's local time ("2024-08-16T16:00-08:00" -> 2024-08-16)."""
    if auction.get("name") in LEGACY: return LEGACY[auction["name"]]
    days = sorted(e["startDate"][:10] for e in auction.get("subEvents") or []
                  if e.get("__typename") == "ContentfulSubEventAuction" and e.get("startDate"))
    return days[0] if days else None


out, warned = [], set()
for v, title, amt in cands:
    lot = pages.get(v["objectID"])
    if not lot: continue
    a = lot.get("auction") or {}
    # online sales: every lot closes on the last day
    end = ts_date(v.get("auctionEndDate")) if v.get("auctionType") == "Online Only" else None
    date = end.date().isoformat() if end else first_day(a)
    if not date or date < SINCE: continue
    subs = [e for e in a.get("subEvents") or [] if e.get("startDate")]
    if a.get("name") not in LEGACY and subs and all(re.search(r"T09:00\+0[12]:00$", e["startDate"]) for e in subs) and (((a.get("location") or {}).get("address") or {}).get("addressCountry") == "US") and a.get("name") not in warned:
        warned.add(a.get("name")); print("note: sale date of", a.get("name"), date, "looks like a placeholder; add it to LEGACY", flush=True)
    item = lot.get("item") or {}
    web = (a.get("webpage__auction") or [{}])[0] or {}
    sale = re.sub(r"\s+", " ", v.get("auctionName") or a.get("name") or "").strip()
    if not re.search(r"\b(19|20)\d\d\b", sale): sale = "%s %s" % (sale, date[:4])   # "Pebble Beach Auctions" every year
    out.append(dict(id=v["objectID"], code=web.get("slug") or slug(sale), lot=str(v["lotNumber"]), title=title, date=date,
                    sold=bool(amt), amt=amt or None, cur=v.get("currency") or a.get("currency") or None,
                    country=((a.get("location") or {}).get("address") or {}).get("addressCountry") or "",
                    chassis=re.sub(r"\s*\(see text\)\s*$", "", re.sub(r"\s+", " ", item.get("chassis") or "").strip(), flags=re.I), km=km_of(item.get("highlights")),
                    url="%s/lot/%s" % (SITE, v["slug"]), sale=sale,
                    est=[lot["lowEstimate"], lot["highEstimate"], v.get("currency") or a.get("currency")] if lot.get("lowEstimate") and lot.get("highEstimate") else None))
json.dump(out, open(os.path.join(DIR, "gooding.json"), "w"), ensure_ascii=False)
print(len(out), "Gooding & Company results since 2015;", new_pages, "new lot pages", flush=True)

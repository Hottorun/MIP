"""Mecum Auctions results straight from Mecum: every Porsche lot with price, sale day, chassis number (VIN) and mileage.

usage: python3 -I mecumfetch.py WORK [--lot-pages N]

1. Lot list: the lot search the Mecum website uses itself (Algolia, application U6CFCQ7V52, index wp_posts_lot, the
   public search-only key from the site's JavaScript), filtered on the make "Porsche" (and the misspelt "Porshe"
   Mecum also uses), 1000 lots per request, about 4 requests. Each lot carries Mecum's lot id (the number in the lot
   URL), title, lot number, sale (name, slug, first and last day), the day the lot crossed the block ("run date"), the
   lot type (Auto, Road Art, Tractor ...), the result ("sold" / "bid-goes-on") and the price including the 10 % buyer's
   premium (what Mecum shows as the sold price). The whole list is fetched on every run. The sale code is the sale's
   slug ("kissimmee-2026"): Mecum's short codes ("FL26") are not available for every sale.
2. VIN / serial, odometer reading and the estimate: from the website's WordPress GraphQL API
   (https://ignition.mecumauctions.com/graphql, the site's NEXT_PUBLIC_WORDPRESS_URL; lots by id, 100 per request),
   once per lot and only for auctioned cars since 2015 that classify.py assigns to a variant (cached in
   WORK/web/mecum/lots.json). This is the data the lot page shows ("Odometer reads 33,734 miles", "VIN / Serial"); one
   request replaces 100 lot pages. Of the description only the HIGHLIGHTS bullets are kept. --lot-pages N stops after
   N new lots (for a first test run).
Mileage from the odometer field (filled in since 2023), for older lots from a highlight that is the mileage or states
it as the odometer reading ("13,800 miles", "Believed to be 45,000 actual miles"); never mileage since a restoration
or rebuild. Every lot is dated by the day it crossed the block. Every Mecum sale is in the US and in US dollars. Lots
whose result or price Mecum hides are left out; "bid goes on" lots are unsold.
Writes WORK/web/mecum/mecum.json, which build.py reads. Mecum Auctions' permission for this access confirmed by the
project owner on 13 November 2026. One request every 1.5 seconds. Stops if Mecum answers with a bot challenge.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITE = "https://www.mecum.com"
ALGOLIA_APP, ALGOLIA_KEY, INDEX = "U6CFCQ7V52", "0291c46cde807bcb428a021a96138fcb", "wp_posts_lot"
SEARCH = "https://%s-dsn.algolia.net/1/indexes/*/queries?%s" % (ALGOLIA_APP.lower(), urllib.parse.urlencode(
    {"x-algolia-application-id": ALGOLIA_APP, "x-algolia-api-key": ALGOLIA_KEY}))
GRAPHQL = "https://ignition.mecumauctions.com/graphql"
MAKES = ["Porsche", "Porshe"]
DELAY = 1.5
PAGE = 1000
BATCH = 100        # WPGraphQL returns at most 100 nodes per request
SINCE = "2015-01-01"
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "mecum")
os.makedirs(DIR, exist_ok=True)
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|_Incapsula_|akamai-bm|px-captcha|captcha-delivery|Access Denied|Attention Required", re.I)
ATTRS = ["post_id", "post_title", "permalink", "web_id_meta", "lot_number_meta", "lot_year", "hammer_price_meta",
         "hide_hammer_price_meta", "hide_sale_result_meta", "sold", "bid_goes_on", "low_estimate_meta", "high_estimate_meta",
         "taxonomies.auction_tax", "taxonomies.run_date", "taxonomies.sale_result", "taxonomies.lot_type", "taxonomies.make"]
LOT_FIELDS = "databaseId webMetaId lotNumber vinSerial frameNumber odometer odometerUnits isActualMiles odometerMileageSince lowEstimate highEstimate content"


class Blocked(Exception): pass


def post(url, body, headers):
    """POSTs body (JSON), returns the decoded JSON response. None after three failed tries. Raises Blocked on a bot
    challenge."""
    time.sleep(DELAY)
    h = {"User-Agent": UA, "Accept-Encoding": "gzip", "Origin": SITE, "Referer": SITE + "/"}
    h.update(headers)
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=h)
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if not t.lstrip().startswith(("{", "[")):
                    if CHALLENGE.search(t[:5000]) or re.search(r"captcha", t[:5000], re.I): raise Blocked(url)
                    raise ValueError("not JSON: %r" % t[:200])
                return json.loads(t)
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.code in (403, 429, 503) and (CHALLENGE.search(t) or re.search(r"captcha", t, re.I)): raise Blocked("%s (HTTP %d)" % (url, e.code))
            # a refusal that is not an API error message (Algolia and WPGraphQL answer errors in JSON) is a block
            if e.code in (401, 403, 429) and not t.lstrip().startswith("{"): raise Blocked("%s (HTTP %d)" % (url, e.code))
            if e.code in (400, 401, 403, 404):
                print("failed", url, e.code, t[:300], flush=True)
                return None
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def search(params):
    return post(SEARCH, {"requests": [dict(indexName=INDEX, **params)]}, {"Content-Type": "text/plain", "Accept": "application/json"})


def graphql(query, variables):
    d = post(GRAPHQL, {"query": query, "variables": variables},
             {"Content-Type": "application/json", "Accept": "application/graphql-response+json,application/json;q=0.9"})
    if d is None: return None
    if d.get("errors") or not d.get("data"): sys.exit("Mecum GraphQL error: %s" % str(d.get("errors"))[:500])
    return d["data"]


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p):
    json.dump(obj, open(p + ".tmp", "w"), ensure_ascii=False)
    os.replace(p + ".tmp", p)


def day(ts):
    try: return dt.datetime.fromtimestamp(int(ts), dt.timezone.utc).date().isoformat() if ts else None
    except (TypeError, ValueError, OSError): return None


def num(s):
    s = re.sub(r"[^\d.]", "", str(s or "")).split(".")[0]
    return int(s) if s else None


def tax(h, k): return (h.get("taxonomies") or {}).get(k) or []


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


def highlights(content):
    """The bullet points under HIGHLIGHTS in a lot description ("13,800 miles", "Porsche Certificate of Authenticity")."""
    m = re.search(r">\s*HIGHLIGHTS\s*</h\d>(.*?)(?:<h\d|$)", content, re.S | re.I)
    return [t for t in (text(li) for li in re.findall(r"<li[^>]*>(.*?)</li>", m.group(1) if m else "", re.S)) if t]


try:
    # ------------------------------------------------------------------------------------------------ 1. lot list
    lots, page = {}, 0
    while True:
        d = search({"query": "", "hitsPerPage": PAGE, "page": page, "facetFilters": [["taxonomies.make.name:%s" % m for m in MAKES]],
                    "attributesToRetrieve": ATTRS, "attributesToHighlight": [], "attributesToSnippet": []})
        if not d or not d.get("results"): sys.exit("Mecum search failed on page %d" % page)
        r = d["results"][0]
        for h in r["hits"]: lots[h["post_id"]] = h
        print("list page", page + 1, "of", r["nbPages"], len(lots), "of", r["nbHits"], "lots", flush=True)
        if page + 1 >= r["nbPages"] or not r["hits"]: break
        page += 1
    if len(lots) < r["nbHits"]: print("note:", r["nbHits"] - len(lots), "of", r["nbHits"], "lots not returned this run", flush=True)

    # results only: cars that sold (with the price shown) or went unsold ("bid goes on"); upcoming and withdrawn lots
    # have no result, Road Art, tractors and engines are not cars
    cands, skipped, today = [], {}, dt.date.today().isoformat()
    for h in lots.values():
        a = (tax(h, "auction_tax") or [{}])[0]
        result = {x.get("slug") for x in tax(h, "sale_result")}
        types = {x.get("name") for x in tax(h, "lot_type")}
        if "Auto" not in types: status = "not a car"
        elif str(h.get("hide_sale_result_meta") or "") == "1": status = "result hidden"
        elif "sold" in result or h.get("sold") == 1:
            status = "price hidden" if str(h.get("hide_hammer_price_meta") or "") == "1" or not num(h.get("hammer_price_meta")) else "sold"
        elif "bid-goes-on" in result or h.get("bid_goes_on") == 1: status = "not sold"
        else: status = "no result"
        if status not in ("sold", "not sold"):
            skipped[status] = skipped.get(status, 0) + 1
            continue
        start, end = day(a.get("start_timestamp")), day(a.get("end_timestamp"))
        run = ((tax(h, "run_date") or [{}])[0].get("name") or "")[:10]
        # the day the lot crossed the block; the sale's first day if the run date is missing or outside the sale (a few
        # days of slack after the sale's last listed day: Kissimmee 2017 ran lots on the 16th, listed until the 15th)
        last = (dt.date.fromisoformat(end) + dt.timedelta(days=3)).isoformat() if end else start
        date = run if re.match(r"\d{4}-\d\d-\d\d$", run) and start and start <= run <= last else start or run or None
        if not date or date < SINCE or date > today: continue
        title = re.sub(r"\s+", " ", html.unescape(h.get("post_title") or "")).strip()
        if not re.match(r"\d{4} ", title) and h.get("lot_year"): title = "%s %s" % (h["lot_year"], title)
        if not classify(title): continue
        cands.append((h, a, title, date, status))
    print(len(cands), "auction results since 2015 assigned to a variant; left out:",
          ", ".join("%d %s" % (n, k) for k, n in sorted(skipped.items())), flush=True)

    # ------------------------------------------------------------------------------------------------ 2. lot details
    details, details_p = load("lots.json", {})
    # newest sales first, so that a limited run and the daily runs fetch the new lots
    cands.sort(key=lambda c: c[3], reverse=True)
    todo = [str(h["post_id"]) for h, *_ in cands if str(h["post_id"]) not in details]
    if LOT_PAGES is not None: todo = todo[:LOT_PAGES]
    new_lots = 0
    for i in range(0, len(todo), BATCH):
        part = todo[i:i + BATCH]
        d = graphql("query($ids: [ID]) { lots(first: 100, where: {in: $ids}) { nodes { %s } } }" % LOT_FIELDS, {"ids": part})
        if d is None: continue
        got = {str(n["databaseId"]): n for n in d["lots"]["nodes"]}
        for n in got.values():
            # of the description only the highlights are kept (older lots state the mileage only there)
            n["highlights"] = highlights(n.pop("content", None) or "")
        for pid in part:
            # a lot the API does not return (unpublished since) is remembered as empty and not asked for again
            details[pid] = got.get(pid) or {}
        new_lots += len(part)
        save(details, details_p)
        print("lot details", new_lots, "of", len(todo), flush=True)
except Blocked as e:
    sys.exit("Mecum answered with a bot challenge or blocked the request (%s); stopped, nothing written. "
             "Ask Mecum to allowlist this access or for an export." % e)


MILEAGE = r"\b(\d{1,3}(?:[,.]\d{3})+|\d+)\s*(?:actual\s+|original\s+|documented\s+|indicated\s+|believed\s+)*(kilometers|kilometres|kms?|miles)\b"
ODO = r"\b(odometer|show(?:s|n|ing)?|display(?:s|ed|ing)?|indicat\w*|reads|recorded|registered|since new|from new|actual|original|believed|documented|documentation|delivery|owners?)\b"
NOT_ODO = r"\bsince\b(?! new)|rebuil|restor|service|engine|overhaul|transmission|gearbox|race|rally|track|tires?\b|per hour|mph|\bon (?:the|a|its)\b(?! (?:odometer|clock|speedometer))|exempt|unknown|TMU|traded|purchased|bought"


def km_of(lot):
    """Odometer reading in km, rounded to 100. From Mecum's odometer field ("Odometer reads 33,734 miles"; unit "M" or
    "KM"), set on lots since 2023, not if Mecum gives it as mileage since a restoration/rebuild and not for 0 (not
    entered). Older lots: from a highlight that is the mileage ("13,800 miles") or states it as the odometer reading
    ("Odometer shows 13,800 miles", "309 miles since new", "Believed to be 13,092 actual miles"); not mileage since a
    rebuild, on an engine, or a TMU/exempt note."""
    n = num(lot.get("odometer"))
    unit = (lot.get("odometerUnits") or "").strip().upper()
    if (lot.get("odometerMileageSince") or "").strip(): return None
    if n and unit in ("M", "MI", "MILES", "K", "KM"): return round(n * (1 if unit.startswith("K") else 1.609344) / 100) * 100
    for t in lot.get("highlights") or []:
        m = re.search(MILEAGE, t, re.I)
        if not m or re.search(NOT_ODO, t, re.I): continue
        bare = re.fullmatch(r"(?:(?:only|just|approximately|approx\.?|about|under|less than|fewer than)\s+)?" + MILEAGE[2:-2] + r"\.?", t.strip(), re.I)
        if bare or re.search(ODO, t, re.I):
            n = int(re.sub(r"\D", "", m.group(1)))
            return round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100
    return None


def chassis_of(lot):
    c = re.sub(r"\s+", " ", html.unescape(lot.get("vinSerial") or "")).strip()
    # placeholders, and the odometer reading typed into the VIN field ("150523" twice)
    if re.fullmatch(r"(n/?a|none|unknown|tbd|-+|0+)", c, re.I) or c == (lot.get("odometer") or "").strip(): return ""
    return c


out = []
for h, a, title, date, status in cands:
    pid = str(h["post_id"])
    if pid not in details: continue
    lot = details[pid]
    sold = status == "sold"
    lo, hi = num(lot.get("lowEstimate") or h.get("low_estimate_meta")), num(lot.get("highEstimate") or h.get("high_estimate_meta"))
    sale = re.sub(r"\s+", " ", html.unescape(a.get("title") or (a.get("name") or "").split("|")[0])).strip()
    rec = dict(id=str(h.get("web_id_meta") or lot.get("webMetaId") or pid), code=a.get("slug") or "",
               lot=str(h.get("lot_number_meta") or lot.get("lotNumber") or ""), title=title, date=date,
               sold=sold, amt=num(h["hammer_price_meta"]) if sold else None, cur="USD", country="US",
               chassis=chassis_of(lot), km=km_of(lot), url=SITE + h["permalink"], sale=sale)
    if lo and hi and 0 < lo <= hi: rec["est"] = [lo, hi, "USD"]
    out.append(rec)
save(out, os.path.join(DIR, "mecum.json"))
print(len(out), "Mecum results since 2015 (%d sold, %d not sold);" % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out)),
      new_lots, "new lot details", flush=True)

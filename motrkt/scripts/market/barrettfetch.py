"""Barrett-Jackson results straight from Barrett-Jackson: every Porsche lot with price, sale day, VIN and mileage.

usage: python3 -I barrettfetch.py WORK [--lot-pages N]

1. Results: the search the results page of the website uses itself (https://www.barrett-jackson.com/results ->
   /api/previous-docket-results, the site's own JSON endpoint in front of its Algolia index), filtered on the make
   "PORSCHE" over all past auctions, 1000 lots per request, 2 requests. The whole list is fetched on every run and kept
   in WORK/web/barrett/results.json (it is small and is the only way to see new results; finished sales do not change).
   Each lot carries everything we need, so no lot page is fetched (--lot-pages is accepted for the same command line as
   the other fetchers and ignored):
   - code: the sale's slug ("scottsdale-2019", "2026-las-vegas"); sale: the sale name from the lot's store name
     ("Las Vegas 2026 - Vehicle" -> "Las Vegas 2026")
   - lot: Barrett-Jackson's lot number as shown ("1394", "357.1")
   - title: the lot title, which Barrett-Jackson writes in capitals ("1989 PORSCHE 911 CARRERA SPEEDSTER"), with words of
     four or more letters capitalised ("1989 Porsche 911 Carrera Speedster"; RS, GT, GTS, SC ... stay)
   - date: the day the lot crossed the block (run_datetime, local time of the sale)
   - sold / amt: Barrett-Jackson's "is_sold" flag and its published price, which is the hammer price plus the 10 % buyer's
     premium (the result pages show it as the sold price; it is always 1.10 x the hammer price in the data, and agrees
     with the Hammer Price app's sold prices). Withdrawn lots are not in the results. Lots offered WITH a reserve are a
     trap: the site marks a reserve lot that did not sell as "Sold" too, with the high bid plus 10 % as its price (13
     "high bid" results of the Hammer Price app, 2015-2020), and nothing in the data (reserve amount, status bits, the
     lot page) tells them from reserve lots that did sell. Reserve lots are therefore left out (about 40 Porsches,
     2015-2020; Barrett-Jackson has sold practically everything at no reserve since); hammerprice.csv has them with the
     right result. So every row is sold, and none carries an estimate (Barrett-Jackson gives none).
   - chassis: the VIN field; km: the mileage stated in the lot description ("92,013 actual miles", "64,176 miles (title
     reads exempt)", i.e. the odometer reading), converted to km and rounded to 100; never mileage since a restoration,
     on an engine, "not actual miles" / TMU / odometer-discrepancy notes
   - url: the lot page https://www.barrett-jackson.com/<sale slug>/docket/vehicle/<lot slug>
   Left out as well: lots of other makes the search returns (boats, NFTs naming a Porsche), canceled lots, charity lots (100 %
   of the hammer price goes to a charity, so the price is a donation, not a market price) and lots without a run date.
2. Coming sales: the sales not over yet (/api/non-past-events, 1 request) and their dockets filtered on "PORSCHE"
   (/api/docket, 1 request per sale), written to WORK/web/barrett/upcoming_lots.json for upcoming.py.
Every Barrett-Jackson sale is in the US and in US dollars. A first run and a daily run cost the same, about 5 requests:
2 for the results, 1 for the sale names (/api/facets/all-past-events), 1 for the coming sales and 1 per coming sale.
Writes WORK/web/barrett/barrett.json, which build.py reads. Barrett-Jackson's permission for this access confirmed by the
project owner on 18 November 2026. One request every 1.5 seconds. Stops if Barrett-Jackson answers with a bot challenge.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITE = "https://www.barrett-jackson.com"
DELAY = 1.5        # robots.txt sets no Crawl-delay
PAGE = 1000
SINCE = "2015-01-01"
W = sys.argv[1]
DIR = os.path.join(W, "web", "barrett")
os.makedirs(DIR, exist_ok=True)
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|_Incapsula_|akamai-bm|px-captcha|captcha-delivery|Access Denied|Attention Required", re.I)


class Blocked(Exception): pass


def get(path, params=None):
    """GETs SITE + path (JSON), returns the decoded response. None after three failed tries. Raises Blocked on a bot
    challenge."""
    url = SITE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip",
                                               "Referer": SITE + "/results?type=Vehicles"})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
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
            if e.code in (401, 403, 429) and not t.lstrip().startswith(("{", "[")): raise Blocked("%s (HTTP %d)" % (url, e.code))
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


def pages(path, params):
    """All lots of a paged list (1000 per request); None if a page failed."""
    lots, page = [], 1
    while True:
        d = get(path, dict(params, page=page, size=PAGE))
        if d is None or not isinstance(d.get("data"), list): return None
        lots += [x.get("attributes") or {} for x in d["data"]]
        p = (d.get("meta") or {}).get("pagination") or {}
        print(path, "page", page, "of", p.get("pageCount"), len(lots), "of", p.get("total"), "lots", flush=True)
        if page >= int(p.get("pageCount") or 0) or not d["data"]: return lots
        page += 1


def save(obj, p):
    json.dump(obj, open(p + ".tmp", "w"), ensure_ascii=False)
    os.replace(p + ".tmp", p)


def num(s):
    s = re.sub(r"[^\d.]", "", str(s or "")).split(".")[0]
    return int(s) if s else None


def clean(s): return re.sub(r"\s+", " ", html.unescape(s or "")).strip()


# short words that are ordinary words, not model codes (RS, GT, SC, 4S ... stay in capitals)
WORDS = {"CAR": "Car", "BY": "by", "AND": "and", "THE": "the", "OF": "of", "FOR": "for", "ONE": "One", "TOP": "Top", "NEW": "New", "RE": "Re"}


def title_of(t):
    t = clean(t)
    return re.sub(r"[A-Za-z][A-Za-z']*", lambda m: m.group(0).capitalize() if len(m.group(0)) >= 4 and m.group(0).isupper()
                  else WORDS.get(m.group(0), m.group(0)), t)


NAMES = {}      # sale slug -> name, from /api/facets/all-past-events


def sale_of(a):
    if NAMES.get(a.get("event_slug")): return NAMES[a["event_slug"]]
    s = re.sub(r"\s*-\s*(Vehicles?|Automobilia)\s*$", "", clean(a.get("store_name")), flags=re.I)
    return s or (a.get("event_slug") or "").replace("-", " ").title()


MILES = re.compile(r"\b(\d{1,3}(?:,\d{3})+|\d+)\s+((?:(?:actual|original|documented|delivery|indicated|test)\s+){0,2})(miles|kilometers|kilometres|kms?)\b", re.I)
# the lot's mileage is unreliable as a whole
BAD_ODO = re.compile(r"not actual|non-actual|discrepanc|rollback|roll-back|\bTMU\b|exceeds mechanical|odometer (?:has been |was )?(?:replaced|changed|broken|inoperable)", re.I)
# words right before the number that make it something else than the odometer ("service at 42,000 miles")
BEFORE_NOT = re.compile(r"(?:\bat|\bevery|\bafter|\bwithin|\blast|\bin|\bfor|\bof|\brange|\bfirst|\bdriven|\bput)\s+(?:only\s+|just\s+|about\s+|approximately\s+)?$", re.I)
BEFORE_ODO = re.compile(r"(?:odometer|shows|showing|displays|reads|indicates|has|have|with|just|only|over|under|than|approximately)\s+(?:only\s+|just\s+|over\s+|under\s+)?$", re.I)
# words right after it: mileage since a rebuild / on an engine, electric range
AFTER_NOT = re.compile(r"^\s*(?:since(?! new)|on (?:the|its|a|this) (?:engine|motor|transmission|gearbox|rebuil|restor|new|fresh|current|replacement)|of (?:all-)?electric|range|per|after|before|on a (?:fresh|new|rebuil)|ago)", re.I)
AFTER_OK = re.compile(r"^\s*[(,]\s*(?:the )?(?:title reads|mileage not indicated|not indicated)|^\s*(?:from new|since new)|^\s*(?:[.;]|$)", re.I)


def km_of(a):
    """Odometer reading in km, rounded to 100, from the description: "92,013 actual miles.", "64,176 miles (title reads
    exempt).", "The digital odometer shows 85,726 miles", "has 1,721 actual miles", "38,202 kilometers/23,737 actual
    miles". Not mileage since a rebuild or restoration, on an engine, a service interval or test miles, and nothing when
    the description reports a not-actual-miles title, a TMU title or an odometer discrepancy."""
    text = clean((a.get("full_description") or "") + " \n " + (a.get("short_description") or ""))
    if BAD_ODO.search(text): return None
    for m in MILES.finditer(text):
        before, after = text[max(0, m.start() - 40):m.start()], text[m.end():m.end() + 45]
        word = (m.group(2) or "").lower()
        if "test" in word or AFTER_NOT.search(after) or BEFORE_NOT.search(before): continue
        if word or AFTER_OK.search(after) or BEFORE_ODO.search(before):
            n = int(m.group(1).replace(",", ""))
            return round(n * (1.609344 if m.group(3).lower() == "miles" else 1) / 100) * 100
    return None


def day(a):
    d = (a.get("run_datetime") or "")[:10]
    return d if re.match(r"\d{4}-\d\d-\d\d$", d) else None


try:
    # ------------------------------------------------------------------------------------------------ 1. results
    lots = pages("/api/previous-docket-results", {"type": "Vehicles", "slug": "", "q": "", "make": "PORSCHE"})
    if lots is None: sys.exit("Barrett-Jackson results failed; nothing written")
    save(lots, os.path.join(DIR, "results.json"))
    for e in get("/api/facets/all-past-events") or []:
        ev = e.get("attributes") or {}
        if ev.get("slug") and clean(ev.get("name")): NAMES.setdefault(ev["slug"], clean(ev["name"]))

    # ------------------------------------------------------------------------------------------------ 2. coming sales
    soon, events = [], get("/api/non-past-events")
    for e in events if isinstance(events, list) else []:
        ev = e.get("attributes") or {}
        if not ev.get("slug") or (ev.get("end_date") or ev.get("start_date") or "") < dt.date.today().isoformat(): continue
        docket = pages("/api/docket", {"type": "Vehicles", "slug": ev["slug"], "q": "", "make": "PORSCHE", "validateLot": "1"})
        for a in docket or []:
            title = title_of(a.get("title"))
            if (a.get("make") or "").upper() != "PORSCHE" or a.get("is_canceled") or not classify(title): continue
            soon.append(dict(house="Barrett-Jackson", sale=clean(ev.get("name")) or sale_of(a), saleUrl="%s/events/%s" % (SITE, ev["slug"]),
                             date=day(a) or ev.get("start_date"), end=ev.get("end_date"), lot=str(a.get("lot_number") or ""),
                             title=title, url="%s/%s/docket/vehicle/%s" % (SITE, ev["slug"], a.get("slug")), country="US", est=None))
    if events is not None:
        save(soon, os.path.join(DIR, "upcoming_lots.json"))
        print(len(soon), "upcoming Porsche lots", flush=True)
except Blocked as e:
    sys.exit("Barrett-Jackson answered with a bot challenge or blocked the request (%s); stopped, nothing written. "
             "Ask Barrett-Jackson to allowlist this access or for an export." % e)

out, skipped, unassigned, today = [], {}, [], dt.date.today().isoformat()
for a in lots:
    date = day(a)
    if (a.get("make") or "").upper() != "PORSCHE": status = "other make"
    elif a.get("is_canceled"): status = "canceled"
    elif not date: status = "no run date"
    elif date < SINCE or date > today: continue
    elif a.get("is_charity"): status = "charity lot"
    elif a.get("is_reserve") or (a.get("reserve_type_name") or "").lower() == "reserve": status = "reserve lot (result unreliable)"
    elif a.get("is_sold") and not (num(a.get("price_decimal")) or num(a.get("price"))): status = "sold without price"
    else: status = "ok"
    if status != "ok":
        skipped[status] = skipped.get(status, 0) + 1
        continue
    title = title_of(a.get("title"))
    if not classify(title):
        unassigned.append(title)
        continue
    sold = bool(a.get("is_sold"))
    vin = clean(a.get("vin"))
    if re.fullmatch(r"(n/?a|none|unknown|tbd|-+|0+)", vin, re.I): vin = ""
    out.append(dict(code=a.get("event_slug") or "", lot=clean(str(a.get("lot_number") or "")), title=title, date=date, sold=sold,
                    amt=(num(a.get("price_decimal")) or num(a.get("price"))) if sold else None, cur="USD", country="US",
                    chassis=vin, km=km_of(a), url="%s/%s/docket/vehicle/%s" % (SITE, a.get("event_slug"), a.get("slug")), sale=sale_of(a)))
out.sort(key=lambda o: (o["date"], o["code"], o["lot"]))
save(out, os.path.join(DIR, "barrett.json"))
print(len(unassigned), "Porsche results since 2015 classify.py does not assign, e.g.:", "; ".join(unassigned[:12]), flush=True)
print(len(out), "Barrett-Jackson results since 2015 (%d sold, %d not sold); left out:" % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out)),
      ", ".join("%d %s" % (n, k) for k, n in sorted(skipped.items())) or "none", flush=True)

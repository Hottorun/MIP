"""GAA Classic Cars (Greensboro, North Carolina) results straight from GAA: every Porsche lot with hammer price or high
bid, run day, VIN and mileage.

usage: python3 -I gaafetch.py WORK [--lot-pages N]

1. Lot list: GAA's results pages filtered on the make "Porsche" (https://www.gaaclassiccars.com/vehicles/results
   ?q[make_eq]=Porsche, newest first, 48 lots per page, about 4 pages; GAA lists every Porsche under that one make).
   The whole list is fetched on every run. Each lot carries GAA's vehicle id and lot page (url), lot number ("FR0127":
   the run day TH/FR/ST and the number), year, make and model (title = "<year> Porsche <model>"; a bare "911" of
   1978-1988 or "924" of 1986-1988 is named by its build year as hammerprice.by_year does), the VIN (hidden
   field; the 2016 sales show only its first 6 characters, those are left out), the sale name ("2026 November") and
   the result: "Sale Price: $83,000" = sold, "Highest Bid: $29,000" = not sold; lots with neither (withdrawn, no
   result yet) are left out. code is the sale name as a slug ("2026-november"; GAA's sale ids are not on the
   Porsche-filtered pages); sale is "GAA Classic Cars <month> <year>".
   PRICES: GAA publishes the HAMMER price only, without its buyer's premium (7 % in 2017, 8 % from 2023 at least:
   Hammer Price's GAA rows are exactly 1.07 / 1.08 times GAA's figures). amt is that hammer price as GAA shows it; no
   premium is added here; build.py adds it (gaa_premium). For unsold lots GAA shows the high bid; it is written as `bid` (amt None), and there is no estimate.
2. Date: GAA gives only the sale ("2026 November") and the run day (lot prefix TH/FR/ST = Thursday/Friday/Saturday of
   a Thursday-Saturday sale). date = the sale's first day (SALE_DAYS below, from GAA's own sale names and event page,
   Hammer Price and the sale announcements; sales GAA announces later are taken from the "Upcoming Auctions" line every
   results page carries and kept in WORK/web/gaa/sale_days.json) plus 0/1/2 days for TH/FR/ST. A sale missing from
   both is dated by GAA's usual calendar (November: first Thursday, otherwise fourth Thursday of the month) and
   printed as estimated; those in ESTIMATED below are estimated the same way.
3. Mileage: from the lot page's "Mileage:" field (miles, the odometer reading as catalogued; filled since about
   2025), for older lots from a highlight that is the mileage ("37,766 Actual Miles", "59K Actual Miles": GAA's "K"
   figures are rounded to the thousand); converted to km, rounded to 100. Not when the lot says the mileage is exempt,
   TMU, not actual, inconsistent or unknown, nor owners' statements or mileage since a rebuild. Lot pages are fetched once per lot
   and only for results since 2015 that classify.py assigns to a variant (cached in WORK/web/gaa/lots.json).
   --lot-pages N stops after N new lot pages (for a first test run).
4. Coming sales: when the "Upcoming Auctions" line names a sale not over yet, the Porsche lots of the current
   inventory (/vehicles?q[make_eq]=Porsche) go to WORK/web/gaa/upcoming_lots.json for upcoming.py.
Every GAA sale is in Greensboro, NC, in US dollars. Lot numbers are written as GAA prints them ("ST0120.1");
Hammer Price writes the same lot as "120.1" (no day prefix, no leading zeros).
Writes WORK/web/gaa/gaa.json, which build.py reads. A first run takes about 4 list pages and ~140 lot pages (25 min);
a daily run with nothing new takes the 4 list pages (under a minute).
GAA Classic Cars' permission for this access confirmed by the project owner on 18 November 2026. One request every 10
seconds (the site's Crawl-delay). Stops if GAA answers with a bot challenge.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify
from hammerprice import by_year

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITE = "https://www.gaaclassiccars.com"
RESULTS = SITE + "/vehicles/results?" + urllib.parse.urlencode({"q[make_eq]": "Porsche", "q[s][0][name_dir]": "created_at.desc"})
INVENTORY = SITE + "/vehicles?" + urllib.parse.urlencode({"q[make_eq]": "Porsche"})
HOUSE = "GAA Classic Cars"
DELAY = 10          # robots.txt Crawl-delay
SINCE = "2015-01-01"
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "gaa")
os.makedirs(DIR, exist_ok=True)
TODAY = dt.date.today()
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|_Incapsula_|akamai-bm|px-captcha|captcha-delivery|altcha|"
                       r"Attention Required|verify you are (?:a )?human|are you a robot", re.I)
MONTHS = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                          "September", "October", "November", "December"])}
OFFSET = {"TH": 0, "FR": 1, "ST": 2, "SA": 2}

# First day (Thursday) of each sale, by GAA's sale name. Sources: GAA's own sale names ("March 1-3, 2018 ..."), its
# event page (2023 and 2024 dates), Hammer Price (2017-2019, 2023-2026), Sports Car Market's 2020 preview.
SALE_DAYS = {"2017 March": "2017-03-02", "2017 July": "2017-07-27", "2017 November": "2017-11-02",
             "March 1-3, 2018 Spring Sale": "2018-03-01", "March 22-24, 2018 Jerry & June Smith Collection": "2018-03-22",
             "2018 July": "2018-07-26", "2018 November": "2018-11-01", "2019 March": "2019-02-28",
             "2020 February": "2020-02-27", "2020 July": "2020-07-23", "2020 November": "2020-11-05",
             "2023 February": "2023-02-23", "2023 March": "2023-03-30", "2023 July": "2023-07-20", "2023 November": "2023-11-02",
             "2024 February": "2024-02-22", "2024 April": "2024-04-25", "2024 July": "2024-07-25", "2024 November": "2024-11-07",
             "2025 February": "2025-02-20", "2025 July": "2025-07-24", "2025 November": "2025-11-06",
             "2026 February": "2026-02-19", "2026 April": "2026-04-09", "2026 July": "2026-07-23", "2026 November": "2026-11-05"}
# no source found for these; dated by GAA's usual calendar (see estimate()), at most about a week off
ESTIMATED = ["2016 July", "2016 October", "2019 July", "2019 November", "2021 February", "2021 April", "2021 July",
             "2021 November", "2022 February", "2022 July", "2022 November"]


class Blocked(Exception): pass


def get(url):
    """Page as text, "" for a missing page, None after three failed tries. Raises Blocked on a bot challenge."""
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", "Accept": "text/html,*/*;q=0.8",
                                               "Accept-Language": "en-US,en;q=0.9"})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                # every GAA page loads Google's reCAPTCHA for its contact forms; a page without GAA's layout that asks
                # for a captcha or a JavaScript check is a gate
                if CHALLENGE.search(t[:20000]) or ("gaa-" not in t and re.search(r"captcha", t, re.I)): raise Blocked(url)
                return t
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.code in (403, 429, 503) and (CHALLENGE.search(t) or re.search(r"captcha", t, re.I)): raise Blocked("%s (HTTP %d)" % (url, e.code))
            if e.code in (403, 429): raise Blocked("%s (HTTP %d)" % (url, e.code))
            if e.code in (404, 410): return ""
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(30 * (k + 1))
    return None


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p):
    json.dump(obj, open(p + ".tmp", "w"), ensure_ascii=False)
    os.replace(p + ".tmp", p)


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


def cls(item, name):
    """Text up to the first closing tag after the element with class `name`."""
    m = re.search(r"class='%s'[^>]*>(.*?)</(?:div|h\d|span)>" % name, item, re.S)
    return text(m.group(1)) if m else ""


def num(s):
    s = re.sub(r"[^\d]", "", str(s or ""))
    return int(s) if s else None


def items(page):
    """The lots of the paginated grid of a results or inventory page (the page also carries a print copy of the first
    90 lots, which is skipped)."""
    i = page.find("<div class='gaa-inventory-container'>")
    if i < 0: return None
    j = page.find("gaa-paginate", i)
    out = []
    for it in re.split(r'<a class="gaa-vehicle-item"', page[i:j if j > 0 else None])[1:]:
        m = re.match(r'\s*href="(/vehicles/(\d+)/[^"]*)"', it)
        if not m: continue
        it = re.sub(r"<!--.*?-->", "", it, flags=re.S)
        ym = re.search(r"class='year-make'>\s*<h3>(.*?)</h3>\s*<h3>(.*?)</h3>", it, re.S)
        price = re.search(r"class='(sale-price-label|high-bid-label)'>.*?<strong>(.*?)</strong>", it, re.S)
        out.append(dict(id=m.group(2), url=SITE + m.group(1), vin=cls(it, "vehicle-vin"), lot=re.sub(r"^Lot #\s*", "", cls(it, "label-lot")),
                        year=text(ym.group(1)) if ym else "", make=text(ym.group(2)) if ym else "", model=cls(it, "model"),
                        result={"sale-price-label": "sold", "high-bid-label": "bid"}.get(price.group(1)) if price else None,
                        price=num(price.group(2)) if price else None, sale=cls(it, "gaa-run-date-container"),
                        note=cls(it, "gaa-thumb-header"), notsold="gaa-not-sold" in it))
    return out


def titled(year, model):
    """"<year> Porsche <model>"; GAA names many cars only "911" or "911 Targa": where the build year leaves one series
    model, it is named as hammerprice.by_year does for Hammer Price's GAA rows (1978-1983 911 -> 911 SC, 1984-1988 ->
    911 Carrera 3.2, 1986-1988 924 -> 924 S)."""
    if not re.match(r"\d{4}$", year): return "Porsche " + model
    t = "%s Porsche %s" % (year, model)
    if not classify(t):
        b = "%s Porsche %s" % (year, by_year(model, int(year)))
        if classify(b): return b
    return t


def pages_of(page):
    return max([int(p) for p in re.findall(r"[?&]page=(\d+)", page)] or [1])


def nth_thursday(y, m, n):
    d = dt.date(y, m, 1)
    d += dt.timedelta(days=(3 - d.weekday()) % 7)
    return d + dt.timedelta(weeks=n - 1)


def estimate(sale):
    m = re.match(r"((?:19|20)\d\d) ([A-Z][a-z]+)$", sale.strip())
    if not m or m.group(2) not in MONTHS: return None
    y, mo = int(m.group(1)), MONTHS[m.group(2)]
    return nth_thursday(y, mo, 1 if mo == 11 else 4).isoformat()


def upcoming_dates(page):
    """The sales of the "Upcoming Auctions" line ("NOV. 5-7 | FEB. 18-20 | ..."), in order: (name, first, last day).
    The first one's year is the one closest to today, every later one follows it."""
    m = re.search(r"<span class='month'>([^<]*\d[^<]*)</span>", page)
    out, prev = [], None
    for part in (m.group(1).split("|") if m else []):
        g = re.match(r"\s*([A-Z]{3})[A-Z]*\.?\s*(\d+)\s*-\s*(?:([A-Z]{3})[A-Z]*\.?\s*)?(\d+)", part.strip().upper())
        if not g: continue
        mo = [k for k, v in MONTHS.items() if k[:3].upper() == g.group(1)]
        mo2 = [k for k, v in MONTHS.items() if k[:3].upper() == (g.group(3) or g.group(1))]
        if not mo or not mo2: continue
        if prev is None:
            y = min((TODAY.year - 1, TODAY.year, TODAY.year + 1),
                    key=lambda y: abs((dt.date(y, MONTHS[mo[0]], int(g.group(2))) - TODAY).days))
        else:
            y = prev.year + (1 if MONTHS[mo[0]] < prev.month else 0)
        try:
            first = dt.date(y, MONTHS[mo[0]], int(g.group(2)))
            last = dt.date(y + (1 if MONTHS[mo2[0]] < first.month else 0), MONTHS[mo2[0]], int(g.group(4)))
        except ValueError:
            continue
        out.append(("%d %s" % (y, mo[0]), first, last))
        prev = first
    return out


NOT_ODO = re.compile(r"exempt|\bTMU\b|not actual|inconsisten|unknown|odometer (?:replaced|rolled|broken|inop)", re.I)
MILES = re.compile(r"(?:only\s+)?(\d{1,3}(?:,\d{3})+|\d+)\s*(k)?\s+(?:actual\s+|original\s+)?miles\b(?!\s+(?:since|ago|on))", re.I)


def lot_page(page):
    """Mileage field, run day and highlights of a lot page."""
    mi = re.search(r"Mileage:\s*</[^>]+>\s*(?:<[^>]+>\s*)*([^<]+)", page)
    hl = [text(x) for x in re.findall(r"<li[^>]*>(.*?)</li>", page.split("Vehicle Highlights", 1)[1].split("</ul>", 1)[0], re.S)] if "Vehicle Highlights" in page else []
    rd = re.search(r"Run Day:\s*</[^>]+>\s*(?:<[^>]+>\s*)*([A-Za-z]+)", page)
    return dict(mileage=text(mi.group(1)) if mi else "", run=rd.group(1) if rd else "", highlights=[h for h in hl if h][:30])


def km_of(lot, note):
    n = num(lot.get("mileage"))
    if not n:
        for h in [note] + (lot.get("highlights") or []):
            m = MILES.match((h or "").strip())
            if m and not re.search(r"since|owner|driven", h, re.I):
                n = int(m.group(1).replace(",", "")) * (1000 if m.group(2) else 1)
                break
    if not n or NOT_ODO.search(lot.get("mileage") or "") or NOT_ODO.search(note or "") or any(NOT_ODO.search(h) for h in lot.get("highlights") or []):
        return None
    return round(n * 1.609344 / 100) * 100


def chassis_of(x, sale_day):
    c = re.sub(r"\s+", "", x["vin"] or "")
    if re.fullmatch(r"(n/?a|none|unknown|tbd|-+|0+)?", c, re.I): return ""
    # the 2016 sales list only the VIN's first 6 characters
    if sale_day < "2017-01-01" and len(c) <= 6: return ""
    return c


try:
    # ------------------------------------------------------------------------------------------------ 1. lot list
    first = get(RESULTS)
    if not first: sys.exit("GAA results page failed")
    lots, branches = {}, {}
    for bid, name in re.findall(r'href="/vehicles/results\?q%5Bbranch_id_eq%5D=(\d+)">([^<]+)</a>', first):
        branches[re.sub(r"\s+", " ", html.unescape(name)).strip()] = bid
    n = pages_of(first)
    for p in range(1, n + 1):
        page = first if p == 1 else get(RESULTS + "&page=%d" % p)
        got = items(page or "")
        if got is None: sys.exit("GAA results page %d has no lot list" % p)
        for x in got: lots[x["id"]] = x
        print("list page", p, "of", n, len(lots), "lots", flush=True)

    days, days_p = load("sale_days.json", {})
    ups = upcoming_dates(first)
    for name, a, b in ups:
        if name not in SALE_DAYS: days[name] = a.isoformat()
    save(days, days_p)

    def sale_day(sale):
        d = SALE_DAYS.get(sale) or days.get(sale)
        return (d, False) if d else (estimate(sale), True)

    cands, skipped, unassigned, estimated = [], {}, [], set()
    for x in lots.values():
        if x["result"] is None or not x["price"]:
            skipped["no result"] = skipped.get("no result", 0) + 1; continue
        if x["make"].lower() != "porsche":
            skipped["other make"] = skipped.get("other make", 0) + 1; continue
        first_day, est = sale_day(x["sale"])
        if not first_day:
            print("note: no date for sale %r (lot %s); left out" % (x["sale"], x["url"]), flush=True); continue
        if est: estimated.add(x["sale"])
        pre = re.match(r"([A-Z]+)", x["lot"])
        date = (dt.date.fromisoformat(first_day) + dt.timedelta(days=OFFSET.get(pre.group(1) if pre else "", 0))).isoformat()
        if date < SINCE or date > TODAY.isoformat(): continue
        model = re.sub(r"\s+", " ", x["model"]).strip()
        title = titled(x["year"], model)
        if not classify(title):
            unassigned.append(title); continue
        cands.append((x, title, date, first_day))
    print(len(cands), "Porsche results assigned to a variant; left out:",
          ", ".join(["%d %s" % (v, k) for k, v in sorted(skipped.items())] + ["%d not assigned to a variant" % len(unassigned)]), flush=True)
    if unassigned: print("  not assigned, e.g.:", "; ".join(sorted(set(unassigned))[:25]), flush=True)
    if estimated: print("note: sale day estimated from GAA's usual calendar for:", ", ".join(sorted(estimated)), flush=True)

    # ------------------------------------------------------------------------------------------------ 2. lot pages
    details, details_p = load("lots.json", {})
    cands.sort(key=lambda c: c[2], reverse=True)   # newest first: a limited run and the daily runs fetch the new lots
    new_pages = 0
    for x, *_ in cands:
        if x["id"] in details: continue
        if LOT_PAGES is not None and new_pages >= LOT_PAGES: break
        page = get(x["url"])
        if page is None: continue
        new_pages += 1
        details[x["id"]] = lot_page(page) if page else {}
        save(details, details_p)
        if new_pages % 20 == 0: print("lot pages", new_pages, flush=True)

    # ------------------------------------------------------------------------------------------------ 3. coming sale
    soon = []
    coming = [(name, a, b) for name, a, b in ups if b >= TODAY]
    if coming:
        name, a, b = coming[0]
        inv = get(INVENTORY)
        got = items(inv or "") or []
        for p in range(2, pages_of(inv or "") + 1):
            got += items(get(INVENTORY + "&page=%d" % p) or "") or []
        for x in got:
            if x["make"].lower() != "porsche" or x["result"]: continue
            title = titled(x["year"], re.sub(r"\s+", " ", x["model"]).strip())
            if not classify(title): continue
            pre = re.match(r"([A-Z]+)", x["lot"])
            soon.append(dict(house=HOUSE, sale="%s %s" % (HOUSE, " ".join(reversed(name.split()))),
                             saleUrl=SITE + "/vehicles?" + urllib.parse.urlencode({"q[branch_id_eq]": branches[name]}) if name in branches else SITE + "/vehicles",
                             date=(a + dt.timedelta(days=OFFSET.get(pre.group(1) if pre else "", 0))).isoformat(), end=b.isoformat(),
                             lot=x["lot"], title=title, url=x["url"], country="US", est=None))
    save(soon, os.path.join(DIR, "upcoming_lots.json"))
    print(len(soon), "upcoming Porsche lots", flush=True)
except Blocked as e:
    sys.exit("GAA answered with a bot challenge or blocked the request (%s); stopped, nothing written. "
             "Ask GAA to allowlist this access or for an export." % e)


out = []
for x, title, date, first_day in cands:
    if x["id"] not in details: continue
    lot = details[x["id"]]
    sold = x["result"] == "sold" and not x["notsold"]
    out.append(dict(code=re.sub(r"[^a-z0-9]+", "-", x["sale"].lower()).strip("-"), lot=x["lot"],
                    title=title, date=date, sold=sold, amt=x["price"] if sold else None, cur="USD", country="US",
                    chassis=chassis_of(x, first_day), km=km_of(lot, x["note"]), url=x["url"],
                    sale="%s %s" % (HOUSE, " ".join(reversed(x["sale"].split()))) if re.match(r"\d{4} [A-Z][a-z]+$", x["sale"]) else "%s %s" % (HOUSE, x["sale"])))
    if not sold and x["result"] == "bid" and x["price"]: out[-1]["bid"] = x["price"]   # "Highest Bid", for the model's bid channel
save(out, os.path.join(DIR, "gaa.json"))
print(len(out), "GAA Classic Cars results since 2015 (%d sold, %d not sold);" % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out)),
      new_pages, "new lot pages", flush=True)

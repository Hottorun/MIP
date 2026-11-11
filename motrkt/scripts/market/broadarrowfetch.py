"""Broad Arrow Auctions results straight from Broad Arrow: every Porsche lot with price, sale date, chassis number and
mileage.

usage: python3 -I broadarrowfetch.py WORK [--lot-pages N]

1. Lot list: Broad Arrow's results search with its make filter (/vehicles/results?q[make_eq]=Porsche, sorted by stock
   number), 99 lots per page, about 6 pages. Each lot card carries title, lot number, sale name, the country flag of
   the sale, the result ("Sold Price: $500,000" including buyer's premium, "Sold After Auction [for $…]", "Not Sold",
   "Withdrawn", or "Now Asking"/"Estimate …" when Broad Arrow shows no result) and a schema.org Car record with the
   chassis number (VIN) and the odometer reading in miles or km. The whole list is fetched on every run (results
   change after the sale, e.g. "Sold After Auction"); the pages are kept in WORK/web/broadarrow/list/.
2. Sale dates: from the list of past auctions (/past-auctions), matched by sale name and the year in the sale code;
   the first day of a live sale, the last day of a timed online sale (Global Icons), when all its lots close. Cached in
   WORK/web/broadarrow/sales.json, fetched again only when a sale is not in it. The lot's own day of a two-day live
   sale is not published.
3. Lot pages are not needed: since the sale they show only what the list shows (title, lot, result and the same
   schema.org record; the description is removed). --lot-pages N is accepted like in rmfetch.py and has no effect.
A lot without a result (Now Asking/Estimate), withdrawn, or sold after the auction without a price is left out.
Writes WORK/web/broadarrow/broadarrow.json, which build.py reads. Broad Arrow's permission for this access confirmed
by the project owner on 11 November 2026. One request every 1.5 seconds. Stops if Broad Arrow answers with a bot
challenge.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, unicodedata, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.broadarrowauctions.com"
DELAY = 1.5
W = sys.argv[1]
DIR = os.path.join(W, "web", "broadarrow")
os.makedirs(os.path.join(DIR, "list"), exist_ok=True)
MONTHS = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                          "September", "October", "November", "December"])}
CURRENCY = {"$": "USD", "US$": "USD", "USD": "USD", "€": "EUR", "EUR": "EUR", "£": "GBP", "GBP": "GBP", "CHF": "CHF"}
# the normal pages load Google reCAPTCHA for their forms, so "captcha" alone is not a sign of a challenge
TOP = r"<div class='price'>\s*<div class='top'>(.*?)</div>"  # "Lot 184 | The Amelia Auction 2026"
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|_Incapsula_|akamai-bm|px-captcha|captcha-delivery|Access Denied", re.I)


class Blocked(Exception): pass


def get(url):
    """Response body as text. None after three failed tries, "" for a missing page. Raises Blocked on a bot challenge."""
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if CHALLENGE.search(t[:5000]): raise Blocked(url)
                return t
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.code in (403, 429, 503) and (CHALLENGE.search(t) or re.search(r"captcha", t, re.I)): raise Blocked(url)
            if e.code in (404, 410): return ""
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


try:
    # ------------------------------------------------------------------------------------------------ 1. lot list
    cards, page = {}, 1
    while True:
        h = get("%s/vehicles/results?page=%d&q%%5Bmake_eq%%5D=Porsche&q%%5Bs%%5D%%5B0%%5D%%5Bname_dir%%5D=stock.asc" % (BASE, page))
        if h is None: sys.exit("Broad Arrow results failed on page %d" % page)
        open(os.path.join(DIR, "list", "page-%d.html" % page), "w").write(h)
        new = re.split(r"<div class='ft-vehicle-item", h)[1:]
        for c in new:
            m = re.search(r'href="/vehicles/(([a-z0-9]+)_([a-z0-9]+))/([^"]*)"', c)
            if m: cards[m.group(1)] = (m, c)
        print("list page", page, len(cards), "lots", flush=True)
        if not new or not re.search(r'rel="next"', h): break
        page += 1
        if page > 100: break

    # ------------------------------------------------------------------------------------------------ 2. sale dates
    def sale_date(s):
        """First day of the sale: "7 November 2026", "13 - 14 August 2026", "23 January - 1 February 2026"."""
        m = re.match(r"(\d{1,2})\s*([A-Z][a-z]+)?.*?(\d{4})\s*$", s.strip())
        if not m: return None
        month = m.group(2) or re.search(r"([A-Z][a-z]+)\s+\d{4}", s).group(1)
        return "%s-%02d-%02d" % (m.group(3), MONTHS[month], int(m.group(1))) if month in MONTHS else None

    def sale_end(s):
        """Last day of the sale: "5 - 14 October 2026" -> 2026-10-14."""
        m = re.search(r"(\d{1,2})\s*([A-Z][a-z]+)\s+(\d{4})\s*$", s.strip())
        return "%s-%02d-%02d" % (m.group(3), MONTHS[m.group(2)], int(m.group(1))) if m and m.group(2) in MONTHS else None

    STOP = {"the", "auction", "auctions", "in", "partnership", "with", "a", "of", "and"}

    def words(name):
        s = unicodedata.normalize("NFKD", html.unescape(name).replace("’", "'")).encode("ascii", "ignore").decode().lower()
        return set(re.findall(r"[a-z0-9]+", s)) - STOP

    def event_of(name, code, sales):
        """The past auction with this name: same year as the sale code ("am26" -> 2026), most words in common."""
        y = re.search(r"\d\d", code)
        best = (0, None)
        for ev, d in sales.items():
            if not d.get("date") or (y and d["date"][2:4] != y.group(0)): continue
            a, b = words(name), words(ev)
            score = len(a & b) / max(1, len(a | b))
            if score > best[0]: best = (score, ev)
        return best[1] if best[0] >= 0.5 else None

    sales, sales_p = load("sales.json", {})
    names = {(text(re.sub(r"Lot\s+\S+\s*\|", "", re.search(TOP, c, re.S).group(1))), m.group(2))
             for m, c in cards.values() if re.search(TOP, c, re.S)}
    if any(not event_of(n, code, sales) for n, code in names):
        h = get(BASE + "/past-auctions")
        for m in re.finditer(r'<a class="content-col show-past"[^>]*>(.*?)</a>', h or "", re.S):
            part = lambda k: text((re.search(r"<h2 class='%s'>(.*?)</h2>" % k, m.group(1), re.S) or [None, ""])[1])
            if part("mid"): sales[part("mid")] = {"date": sale_date(part("top")), "last": sale_end(part("top")), "place": part("bot")}
        save(sales, sales_p)
        print(len(sales), "past auctions", flush=True)

    # ------------------------------------------------------------------------------------------------ 3. results
    def price_of(s):
        """"$1,132,500" / "€456.250" / "CHF 1'418'125" / "$1,930.000" -> (1132500, "USD") ..."""
        m = re.search(r"(US\$|\$|€|£|USD|EUR|GBP|CHF)\s*(\d[\d,.'’ ]*)", s)
        if not m: return None, None
        n = re.sub(r"[.,]\d\d$", "", m.group(2).strip())  # cents, if any
        return int(re.sub(r"\D", "", n)), CURRENCY[m.group(1)]

    out, skipped, today = [], {}, dt.date.today().isoformat()
    for stock, (m, c) in sorted(cards.items()):
        code = m.group(2)
        title = html.unescape((re.search(r'<a title="([^"]*)"', c) or [None, ""])[1]).strip()
        top = re.search(TOP, c, re.S)
        top = text(top.group(1)) if top else ""
        lm = re.match(r"Lot\s+(\S+?)\s*\|\s*(.*)$", top)
        lot, sale = (lm.group(1), lm.group(2)) if lm else ("", top)
        res = text((re.search(r"<div class='bot'>(.*?)</div>", c, re.S) or [None, ""])[1])
        amt, cur = price_of(res)
        if re.search(r"withdrawn", res, re.I): status = "withdrawn"
        elif re.search(r"not sold", res, re.I): status, amt, cur = "not sold", None, None
        elif re.search(r"sold", res, re.I) or re.fullmatch(r"(US\$|\$|€|£|USD|EUR|GBP|CHF)\s*[\d,.'’ ]+", res):
            status = "sold" if amt else "sold, no price"
        else: status = "no result"
        if status not in ("sold", "not sold"):
            skipped[status] = skipped.get(status, 0) + 1
            continue
        if not classify(title): continue
        ev = event_of(sale, code, sales)
        # online sales (Global Icons) are timed: every lot closes on the last day; live sales: first day
        date = ((sales[ev].get("last") if re.search(r"online|global icons", sale + " " + ev, re.I) else None) or sales[ev]["date"]) if ev else None
        if not date:
            print("no date for sale", repr(sale), stock, flush=True)
            continue
        if date < "2015-01-01" or date > today: continue
        ld = (re.search(r"application/ld\+json'?>(.*?)</script>", c, re.S) or [None, ""])[1]
        vin = re.search(r'"vehicleIdentificationNumber"\s*:\s*"([^"]*)"', ld)
        chassis = re.sub(r"[​‌‍﻿]", "", html.unescape(vin.group(1))).strip() if vin else ""
        km = None
        # odometer only from the record's explicit reading, unit SMI (miles) or KMT (km); 0 means not entered
        mi = re.search(r'"mileageFromOdometer".*?"value"\s*:\s*"(\d+)"\s*,\s*"unitCode"\s*:\s*"(SMI|KMT)"', ld, re.S)
        if mi and int(mi.group(1)) > 0:
            km = round(int(mi.group(1)) * (1.609344 if mi.group(2) == "SMI" else 1) / 100) * 100
        flag = re.search(r"flag-icon-([a-z]{2})\b[^\"]*vehicle-country-flag", c)
        out.append(dict(id=stock, code=code, lot=lot, title=title, date=date, sold=status == "sold",
                        amt=amt if status == "sold" else None, cur=cur if status == "sold" else None,
                        country=flag.group(1).upper() if flag else "", chassis=chassis, km=km,
                        url="%s/vehicles/%s/%s" % (BASE, stock, m.group(4)), sale=sale))
    json.dump(out, open(os.path.join(DIR, "broadarrow.json"), "w"), ensure_ascii=False)
    print(len(cards), "Porsche lots listed; left out:", ", ".join("%d %s" % (n, k) for k, n in sorted(skipped.items())), flush=True)
    print(len(out), "Broad Arrow results assigned to a variant (%d sold, %d not sold)" % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out)), flush=True)
except Blocked as e:
    sys.exit("Broad Arrow answered with a bot challenge (%s); not continuing" % e)

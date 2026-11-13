"""Iconic Auctioneers results straight from Iconic: every Porsche lot with price, sale date, chassis number and mileage.

usage: python3 -I iconicfetch.py WORK [--lot-pages N]

Iconic Auctioneers is the former Silverstone Auctions (sale codes SA…, online sales IAO…); its archive also holds the
sales of Classic Car Auctions (codes CCA…), which belongs to the same group. The website loads its catalogues from
JSON endpoints of its own (Joomla, index.php?option=…&format=json); this script reads the same endpoints.
1. Sale list: the archive the site's "Past auctions" page loads (POST ?option=com_calendar&task=archive.filterAuctions,
   all sale types, one request on every run): sale id, code, name, first and last day, category (CAR, ONLINE, BIKE,
   AUTO), live or timed, venue code. Car and online sales since 2015 are kept (about 180).
2. Lot lists: for each of these sales the catalogue the sale page loads (POST ?option=com_bidding&task=commission.getLots,
   all sessions, with the catalogue's own search for "Porsche" in the title, 500 lots per request): lot id, lot number,
   title, category (CAR, RACE, MEM, …), withdrawn, and the result as the site shows it. "sold_price" is the price
   including buyer's premium (the site: "Sold for: £… incl. premium"; in the lot record it is hammer price plus
   premium, for timed online sales hammer price plus the buyer's fee); 0 or empty means not sold; "not_show_sold_price"
   means sold for an undisclosed sum (left out, like withdrawn lots, also those marked "Regretfully Withdrawn" only in
   the title). Cached in WORK/web/iconic/lists/<sale id>.json; sales of the last 90 days are fetched again (post-sale
   deals, late results). Titles without "Porsche" (a handful of typos like "Posche") are not found.
3. Lot records: for every listed lot that classify.py assigns to a variant, the record the site's archived lot page
   loads (POST ?option=com_bidding&task=archive.processLot): chassis number, the odometer field (Odometer_Reading with
   its unit, miles or km; used as the stated odometer reading, in km rounded to 100; empty or 0 in most records before
   2017, and without a unit it is not used), the estimate, the session and, for timed online sales, the lot's closing
   time. Fetched once per lot (cached in WORK/web/iconic/lots/<lot id>.json); --lot-pages N stops after N new lot
   records (for a first test run). Prices and sold/unsold always come from the lot list, never from the record.
4. Sale day: a timed online lot is dated by its own closing time, a live lot by the sale's first day. Live sales whose
   record has a later last day (most two-day events are listed as two sales) take the day of the lot's session from
   one lot page per session ("This lot was auctioned on Saturday 21st October, 2017 at 2.00pm …"), cached in
   WORK/web/iconic/sessions.json; a session that spans two days ("Saturday 21st – Sunday 22nd", CCA sales) keeps the
   sale's first day. All sales are in the UK (GB) except the Classic Race Aarhus sale 2016 (DK, prices still in GBP).
Lot number: as printed; some online sales of 2025 print none (0), those lots take their catalogue reference
("REC17033-2"). Titles are the catalogue titles without mileage and sale notes, with a few typos fixed for classify.py.
Writes WORK/web/iconic/iconic.json, which build.py reads. Unsold lots carry Iconic's estimate (est). Iconic
Auctioneers' permission for this access confirmed by the project owner on 13 November 2026. One request every 1.5
seconds. Stops if Iconic answers with a bot challenge.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.iconicauctioneers.com/"
API = BASE + "index.php?option=%s&format=json&task=%s"
DELAY = 1.5
SINCE = "2015-01-01"
FRESH_DAYS = 90    # lot lists of sales more recent than this are fetched again
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "iconic")
for d in ("lists", "lots"): os.makedirs(os.path.join(DIR, d), exist_ok=True)
MONTHS = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                          "September", "October", "November", "December"])}
CURRENCY = {"&pound;": "GBP", "£": "GBP", "&euro;": "EUR", "€": "EUR", "&dollar;": "USD", "$": "USD"}
# the normal pages load scripts from cdnjs.cloudflare.com, so "cloudflare" alone is not a sign of a challenge
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|_Incapsula_|akamai-bm|px-captcha|captcha-delivery|"
                       r"Attention Required|Access Denied", re.I)


class Blocked(Exception): pass


def get(url, data=None, want_json=False):
    """Response body (parsed JSON if want_json); POSTs data form-encoded. None after three failed tries, "" for a
    missing page. Raises Blocked on a bot challenge or, for the JSON endpoints, on anything that is not JSON."""
    time.sleep(DELAY)
    headers = {"User-Agent": UA, "Accept-Encoding": "gzip"}
    if want_json: headers.update({"Accept": "application/json, text/javascript, */*; q=0.01", "X-Requested-With": "XMLHttpRequest",
                                  "Origin": BASE.rstrip("/"), "Referer": BASE})
    body = urllib.parse.urlencode(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, headers=headers)
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if want_json:
                    if not t.lstrip().startswith(("{", "[")):
                        if CHALLENGE.search(t[:5000]) or re.search(r"captcha", t[:5000], re.I): raise Blocked(url)
                        raise Blocked("%s answered %s instead of JSON" % (url, r.headers.get("Content-Type")))
                    return json.loads(t)
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


def num(s):
    try: return float(s or 0)
    except (TypeError, ValueError): return 0.0


def title_of(name, year):
    """"2016 Porsche 911 (991.2) Targa 4S - Manual " -> "2016 Porsche 911 (991.2) Targa 4S - Manual"; drops sale notes
    ("- Available Buy It Now Price", "No Reserve", "**Regretfully Withdrawn**", a trailing "*") and mileage notes
    ("- 9,201 Miles", "(Just 6,600 miles from new)"), fixes typos classify() would miss ("Carerra", "911(930)",
    "911 2.4S" -> "911 S 2.4") and adds the year if missing."""
    t = text(name)
    t = re.sub(r"\*\*[^*]*\*\*", " ", t)
    t = re.sub(r"\s*[-–,]?\s*\(?(just |only |under |less than |c\.? ?)?\d{1,3}(,\d{3})*\s*(genuine |recorded )?(miles|kms?|kilometres)"
               r"( from new)?\)?", " ", t, flags=re.I)
    t = re.sub(r"\s*[-–]\s*(available\s+)?buy\s*it\s*now(\s+price)?\b.*$", "", t, flags=re.I)
    t = re.sub(r"\s*[-–(]*\s*\bno reserve\b\s*\)?", " ", t, flags=re.I)
    if "Ã" in t:   # UTF-8 read as Latin-1 in some older records ("CoupÃ©")
        try: t = t.encode("latin-1").decode("utf-8")
        except UnicodeError: pass
    t = re.sub(r"^((?:19|20)\d\d)(?=[A-Za-z])", r"\1 ", t)        # "1988Porsche"
    t = re.sub(r"\bCar+e+r+a\b", "Carrera", t, flags=re.I)        # "Carerra", "Carrrera"
    t = re.sub(r"\b(911|912|356)\(", r"\1 (", t)
    t = re.sub(r"\b911 (\d\.\d) ?([TESL])\b", r"911 \2 \1", t)    # "911 2.4S" -> "911 S 2.4", as classify() reads it
    t = re.sub(r"\bPORSCHE\b", "Porsche", t)
    t = re.sub(r"\s+", " ", t).strip(" -–*")
    if not re.match(r"(19|20)\d\d\b", t) and re.fullmatch(r"(19|20)\d\d", str(year or "")): t = "%s %s" % (year, t)
    return t


def km_of(lot):
    """Odometer field of the lot record in km, rounded to 100: Odometer_Reading with Odomoter_Reading_Type (sic) "Miles"
    or "Kilometres"/"KM". None if empty, zero or of an unknown unit."""
    n = re.sub(r"[^\d]", "", str(lot.get("Odometer_Reading") or ""))
    if not n or int(n) <= 0 or int(n) > 1500000: return None
    unit = (lot.get("Odomoter_Reading_Type") or lot.get("Odometer_Reading_Type") or "").strip().lower()
    if unit.startswith("mile"): f = 1.609344
    elif unit.startswith(("km", "kilo")): f = 1
    else: return None
    return round(int(n) * f / 100) * 100


def chassis_of(lot):
    c = re.sub(r"\s+", " ", text(lot.get("chassis_number") or lot.get("Frame_Number") or lot.get("frame_no") or "")).strip(" .;,")
    return "" if re.fullmatch(r"(?i)(tbc|tba|n/?a|none|unknown|see (text|description)|-+|\.+|0+)?", c) else c


def session_day(h):
    """Day and venue from a live lot page: "This lot was auctioned on Saturday 21st October, 2017 at 2.00pm local time
    at Stoneleigh Park, Stoneleigh Rd, Coventry, CV8 2LG" -> ("2017-10-21", "Stoneleigh Park, …")."""
    m = re.search(r"auctioned on\s*(?:<[^>]+>\s*)*[A-Za-z]+day\s+(\d{1,2})(?:st|nd|rd|th)?\s+([A-Z][a-z]+),?\s+(\d{4})"
                  r"(?:\s+at\s+[\d.:]+\s*[ap]m)?(?:\s+local time)?(?:\s+at\s+([^<]*))?", h or "")
    if not m or m.group(2) not in MONTHS: return None, ""
    return "%s-%02d-%02d" % (m.group(3), MONTHS[m.group(2)], int(m.group(1))), html.unescape(m.group(4) or "").strip()


def multiday(s):
    """Live sale whose record has a last day after the first one (the last day is sometimes a typo, see session_day)."""
    return (s.get("auction_finish_date") or "") > s["auction_date"]


def country_of(sale, venue):
    return "DK" if re.search(r"aarhus|denmark", (sale.get("location_code") or "") + " " + venue + " " + sale.get("name", ""), re.I) else "GB"


try:
    # ------------------------------------------------------------------------------------------------ 1. sale list
    d = get(API % ("com_calendar", "archive.filterAuctions"),
            {"sale_type": "Sale Type", "layout": "", "sale_year": "", "per_page": 1000, "current_page": 1}, want_json=True)
    if not d or not d.get("auctions"): sys.exit("Iconic sale archive failed")
    allsales = d["auctions"]
    if int(d.get("auction_count") or 0) > len(allsales):
        print("note: archive holds", d["auction_count"], "sales, got", len(allsales), flush=True)
    save(allsales, os.path.join(DIR, "sales.json"))
    today = dt.date.today()
    sales = [s for s in allsales if s.get("auction_category") in ("CAR", "ONLINE") and (s.get("auction_date") or "") >= SINCE
             and s["auction_date"] < today.isoformat() and str(s.get("archived")) == "1"]   # finished sales only
    sales.sort(key=lambda s: s["auction_date"], reverse=True)   # newest first, so a limited run fetches the new lots
    print(len(allsales), "sales in the archive,", len(sales), "car and online sales since 2015", flush=True)

    # ------------------------------------------------------------------------------------------------ 2. lot lists
    def fetch_list(s):
        """The sale's lots whose title matches "Porsche" (the catalogue's own search), all sessions, 500 per request."""
        lots, page = [], 1
        while True:
            r = get(API % ("com_bidding", "commission.getLots"), {"per_page": 500, "current_page": page, "auction_id": s["id"],
                    "session_no": "", "lot_order": "ASC", "sale_type": "", "search": "Porsche"}, want_json=True)
            if not isinstance(r, dict) or not r.get("status"): return None
            lots += r.get("lots") or []
            if not r.get("lots") or len(lots) >= int(r.get("total_lots") or 0) or page >= 20: return lots
            page += 1

    lists, new_lists = {}, 0
    for s in sales:
        p = os.path.join(DIR, "lists", "%s.json" % s["id"])
        fresh = (today - dt.date.fromisoformat(s["auction_date"])).days < FRESH_DAYS
        if not os.path.exists(p) or fresh:
            lots = fetch_list(s)
            if lots is None:
                print("sale", s["auction_number"], "lot list failed", flush=True)
                if not os.path.exists(p): continue
            else:
                save(lots, p); new_lists += 1
                print("sale", s["auction_number"], s["auction_date"], len(lots), "Porsche lots", flush=True)
        lists[s["id"]] = json.load(open(p))

    # Porsche cars with a result: withdrawn lots and lots sold for an undisclosed sum are left out
    cands, skipped = [], Counter()
    for s in sales:
        for x in lists.get(s["id"], []):
            if not re.search(r"porsche", (x.get("name") or "") + " " + (x.get("meta_title") or ""), re.I): continue
            if x.get("article_cat_code") not in ("CAR", "RACE", None): continue
            if str(x.get("withdrawn")) == "1" or re.search(r"withdrawn", x.get("name") or "", re.I): skipped["withdrawn"] += 1; continue
            if str(x.get("not_show_sold_price")) == "1": skipped["sold, undisclosed price"] += 1; continue
            title = title_of(x.get("name"), None)
            if not classify(title) and re.match(r"(19|20)\d\d\b", title): continue
            cands.append((s, x))

    # ------------------------------------------------------------------------------------------------ 3. lot records
    recs, new_pages, missing = {}, 0, 0
    for s, x in cands:
        p = os.path.join(DIR, "lots", "%s.json" % re.sub(r"\D", "", str(x["id"])))
        if not os.path.exists(p):
            if LOT_PAGES is not None and new_pages >= LOT_PAGES: missing += 1; continue
            r = get(API % ("com_bidding", "archive.processLot"), {"auction_id": s["id"], "lot_id": x["id"]}, want_json=True)
            if r is None: continue
            if not isinstance(r, dict) or not r.get("status") or not isinstance(r.get("lot"), dict):
                print("lot", x["id"], "no record:", str((r or {}).get("message") if isinstance(r, dict) else r)[:200], flush=True)
                continue
            lot = r["lot"]
            for k in ("cat_desc_html", "meta_description", "images", "buyer_list", "payee_list", "contract_list"): lot.pop(k, None)
            save(lot, p); new_pages += 1
        recs[x["id"]] = json.load(open(p))

    # ------------------------------------------------------------------------------------------------ 4. session days
    sessions, sessions_p = load("sessions.json", {})
    new_sessions = 0
    for s, x in cands:
        lot = recs.get(x["id"])
        if not lot or s.get("auction_type") == "1" or not multiday(s): continue
        key = "%s:%s" % (s["id"], lot.get("session_no") or "")
        if key in sessions: continue
        if not x.get("lot_url"): continue
        h = get(BASE + x["lot_url"])
        if h is None: continue
        day, venue = session_day(h)
        new_sessions += 1
        if not day: print("no single sale day on", BASE + x["lot_url"], "(using the sale's first day)", flush=True)
        sessions[key] = {"date": day, "venue": venue}
        save(sessions, sessions_p)
except Blocked as e:
    sys.exit("Iconic Auctioneers answered with a bot challenge (%s); stopped, nothing written." % e)


# ------------------------------------------------------------------------------------------------ 5. rows
out, seen = [], set()
for s, x in cands:
    lot = recs.get(x["id"])
    if not lot or x["id"] in seen: continue
    title = title_of(x.get("name") or lot.get("name"), lot.get("production_year"))
    if not classify(title): continue
    venue = ""
    if s.get("auction_type") == "1":   # timed online sale: the lot's own closing time
        try: date = dt.datetime.fromtimestamp(int(lot["end_date_time"]) / 1000, dt.timezone.utc).date().isoformat()
        except (KeyError, TypeError, ValueError): date = s["auction_date"]
    elif not multiday(s): date = s["auction_date"]
    else:
        ses = sessions.get("%s:%s" % (s["id"], lot.get("session_no") or "")) or {}
        date, venue = ses.get("date") or s["auction_date"], ses.get("venue") or ""
        # a session page from another year (re-used session record) is not trusted
        if abs((dt.date.fromisoformat(date) - dt.date.fromisoformat(s["auction_date"])).days) > 7: date = s["auction_date"]
    if date < SINCE: continue
    amt = int(round(num(x.get("sold_price"))))
    sold = amt > 0
    cur = CURRENCY.get(x.get("currencySymbol") or lot.get("currencySymbol") or "", "GBP")
    # some online sales of 2025 print no lot number (0); their catalogue reference ("REC17033-2") keeps lots apart
    lot_no = str(x.get("total_lot_number") or "").strip()
    if lot_no in ("", "0"): lot_no = "%s%s" % (lot.get("lot_number") or "", lot.get("suffix") or "")
    if lot_no in ("", "0"): lot_no = lot.get("unique_id") or str(x["id"])
    low, high = int(num(lot.get("low_estimate"))), int(num(lot.get("high_estimate")))
    seen.add(x["id"])
    row = dict(id=str(x["id"]), code=s["auction_number"], lot=lot_no, title=title, date=date, sold=sold,
               amt=amt if sold else None, cur=cur, country=country_of(s, venue), chassis=chassis_of(lot), km=km_of(lot),
               url=BASE + x["lot_url"] if x.get("lot_url") else BASE + "index.php?option=com_bidding&view=commission&layout=details&id=%s" % x["id"],
               sale=text(s.get("name")))
    if not sold and low and high >= low: row["est"] = [low, high, cur]
    out.append(row)
out.sort(key=lambda r: (r["date"], r["code"], int(re.sub(r"\D", "", r["lot"]) or 0)))
json.dump(out, open(os.path.join(DIR, "iconic.json"), "w"), ensure_ascii=False)
if skipped: print("left out:", ", ".join("%d %s" % (n, k) for k, n in sorted(skipped.items())), flush=True)
if missing: print("note:", missing, "lot records not fetched yet (--lot-pages)", flush=True)
print(len(out), "Iconic Auctioneers results since 2015 (%d sold, %d not sold);" % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out)),
      new_lists, "lot lists,", new_pages, "new lot records,", new_sessions, "new session pages", flush=True)

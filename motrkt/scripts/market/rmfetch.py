"""RM Sotheby's results straight from RM: every Porsche lot with price, sale date, chassis number and mileage.

usage: python3 -I rmfetch.py WORK [--lot-pages N]

1. Lot list: RM's search (POST /api/search/SearchLots, {"Make": "Porsche"}), 200 lots per request. Page N starts at
   lot (N-1)*200; page 0 is the same as page 1. The whole list is fetched on every run (about 15 requests).
2. Sale date: from the sale's page /auctions/<code>/, once per sale (cached in WORK/web/rm/sales.json).
3. Chassis number, mileage and the estimate: from the lot page, once per lot and only for auctioned lots that classify.py assigns
   to a variant (cached in WORK/web/rm/lots/). --lot-pages N stops after N new lot pages (for a first test run).
Writes WORK/web/rm/rm.json, which build.py reads. RM's terms of use permit this access (confirmed by the project
owner on 11 November 2026). One request every 1.5 seconds.
"""
import gzip, html, json, os, re, sys, time, urllib.error, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify
from vat import vat_rate, with_vat

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://rmsothebys.com"
DELAY = 1.5
PAGE = 200
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "rm")
os.makedirs(os.path.join(DIR, "lots"), exist_ok=True)
MONTHS = {m: i + 1 for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August",
                                          "September", "October", "November", "December"])}


def get(url, body=None):
    """Response body as text; POSTs body as JSON. None after three failed tries, "" for a missing page."""
    time.sleep(DELAY)
    headers = {"User-Agent": UA, "Accept-Encoding": "gzip"}
    if body is not None: headers.update({"Content-Type": "application/json", "Accept": "application/json"})
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                return b.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (404, 410): return ""
            print("retry", url, e.code, flush=True)
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


# ------------------------------------------------------------------------------------------------ 1. lot list
lots, page, total = {}, 1, None
while True:
    raw = get("%s/api/search/SearchLots?page=%d&pageSize=%d" % (BASE, page, PAGE), {"Make": "Porsche", "SortBy": "Default"})
    if raw is None: sys.exit("RM search failed on page %d" % page)
    d = json.loads(raw)
    for it in d["items"]: lots[it["id"]] = it
    total = d["pager"]["totalItems"]
    print("list page", page, "of", d["pager"]["totalPages"], len(lots), "lots", flush=True)
    if page >= d["pager"]["totalPages"] or not d["items"]: break
    page += 1
if len(lots) < total:
    # the order is not guaranteed to be stable between requests; lots missed this time come in on the next run
    print("note:", total - len(lots), "of", total, "lots not returned this run", flush=True)


def code_of(link):
    m = re.search(r"/auctions/([a-z0-9-]+)/lots/", link or "")
    return m.group(1) if m else None


def price_of(value):
    """"£1,242,500 GBP" -> (1242500, "GBP")"""
    m = re.search(r"(\d{1,3}(?:[,.]\d{3})*)(?:\.\d\d)?\s*([A-Z]{3})\s*$", value or "")
    return (int(re.sub(r"\D", "", m.group(1))), m.group(2)) if m else (None, None)


# results only: sold lots with a price and lots that went unsold; still-for-sale and upcoming lots are not. A lot that
# went unsold and is offered afterwards at an asking price ("Asking", auctioned) counts as unsold; its current asking
# price takes the place of the estimate (shown in the app, never part of the market value).
cands = []
for it in lots.values():
    amt, cur = price_of(it["value"])
    ask = [amt, cur] if it.get("auctioned") and it["valueType"] == "Asking" and amt else None
    if it.get("auctioned") and it["valueType"] == "Asking": it["valueType"] = "Not Sold"
    if not it.get("auctioned") or it["valueType"] not in ("Sold", "Not Sold"): continue
    if it["valueType"] == "Sold" and not amt: continue
    # sales named with a year before 2015 ("Amelia Island 2008") are not needed: skips their sale and lot pages
    y = re.search(r"\b(19\d\d|20\d\d)\b", it.get("header") or "")
    if y and int(y.group(1)) < 2015: continue
    c = classify(it["publicName"])
    code = code_of(it["link"])
    if c and code: cands.append((it, c, code, amt, cur, ask))
print(len(cands), "auction results assigned to a variant", flush=True)


# ------------------------------------------------------------------------------------------------ 2. sale dates
def sale_date(h):
    """First day of the sale from the sale page header: "31 October 2026", "13 - 15 August 2026",
    "30 January - 1 February 2026"."""
    m = re.search(r'class="tile__description">\s*([^<]+)<', h)
    s = text(m.group(1)) if m else ""
    m = re.match(r"(\d{1,2})\s*(?:([A-Z][a-z]+)\s*)?(?:[-–]\s*\d{1,2}\s*(?:[A-Z][a-z]+\s*)?)?(?:[A-Z][a-z]+\s+)?(\d{4})", s)
    if not m: return None
    month = m.group(2) or re.search(r"([A-Z][a-z]+)\s+\d{4}", s).group(1)
    return "%s-%02d-%02d" % (m.group(3), MONTHS[month], int(m.group(1))) if month in MONTHS else None


sales, sales_p = load("sales.json", {})
for code in sorted({c[2] for c in cands}):
    if code in sales: continue
    h = get("%s/auctions/%s/" % (BASE, code))
    if h is None: continue
    sales[code] = sale_date(h)
    save(sales, sales_p)
    print("sale", code, sales[code], flush=True)


# upcoming lots (not auctioned yet; "Asking" lots are private sales), for the list of coming auctions: sale date from
# the sale page like above (fetched again while the sale page shows no date yet), estimate from the list
def list_estimate(value):
    """"€70,000 - €120,000 EUR" -> [70000, 120000, "EUR"]; None for "Estimate Upon Request" and the like."""
    m = re.search(r"([\d][\d,.']{2,})\s*-\s*\D{0,4}([\d][\d,.']{2,})\s*([A-Z]{3})\s*$", value or "")
    if not m: return None
    lo, hi = (int(re.sub(r"\D", "", x)) for x in (m.group(1), m.group(2)))
    return [lo, hi, m.group(3)] if 0 < lo <= hi else None


soon = [(it, code_of(it["link"])) for it in lots.values()
        if not it.get("auctioned") and it.get("valueType") != "Asking" and code_of(it["link"]) and classify(it["publicName"])]
for code in sorted({c for _, c in soon}):
    if sales.get(code): continue
    h = get("%s/auctions/%s/" % (BASE, code))
    if h is None: continue
    sales[code] = sale_date(h)
    save(sales, sales_p)
    print("upcoming sale", code, sales[code], flush=True)
save([dict(house="RM Sotheby's", sale=it.get("header") or "", saleUrl="%s/auctions/%s/" % (BASE, code), date=sales.get(code), lot=it["lot"], title=text(it["publicName"]),
           url=it["link"], est=list_estimate(it.get("value")), country=it.get("countryCode") or "", image=it.get("crop") or None,
           noreserve=it.get("valueType") == "Offered Without Reserve") for it, code in soon], os.path.join(DIR, "upcoming_lots.json"))
print(len(soon), "upcoming Porsche lots", flush=True)


# every lot of the list with its lot page and photo, for lotlinks.py (photos and lot links of the results taken from
# other sources, matched by sale code and lot number)
save([dict(house="RM Sotheby's", code=code_of(it["link"]), date=sales.get(code_of(it["link"])), lot=str(it["lot"]), title=text(it["publicName"])[:120],
           url=it["link"], image=it.get("crop") or None) for it in lots.values() if code_of(it["link"])], os.path.join(DIR, "lots_index.json"))


# ------------------------------------------------------------------------------------------------ 3. lot pages
def lot_details(h):
    """Chassis number and stated mileage (km, rounded to 100) from a lot page."""
    m = re.search(r'Chassis No\.\s*</div>\s*<div class="iddata"[^>]*>([^<]*)<', h)
    chassis = text(m.group(1)) if m else ""
    km = None
    # mileage only from the highlights that state the odometer, e.g. "Odometer reads just 10,210 kilometres from new"
    for li in re.findall(r"<li[^>]*>(.*?)</li>", h, re.S):
        t = text(li)
        if not re.search(r"\b(odometer|showing|shows|indicat|displays|reads|recorded|covered|from new)", t, re.I): continue
        # thousands separators with a stray space happen in RM's text ("10, 210 kilometres")
        m = re.search(r"\b(\d{1,3}(?:[,.] ?\d{3})+|\d+)\s*(kilometres|kilometers|km|miles)\b", t, re.I)
        if m:
            n = int(re.sub(r"\D", "", m.group(1)))
            km = round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100
            break
    return chassis, km


CUR_SIGN = {"$": "USD", "US$": "USD", "€": "EUR", "£": "GBP"}


def estimate_of(h):
    """RM's estimate in the sale's currency, printed next to the result ("CHF550,000 - CHF600,000 | Not Sold",
    "$800,000 - $1,000,000 USD | Not Sold"): [low, high, currency], or None. Shown in the app for unsold lots only."""
    m = re.search(r"(CHF|US\$|\$|€|£|EUR|GBP|USD|SEK|DKK)\s?([\d,.' ]{3,}?)\s*-\s*(?:CHF|US\$|\$|€|£|EUR|GBP|USD|SEK|DKK)?\s?([\d,.']{3,})"
                  r"\s*(USD|EUR|GBP|CHF|SEK|DKK)?\s*\|\s*(?:Not Sold|Sold|Withdrawn)", text(h))
    if not m: return None
    lo, hi = (int(re.sub(r"\D", "", x)) for x in (m.group(2), m.group(3)))
    cur = m.group(4) or CUR_SIGN.get(m.group(1), m.group(1))
    return [lo, hi, cur] if 0 < lo <= hi else None


out, new_pages = [], 0
for it, (vid, body, gear, year), code, amt, cur, ask in cands:
    date = sales.get(code)
    if not date or date < "2015-01-01": continue
    p = os.path.join(DIR, "lots", "%s-%s.html" % (code, it["referenceId"] or it["lot"]))
    if not os.path.exists(p):
        if LOT_PAGES is not None and new_pages >= LOT_PAGES: continue
        h = get(it["link"])
        if h is None: continue
        open(p, "w").write(h); new_pages += 1
    page = open(p, errors="ignore").read()
    chassis, km = lot_details(page)
    # "VATQ": VAT on the full purchase price comes on top of the published result (scripts/market/vat.py)
    vat = vat_rate(text(page), it.get("countryCode")) if it["valueType"] == "Sold" else None
    if vat: print("VAT %.1f%% on top:" % (vat * 100), code, it["lot"], text(it["publicName"])[:60], amt, "->", with_vat(amt, vat), cur, flush=True)
    out.append(dict(id=it["id"], code=code, lot=it["lot"], ref=it["referenceId"], title=text(it["publicName"]), date=date,
                    sold=it["valueType"] == "Sold", amt=with_vat(amt, vat) if it["valueType"] == "Sold" else None, cur=cur, vat=vat,
                    country=it.get("countryCode") or "", chassis=chassis, km=km, url=it["link"], sale=it["header"], est=[ask[0], ask[0], ask[1]] if ask else estimate_of(page)))
json.dump(out, open(os.path.join(DIR, "rm.json"), "w"), ensure_ascii=False)
print(len(out), "RM Sotheby's results since 2015;", new_pages, "new lot pages", flush=True)

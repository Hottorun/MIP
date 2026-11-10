"""Links to the original auction results: for each auction result taken from ultimatecarpage.com, find the lot page
at the auction house itself.

usage: python3 -I linkfetch.py WORK

Writes WORK/web/links.json: {"UCP-<auction>-<lot>": {"url": ..., "level": "lot" | "sale"}}.
Only public pages the houses offer to search engines are used (sitemaps, lot and sale pages); every lot link is checked
against the car (build year and make in the house's own lot title).

- Broad Arrow: lot URLs from the public sitemap, matched by sale and car (Broad Arrow numbers lots differently).
- Gooding & Company: lot URLs from the public sitemap, checked via the lot's public page data (lot number, sale, year).
- Bonhams: /auction/<sale>/lot/<lot>/; the sale number is found by date and confirmed by the lot redirecting to a
  Porsche of the right year.
- RM Sotheby's: lot pages are only reachable through RM's internal search, which is not used. Links go to the sale's
  results page (/auctions/<code>/lots/), the code confirmed by the sale page title.
- Artcurial: robots.txt excludes the motorcar pages, no link is built.
Results are cached in WORK/web/links/, so a rerun only looks up new sales. One request per second.
"""
import gzip, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
DELAY = 1.0
W = sys.argv[1]
CACHE = os.path.join(W, "web", "links")
os.makedirs(CACHE, exist_ok=True)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None


def get(url, follow=True):
    """(status, body, final_url or Location)"""
    time.sleep(DELAY)
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    for k in range(3):
        try:
            with opener.open(req, timeout=40) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip": body = gzip.decompress(body)
                return r.status, body, r.geturl()
        except urllib.error.HTTPError as e:
            if e.code in (301, 302, 303, 307, 308):
                loc = urllib.parse.urljoin(url, e.headers.get("Location") or "")
                # urllib does not follow 308 (Bonhams uses it): follow by hand
                return get(loc, follow) if follow and loc and loc != url else (e.code, b"", loc)
            if e.code in (404, 410): return e.code, b"", ""
            time.sleep(5 * (k + 1))
        except Exception as e:
            print("retry", url, e, flush=True)
            time.sleep(5 * (k + 1))
    return None, b"", ""


def cache(name, default):
    p = os.path.join(CACHE, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def lotnum(s):
    m = re.search(r"(\d+)", s or "")
    return int(m.group(1)) if m else None


sales = [r for r in json.load(open(os.path.join(W, "web", "sales_all.json"))) if r.get("src") == "ucp"]
events = {}
for r in sales:
    aid = r["lot"].split("-")[1]
    events.setdefault(aid, {"event": r["event"], "date": r["date"], "house": r["house"], "rows": []})["rows"].append(r)
links, links_p = {}, os.path.join(CACHE, "links.json")  # rebuilt each run from the caches


def ok_title(text, year):
    t = (text or "").lower()
    return "porsche" in t and str(year) in t


# ------------------------------------------------------------------------------------------------ Broad Arrow
def tokens(text):
    stop = {"porsche", "the", "and", "with", "by", "coupe", "coupé", "of"}
    return {w for w in re.findall(r"[a-z0-9]+(?:\.[0-9])?", text.lower().replace("-", " ")) if w not in stop and not re.fullmatch(r"(19|20)\d\d", w)}


def best_match(title, year, cands, used):
    """Candidate (url, text) with the most words in common with the title; build year and make must match.
    None if two candidates tie or nothing beyond the year matches."""
    tt = tokens(title)
    scored = sorted(((len(tt & tokens(text)), url) for url, text in cands if url not in used and ok_title(text, year)), reverse=True)
    if not scored or scored[0][0] == 0 or (len(scored) > 1 and scored[1][0] == scored[0][0]):
        return None
    return scored[0][1]


def broad_arrow():
    """Broad Arrow numbers lots differently from the result lists (r001 … vs 101 …), so lots are matched by sale and
    car: the sale code whose lots match most of the event's cars, then each car by build year and model words."""
    st, body, _ = get("https://dealeraccelerate-all.s3.amazonaws.com/bagauction/sitemaps/sitemap.xml.gz")
    if st != 200: print("Broad Arrow sitemap", st); return
    try: body = gzip.decompress(body)
    except OSError: pass
    by_code = {}
    for code, lot, slug in re.findall(r"broadarrowauctions\.com/vehicles/([a-z0-9]+)_([a-z]?\d+)/([^<]+)</loc>", body.decode("utf-8", "replace")):
        by_code.setdefault(code, []).append(("https://www.broadarrowauctions.com/vehicles/%s_%s/%s" % (code, lot, slug), slug.replace("-", " ")))
    n = 0
    for aid, ev in events.items():
        if ev["house"] != "Broad Arrow": continue
        yy = ev["date"][2:4]
        best = None
        for code, lots in by_code.items():
            if re.search(r"\d\d", code) and re.search(r"\d\d", code).group(0) == yy:
                hits = sum(1 for r in ev["rows"] if best_match(r["title"], r["year"], lots, set()))
                if hits and (not best or hits > best[0]): best = (hits, code)
        if not best or best[0] < max(2, len(ev["rows"]) // 3):
            continue
        used = set()
        for r in ev["rows"]:
            u = best_match(r["title"], r["year"], by_code[best[1]], used)
            if u:
                used.add(u)
                links[r["lot"]] = {"url": u, "level": "lot"}; n += 1
    print("Broad Arrow:", n, "lot links", flush=True)


# ------------------------------------------------------------------------------------------------ Gooding
def gooding():
    st, body, _ = get("https://www.goodingco.com/sitemap.xml")
    if st != 200: print("Gooding sitemap", st); return
    years = {str(r["year"]) for ev in events.values() if ev["house"].startswith("Gooding") for r in ev["rows"]}
    slugs = sorted(x for x in set(re.findall(r"goodingco\.com/lot/([^<]*porsche[^<]*)</loc>", body.decode("utf-8", "replace"))) if x[:4] in years)
    lots, p = cache("gooding.json", {})
    for i, s in enumerate(slugs):
        if s in lots: continue
        st, b, _ = get("https://www.goodingco.com/page-data/lot/%s/page-data.json" % s)
        lot = None
        if st == 200:
            try:
                d = json.loads(b)["result"]["data"]["contentfulLot"] or {}
                web = (d.get("auction") or {}).get("webpage__auction") or [{}]
                lot = {"lot": d.get("lotNumber"), "sale": web[0].get("slug") or "", "title": ((d.get("item") or {}).get("title")) or "",
                       "year": (d.get("item") or {}).get("modelYear")}
            except (KeyError, TypeError, ValueError, AttributeError):
                lot = None
        lots[s] = lot
        if i % 50 == 0: save(lots, p); print("Gooding", i, "/", len(slugs), flush=True)
    save(lots, p)
    by_sale = {}
    for s, d in lots.items():
        if d and d.get("lot") and d.get("sale"):
            by_sale.setdefault(d["sale"], {})[int(d["lot"])] = (s, d)
    n = 0
    for aid, ev in events.items():
        if not ev["house"].startswith("Gooding"): continue
        # Gooding holds several sales a year: take the sale of that year whose lot numbers match most of the event's cars
        best = None
        for sale, lots_s in by_sale.items():
            if not sale.endswith(ev["date"][:4]): continue
            hits = sum(1 for r in ev["rows"] if (lambda x: x and ok_title(x[1]["title"], r["year"]))(lots_s.get(lotnum(r["lot"].split("-", 2)[2]))))
            if hits and (not best or hits > best[0]): best = (hits, sale)
        if not best or best[0] < max(2, len(ev["rows"]) // 3): continue
        lots_s = by_sale[best[1]]
        for r in ev["rows"]:
            x = lots_s.get(lotnum(r["lot"].split("-", 2)[2]))
            if x and ok_title(x[1]["title"], r["year"]):
                links[r["lot"]] = {"url": "https://www.goodingco.com/lot/%s" % x[0], "level": "lot"}; n += 1
    print("Gooding:", n, "lot links", flush=True)


# ------------------------------------------------------------------------------------------------ Bonhams
def bonhams():
    st, body, _ = get("https://www.bonhams.com/sitemap-sale.xml")
    if st != 200: print("Bonhams sitemap", st); return
    ids = sorted(set(int(x) for x in re.findall(r"bonhams\.com/auctions?/(\d+)/", body.decode("utf-8", "replace"))))
    dates, pd = cache("bonhams_dates.json", {})
    lotc, pl = cache("bonhams_lots.json", {})
    sale_of, ps = cache("bonhams_sales.json", {})

    def date_of(i):
        k = str(ids[i])
        if k not in dates:
            st, b, _ = get("https://www.bonhams.com/auction/%d/" % ids[i])
            m = re.search(rb'"datetime":"(\d{4}-\d\d-\d\d)', b)
            if st is None: return None   # network error: not cached, tried again next run
            dates[k] = m.group(1).decode() if m else None
            save(dates, pd)
        return dates[k]

    def lot_title(sid, lot):
        k = "%s/%s" % (sid, lot)
        if k not in lotc:
            st, _, loc = get("https://www.bonhams.com/auction/%s/lot/%s/" % (sid, lot), follow=False)
            if st is None: return ""   # network error: not cached
            lotc[k] = loc if st in (301, 302, 303, 307, 308) else ""
            save(lotc, pl)
        return lotc[k].replace("-", " ")

    def days(d): return int(d[:4]) * 372 + int(d[5:7]) * 31 + int(d[8:10])

    # Bonhams' public list of its car sales (cars.bonhams.com/auctions/results/, back to spring 2019): id and date
    car_sales = []
    st, b, _ = get("https://cars.bonhams.com/auctions/results/?page=10")
    m = re.search(rb'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', b, re.S)
    if st == 200 and m:
        try:
            for page in json.loads(m.group(1))["props"]["pageProps"]["pagesOfAuctions"]:
                for a in page:
                    car_sales.append((a["id"], a["dates"]["start"]["datetime"][:10], a["dates"]["end"]["datetime"][:10]))
        except (KeyError, TypeError, ValueError):
            pass
    print("Bonhams car sales listed:", len(car_sales), flush=True)
    for aid, ev in events.items():
        if ev["house"] != "Bonhams" or sale_of.get(aid): continue
        probes = ev["rows"][:3]
        for sid, start, end in car_sales:
            if days(start) - 3 <= days(ev["date"]) <= days(end) + 3 and any(
                    ok_title(lot_title(sid, lotnum(r["lot"].split("-", 2)[2])), r["year"]) for r in probes):
                sale_of[aid] = sid
                save(sale_of, ps)
                print("Bonhams", ev["event"], "->", sid, "(list)", flush=True)
                break

    # older sales: search the sale numbers by date (they grow with time, roughly)
    for aid, ev in events.items():
        if ev["house"] != "Bonhams" or aid in sale_of: continue
        probe = ev["rows"][0]
        plot = lotnum(probe["lot"].split("-", 2)[2])
        # binary search for the first sale on or after the date (sale numbers grow with time, roughly)
        lo, hi = 0, len(ids) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            d = date_of(mid)
            k = 1
            while d is None and mid + k <= hi:
                d = date_of(mid + k); k += 1
            if d is None or d >= ev["date"]: hi = mid
            else: lo = mid + 1
        found = None
        for off in range(0, 60):
            for j in ((lo + off,) if off == 0 else (lo + off, lo - off)):
                if not 0 <= j < len(ids): continue
                d = date_of(j)
                if not d or abs((int(d[:4]) * 372 + int(d[5:7]) * 31 + int(d[8:])) - (int(ev["date"][:4]) * 372 + int(ev["date"][5:7]) * 31 + int(ev["date"][8:]))) > 4:
                    continue
                if ok_title(lot_title(ids[j], plot), probe["year"]):
                    found = ids[j]; break
            if found: break
        sale_of[aid] = found
        save(sale_of, ps)
        print("Bonhams", ev["event"], "->", found, flush=True)
    n = 0
    for aid, ev in events.items():
        sid = sale_of.get(aid)
        if ev["house"] != "Bonhams" or not sid: continue
        for r in ev["rows"]:
            lot = lotnum(r["lot"].split("-", 2)[2])
            if ok_title(lot_title(sid, lot), r["year"]):
                links[r["lot"]] = {"url": "https://www.bonhams.com/auction/%s/lot/%s/" % (sid, lot), "level": "lot"}; n += 1
    print("Bonhams:", n, "lot links", flush=True)


# ------------------------------------------------------------------------------------------------ RM Sotheby's
RM_CODES = [("amelia", ["am"]), ("arizona", ["az"]), ("monterey", ["mo"]), ("paris", ["pa"]), ("london", ["lf", "ld", "lo"]),
            ("monaco", ["mc"]), ("villa erba", ["ve"]), ("hershey", ["hf", "he"]), ("fort lauderdale", ["fl"]), ("essen", ["es"]),
            ("lake como", ["lc"]), ("villa d'este", ["lc"]), ("miami", ["mi"]), ("milan", ["ml", "mn", "mi"]),
            ("abu dhabi", ["ad", "ab", "ah", "ud"]), ("dubai", ["du", "db", "dx", "dc"]), ("le mans", ["lm", "le"]),
            ("hilton head", ["hh"]), ("santa monica", ["sm"]), ("las vegas", ["lv"]), ("shanghai", ["sh"]),
            ("toronto", ["tr", "to"]), ("auburn", ["au"]), ("dallas", ["dl"]), ("st. moritz", ["st", "sm", "mz"]),
            ("battersea", ["lf"]), ("munich", ["mu", "mn", "mc", "de"]), ("riyadh", ["ry"]), ("cernobbio", ["lc"]),
            ("tegernsee", ["tc", "te", "tg"]), ("zurich", ["zu", "zh", "zr", "zc"]), ("new york", ["ny"]),
            ("palm beach", ["pb", "pl"]), ("cliveden", ["cv", "cl", "ch"]), ("woodcote", ["wc", "wp", "wo"]),
            ("petersen", ["pe", "ps", "la"]), ("duemila ruote", ["mi", "dr"]), ("european sale", ["eu", "es"])]


def rm():
    codes, p = cache("rm_sales.json", {})
    n = 0
    for aid, ev in events.items():
        if not ev["house"].startswith("RM"): continue
        if not codes.get(aid):
            name = ev["event"].lower()
            yy = ev["date"][2:4]
            found = None
            for kw, cs in RM_CODES:
                if kw in name:
                    for c in cs:
                        st, b, url = get("https://rmsothebys.com/auctions/%s%s/" % (c, yy))
                        t = re.search(rb"<title>([^<]*)", b)
                        t = t.group(1).decode("utf-8", "replace").lower() if t else ""
                        # the year is in the code; titles without a year ("The Tegernsee Auction") are fine, a title
                        # naming another year is not
                        years = re.findall(r"\b(?:19|20)\d\d\b", t)
                        if st == 200 and all(w in t for w in kw.split()) and (not years or ev["date"][:4] in years):
                            found = c + yy; break
                if found: break
            codes[aid] = found
            save(codes, p)
            print("RM", ev["event"], "->", found, flush=True)
        if codes[aid]:
            for r in ev["rows"]:
                links[r["lot"]] = {"url": "https://rmsothebys.com/auctions/%s/lots/" % codes[aid], "level": "sale"}; n += 1
    print("RM Sotheby's:", n, "sale links", flush=True)


for f in (broad_arrow, gooding, rm, bonhams):
    f()
    save(links, links_p)
print(len(links), "links of", len(sales), "results")

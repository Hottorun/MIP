"""Lot links and photos for auction results that came without them (ultimatecarpage and Hammer Price rows, whose link
goes to a house's result list or search, or nowhere): matched to the lot lists the house fetchers read anyway.

Used by build.py: apply(rows, W) sets "url" (the lot page) and "image" (the house's main photo, where its list gives
one) on rows it can match; nothing is fetched here. A row matches a lot of the same house when
- the lot number is the same (the number as printed; Mecum's letter prefix "S237" also matches "237"),
- the sale day is within a few days (lists and result sources date multi-day sales differently),
- and the build year in both titles is the same (where both titles give one).
A lot that two rows (or a row that two lots) would match is left out.

Lot lists (each written by the house's fetcher into WORK/web/<house>/):
- Bonhams: bonhams/lots_index.json (bonhamsfetch.py), else the copy scripts/market/manual/bonhams-lose.json: Bonhams
  often answers requests from the GitHub runners with a bot challenge, so a local run's list is kept in the repository.
- RM Sotheby's: rm/lots_index.json (rmfetch.py); rows that carry RM's sale code in their link match by code and lot.
- Mecum: mecum/lots_index.json (mecumfetch.py).
- Iconic Auctioneers: the sale archive and catalogue lists iconicfetch.py caches (iconic/sales.json, iconic/lists/).
- Artcurial: the sale catalogues artcurialfetch.py caches (artcurial/lots/<sale>.json).
"""
import collections, datetime as dt, glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
# lot pages (keep in step with src/lib/lotPages.ts); other links are result lists, searches or home pages
LOT_PAGE = [r"^https://bringatrailer\.com/listing/", r"^https://www\.mecum\.com/lots/(?:[A-Z]{2}\d{2}-)?\d+/", r"^https://rmsothebys\.com/(?:[a-z]{2}/)?auctions/[^/]+/lots/[^/?#]+",
            r"^https://www\.goodingco\.com/lot/", r"^https://www\.iconicauctioneers\.com/(?:online/)?(?:[^/?#]+-)?recc?\d+-\d+", r"^https://cars\.bonhams\.com/auction/\d+/lot/",
            r"^https://www\.bonhams\.com/auction/\d+/lot/", r"^https://www\.broadarrowauctions\.com/vehicles/[a-z0-9_]+/", r"^https://www\.artcurial\.com/(?:en|fr)/sales/\d+/lots/",
            r"^https://www\.osenat\.com/lot/", r"^https://www\.aguttes\.com/lot/",
            r"^https://www\.barrett-jackson\.com/[^/?#]+/docket/vehicle/", r"^https://www\.pcarmarket\.com/results/",
            r"^https://www\.gaaclassiccars\.com/vehicles/\d+/"]
ICONIC_STORE = "https://am-s3-bucket-assets.s3.eu-west-2.amazonaws.com/silverstone/prod/"


def is_lot_page(url): return any(re.search(p, url or "", re.I) for p in LOT_PAGE)


def load(p, default):
    try: return json.load(open(p))
    except (OSError, ValueError): return default


def year_of(t):
    m = re.search(r"\b(19[0-9]\d|20[0-4]\d)\b", t or "")
    return m.group(1) if m else None


def lot_key(lot):
    return re.sub(r"[^A-Z0-9]", "", str(lot or "").upper()).lstrip("0") or None


def digits(lot):
    m = re.search(r"(\d+)([A-Z]?)$", lot_key(lot) or "")
    return (m.group(1).lstrip("0") + m.group(2)) if m else None


def lists(W):
    """{house: [lot dicts with date, lot, url, image, title (, code)]}"""
    web = os.path.join(W, "web")
    out = collections.defaultdict(list)
    bon = {x["url"]: x for x in load(os.path.join(HERE, "manual", "bonhams-lose.json"), [])}
    bon.update({x["url"]: x for x in load(os.path.join(web, "bonhams", "lots_index.json"), [])})
    out["Bonhams"] = list(bon.values())
    out["RM Sotheby's"] = load(os.path.join(web, "rm", "lots_index.json"), [])
    out["Mecum"] = load(os.path.join(web, "mecum", "lots_index.json"), [])
    sales = {str(s.get("id")): s for s in load(os.path.join(web, "iconic", "sales.json"), [])}
    for p in glob.glob(os.path.join(web, "iconic", "lists", "*.json")):
        s = sales.get(os.path.basename(p)[:-5])
        if not s: continue
        for x in load(p, []):
            if not x.get("lot_url"): continue
            img = x.get("image") or ""
            out["Iconic Auctioneers"].append(dict(date=s.get("auction_date"), end=s.get("auction_finish_date"), lot=str(x.get("total_lot_number") or ""),
                                                  title=x.get("name") or "", url="https://www.iconicauctioneers.com/" + x["lot_url"].lstrip("/"),
                                                  image=ICONIC_STORE + img.replace("/medium/", "/large/") if img.startswith("lot_images/") else None))
    for p in glob.glob(os.path.join(web, "artcurial", "lots", "*.json")):
        for x in (load(p, {}) or {}).get("lots", []):
            day = (x.get("adjudicationDate") or "")[:10]
            if not day or not x.get("saleRef"): continue
            pics = [q.get("document", {}).get("mediaLink") for q in x.get("pictures") or [] if q.get("mediaType") == "PICTURE"]
            sub = (x.get("subIndex") or "").lower()
            out["Artcurial"].append(dict(date=day, lot="%s%s" % (x.get("index"), sub.upper()), title=" ".join(
                str(d.get("title") or "") for d in (x.get("descriptions") or []) if isinstance(d, dict))[:120],
                url="https://www.artcurial.com/en/sales/%s/lots/%s%s" % (x["saleRef"], x.get("index"), "-" + sub if sub else ""),
                image=next((u for u in pics if u), None)))
    return out


# houses whose lots another house's list holds: RM Sotheby's took over Auctions America and keeps its sales
SAME_LIST = {"Auctions America": "RM Sotheby's"}


def apply(rows, W, days=3):
    by_house = lists(W)
    idx = {}
    for house, lots in by_house.items():
        m = collections.defaultdict(list)
        for x in lots:
            d = digits(x.get("lot"))
            for k in {lot_key(x.get("lot")), d, re.sub(r"[A-Z]$", "", d or "") or None}:
                if k: m[k].append(x)
        idx[house] = m
    rm_code = collections.defaultdict(list)
    for x in by_house.get("RM Sotheby's", []):
        if x.get("code"): rm_code[(x["code"], lot_key(x["lot"]))].append(x)

    def near(a, b, end=None):
        try:
            d = dt.date.fromisoformat(a).toordinal() - dt.date.fromisoformat(b).toordinal()
            if end and dt.date.fromisoformat(b) <= dt.date.fromisoformat(a) <= dt.date.fromisoformat(end): return True
            return abs(d) <= days
        except (TypeError, ValueError):
            return False

    found = {}
    for i, r in enumerate(rows):
        house = SAME_LIST.get(r.get("house"), r.get("house"))
        if house not in idx or is_lot_page(r.get("url")): continue
        lot = (r.get("lot") or "").split("-")[-1]
        cands = []
        m = re.search(r"rmsothebys\.com/auctions/([^/]+)/lots/$", r.get("url") or "")
        if house == "RM Sotheby's" and m: cands = rm_code.get((m.group(1), lot_key(lot)), [])
        if not cands:
            pool = idx[house].get(lot_key(lot), []) + idx[house].get(digits(lot), [])
            cands = [x for x in pool if x.get("date") and near(r["date"], x["date"], x.get("end"))]
        y = year_of(r.get("title"))
        cands = list({x["url"]: x for x in cands if not (y and year_of(x.get("title")) and year_of(x.get("title")) != y)}.values())
        if len(cands) == 1: found[i] = cands[0]
    used = collections.Counter(x["url"] for x in found.values())
    n = collections.Counter()
    for i, x in found.items():
        if used[x["url"]] > 1: continue
        rows[i]["url"] = x["url"]
        if x.get("image"): rows[i]["image"] = x["image"]
        n[rows[i]["house"]] += 1
    print("lot links matched:", ", ".join("%s %d" % kv for kv in n.most_common()) or "none", flush=True)
    return rows

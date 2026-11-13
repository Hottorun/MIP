"""Aguttes results straight from Aguttes: every Porsche lot with price, sale date, chassis number and mileage.

usage: python3 -I aguttesfetch.py WORK [--lot-pages N]

Aguttes' website (aguttes.com, Next.js on the Artisio auction platform) renders its pages on the server and puts the
page data into the page as JSON (<script id="__NEXT_DATA__">); this script reads that JSON from the public pages. The
site's own JSON API (/api/artisio/...) is not used: it answers only requests from the site itself.
1. Lot list: the site's lot search (/search?keyword=porsche, past lots, 96 lots per page, newest sale first), about 3
   pages. Each lot carries title, catalogue text, lot number, estimate, status, the result and the sale (uuid, title,
   type, first day). The search covers all sales since 2011, including the old sales whose catalogue pages are empty.
   The whole list is fetched on every run (results change after the sale); kept in WORK/web/aguttes/search.json.
   The result is what Aguttes shows as "Vendu" (financeItem.hammer_bp_incl_vat; the lot page adds "Les prix s'entendent
   commission et taxes comprises"): the price including buyer's premium and taxes, also for the old sales imported
   from Aguttes' former site. A sold lot without a price is left out.
2. Sale details: sale code, sale days (with the first lot of each session), end of a timed sale and the place, from the
   sale's catalogue page (/catalogue/<uuid>), once per sale with Porsche results since 2015 (cached in
   WORK/web/aguttes/sales/). Live sales are dated by the session the lot was in, timed (online) sales by their closing
   day. The country comes from the place ("Autoworld Bruxelles" -> BE); Aguttes otherwise sells in France.
   --lot-pages N stops after N new pages (sale pages and lot pages) in one run (for a first test run).
3. Unsold lots: Aguttes does not publish lots that did not sell; after the sale they are gone from the catalogue and the
   search, so the years before this script ran have sold lots only. From now on each run also reads the upcoming
   Porsche lots (/search?keyword=porsche&auction_status=published) and keeps them in WORK/web/aguttes/upcoming.json.
   Three days after the sale, an upcoming lot that is not among the results gets one look at its lot page (cached in
   WORK/web/aguttes/checked/): only a lot whose page says "unsold" becomes a not-sold row (with the estimate); a page
   that is gone or shows another status (withdrawn) is left out. A later post-sale deal shows up in the search and
   then counts as sold.
4. Title in the form classify.py reads ("Porsche 356 B 1600 Super 75 – 1959" -> "1959 Porsche 356 B 1600 Super 75";
   old sales with the title "1981 - Porsche" or "PORSCHE" take the model from the next catalogue line). Chassis number
   from the catalogue text ("Châssis n° ...", "N° de châssis : ..."); mileage only where the text states the odometer
   ("au compteur", "kilométrage", "km d'origine", a short highlight like "Seulement 42.000 km"), in km rounded to 100.
   Lots whose catalogue text appears twice in one sale (Aguttes copied a record onto another lot, two prices for one
   car) are left out.
Writes WORK/web/aguttes/aguttes.json, which build.py reads. Aguttes' permission for this access confirmed by the
project owner on 13 November 2026. One request every 1.5 seconds. Stops if Aguttes answers with a bot challenge.
"""
import datetime as dt, gzip, hashlib, html, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.aguttes.com"
DELAY = 1.5
SINCE = "2015-01-01"
PAGE = 96          # largest page size the search offers
CHECK_DAYS = 3     # an upcoming lot missing from the results is looked at this many days after the sale
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "aguttes")
for sub in ("sales", "checked"): os.makedirs(os.path.join(DIR, sub), exist_ok=True)
# every normal page loads Cloudflare's "challenge-platform" script, so that alone is not a challenge
CHALLENGE = re.compile(r"cf-chl|Just a moment\.\.\.|Attention Required|cf-turnstile|captcha-delivery|_Incapsula_|px-captcha", re.I)
NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
TODAY = dt.date.today()


class Blocked(Exception): pass


def get(url):
    """Page text; "" for a missing page; None after three failed tries. Raises Blocked on a bot challenge (Cloudflare
    marks it with a cf-mitigated header; the challenge page has no page data)."""
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml",
                                               "Accept-Language": "fr-FR,fr;q=0.9", "Accept-Encoding": "gzip"})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                t = b.decode("utf-8", "replace")
                if r.headers.get("cf-mitigated") or (not NEXT.search(t) and CHALLENGE.search(t)): raise Blocked(url)
                return t
        except urllib.error.HTTPError as e:
            b = e.read()
            if e.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
            t = b.decode("utf-8", "replace")
            if e.headers.get("cf-mitigated") or (e.code in (403, 429, 503) and CHALLENGE.search(t)): raise Blocked(url)
            if e.code in (404, 410): return ""
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def page_props(t):
    m = NEXT.search(t or "")
    if not m: return None
    try: return json.loads(m.group(1))["props"]["pageProps"]
    except (ValueError, KeyError, TypeError): return None


def load(name, default):
    p = os.path.join(DIR, name)
    return (json.load(open(p)) if os.path.exists(p) else default), p


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or "")).replace("\xa0", " ")).strip()


def fr(d): return (d or {}).get("fr") or (d or {}).get("en") or "" if isinstance(d, dict) else (d or "")


def search(status):
    """All lots of the site search for "porsche" in past (completed) or upcoming (published) sales, each with the
    href of its lot page. None if a page could not be fetched."""
    lots, page, count = {}, 1, 0
    while True:
        q = urllib.parse.urlencode({"keyword": "porsche", "auction_status": status, "limit": PAGE,
                                    "ordering": "-auction_start_date", "page": page})
        h = get("%s/search?%s" % (BASE, q))
        p = page_props(h)
        if p is None or not isinstance(p.get("lotsData"), dict) or p["lotsData"].get("error"):
            print("search", status, "page", page, "failed", flush=True)
            return None
        d = p["lotsData"]
        count = d.get("count") or 0
        hrefs = {m.group(2): html.unescape(m.group(1)) for m in re.finditer(
            r'href="(/lot/[^"]*?-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))"', h)}
        for x in d.get("results") or []:
            x["href"] = hrefs.get(x["uuid"]) or "/lot/%s/%s" % (x.get("auction_uuid"), x["uuid"])
            lots[x["uuid"]] = x
        print("search", status, "page", page, len(lots), "of", count, "lots", flush=True)
        if not d.get("results") or page * PAGE >= count: break
        page += 1
    if len(lots) < count: print("note: search returned", len(lots), "of", count, status, "lots", flush=True)
    return lots


# ------------------------------------------------------------------------------------------------ titles
YEAR = r"\b(?:18[89]\d|19\d\d|20[0-4]\d)\b"
NOT_MODEL = re.compile(r"^(carte|titre|ch[aâ]ssis|n°|num[ée]ro|sans|ffve|moteur|addend|errat|vendu|import|v[ée]hicule)", re.I)


def lines_of(x):
    """Catalogue text as lines (the site separates them with <br>)."""
    out = [text(l).strip(" ~") for l in re.split(r"<br\s*/?>|</p>|\n", fr(x.get("description")))]
    return [l for l in out if l]


def same(a, b): return re.sub(r"\W+", "", a.lower()) == re.sub(r"\W+", "", b.lower())


def title_of(x):
    """Lot title in a form classify() reads: "<year> Porsche <model>". Aguttes titles come as "Porsche 356 B 1600
    Super 75 – 1959", "1967 – Porsche 911", "1986 PORSCHE 911 3.2 Cabriolet", and in the old sales as "1981 - Porsche"
    or "PORSCHE" with the model on the next catalogue line ("911 SC 3.0L Targa «La 911 n'a pas dit son dernier mot»",
    "2007 - PORSCHE 997" + "TURBO CABRIOLET Présentation élégante"). Puts the year in front, takes the model from the
    next line where the title has none (cut where the tagline or running text starts), drops a quoted mileage
    ("« 3 700 km »"), writes litres and French words as classify() expects ("3,2L" -> "3.2", "2L" -> "2.0", "C2" ->
    "Carrera 2", "par" -> "by", "Porche" -> "Porsche") and puts the 911 model letter before the displacement."""
    t = text(fr(x.get("title"))).strip(" ~-–/")
    lines = lines_of(x)
    if lines and same(lines[0], t): lines = lines[1:]
    nxt = lines[0] if lines else ""
    if nxt and not NOT_MODEL.match(nxt):
        has_year = re.search(YEAR, t)
        has_model = re.search(r"\bpors?che\s+\S", t, re.I) or (t and not re.search(r"\bpors?che\b", t, re.I)
                                                             and re.sub(YEAR, "", t).strip(" -–"))
        if not has_year or not has_model:
            add = nxt if len(nxt) <= 60 else re.split(r"\s*[«\"“]", nxt)[0]
            add = re.split(r"\s+(?=[A-ZÀ-Ý][a-zà-ÿ'’]+\s+[a-zà-ÿ])", add)[0].strip(" -–,.")  # "TARGA La première ..."
            if not has_year and not re.search(YEAR, add):
                y = re.search(YEAR, nxt[:120])
                if y: add += " " + y.group(0)
            t = "%s %s" % (t, add)
        else:
            # a model continued in capitals on the next line: "2007 - PORSCHE 997" + "TURBO CABRIOLET Présentation ..."
            caps = re.match(r"((?:[A-Z0-9][A-Z0-9.\-/]*\s+)*[A-Z0-9][A-Z0-9.\-/]*)(?=\s+[A-ZÀ-Ý]?[a-zà-ÿ]|$)", nxt)
            if caps and re.search(r"[A-Z]{2}", caps.group(1)): t = "%s %s" % (t, caps.group(1))
    t = re.sub(r"\s*«[^»]*\bkm\b[^»]*»", "", t)
    t = re.sub(r"\bPorche\b", "Porsche", t, flags=re.I)
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)
    t = re.sub(r"\b(\d\.\d)\s?L\b", r"\1", t)
    t = re.sub(r"(?<![\d.])([1-6])\s?L\b", r"\1.0", t)       # "911 2L T", "Turbo 3 L"; not "911 L"
    t = re.sub(r"\bGT ([234])\b", r"GT\1", t)
    t = re.sub(r"\bC([24])(S?)\b", lambda m: "Carrera %s%s" % (m.group(1), m.group(2)), t)
    t = re.sub(r"\b356 AT ?([12])\b", r"356 A T\1", t)
    t = re.sub(r"\b(Porsche) (2\.[0247]) ?([TES])\b", r"\1 911 \2 \3", t, flags=re.I)  # "1971 - PORSCHE 2.2 S Targa"
    t = re.sub(r"\bGT3 Supercup\b", "GT3 Cup", t, flags=re.I)
    t = re.sub(r"\b(VW|Volkswagen)[- ]Porsche\b", "Porsche", t, flags=re.I)
    t = re.sub(r"\b911 (\d\.\d) ?([TESL])\b", r"911 \2 \1", t)
    t = re.sub(r" par ", " by ", t)  # classify() rejects coachbuilt/tuned cars by " by "
    t = re.sub(r"\s+", " ", t).strip(" -–")
    m = re.match(r"^(%s)\s*[-–]?\s*(.*)$" % YEAR, t)
    if m: t = "%s %s" % (m.group(1), m.group(2))
    else:
        ys = list(re.finditer(r"[\s,(–-]*(%s)\)?" % YEAR, t))
        if ys: t = "%s %s%s" % (ys[-1].group(1), t[:ys[-1].start()], t[ys[-1].end():])
    return re.sub(r"\s+", " ", re.sub(r"\bPORSCHE\b", "Porsche", t)).strip()


# ------------------------------------------------------------------------------------------------ chassis, km
CHASSIS = re.compile(r"^(?:n°\s*de\s*ch[aâ]ssis|num[ée]ro\s*de\s*ch[aâ]ssis|ch[aâ]ssis|chassis|frame|vin)\s*"
                     r"(?:n[°º]\.?|no\.?|number|#)?\s*[:.]?\s*(.*)$", re.I)


def chassis_of(x):
    """"Châssis n° 9114609108" -> "9114609108"; "N° de châssis" / "Chassis n°: 303821"; "Châssis : WDD...";
    "Châssis n° 117745/123925 (voir texte / see text)" -> "117745/123925". Only the header lines are read."""
    lines = lines_of(x)[:14]
    for i, l in enumerate(lines):
        m = CHASSIS.match(l)
        if not m: continue
        v = m.group(1)
        while True:   # bilingual labels: "Châssis n°/Chassis number: 11980"
            v = v.strip(" .;,:/")
            m = CHASSIS.match(v)
            if not m: break
            v = m.group(1)
        if not v and i + 1 < len(lines) and not CHASSIS.match(lines[i + 1]): v = lines[i + 1]
        v = re.split(r"\s*(?:\(voir|\(see|[-–]\s|moteur|engine|bo[iî]te|gearbox|carte grise|titre)", v, flags=re.I)[0]
        v = re.sub(r"\s+", " ", v).strip(" .;,:/")
        if re.search(r"\d", v) and len(v) <= 30 and len(v.split()) <= 3: return v
    return ""


# Mileage: only the odometer reading as stated now, not distances since a restoration or service, readings from the
# car's history, or km/h (as in artcurialfetch.py, for Aguttes' French catalogue texts).
KM_NUM = re.compile(r"(?<![\d.,])(\d{1,3}(?:[ ,.  ]\d{3})+|\d+)\s*(kilom[eè]tres|kilometers|kilometres|kms?|miles)\b"
                    r"(?!\s*/\s*h|\s*-?\s*h\b|\s+(par|per) heure)", re.I)
KM_ODO = re.compile(r"odometer|compteur|\bclock|kilom[ée]trage|mileage|totalis|km d'origine|km d’origine|"
                    r"kilom[eè]tres d'origine|from new|depuis l'origine|depuis neuf|certifi[ée]s|d'origine|d’origine", re.I)
KM_SHOWS = re.compile(r"affiche|display|shows|showing|reads|indique", re.I)
KM_NOW = re.compile(r"today|aujourd'hui|aujourd’hui|\bnow\b|d[ée]sormais|currently|actuellement|[àa] ce jour|"
                    r"au jour de la vente|to date", re.I)
KM_PAST = re.compile(r"\b(en|in|since|depuis) (19|20)\d\d\b|affichait|totalisait|indiquait|\balors\b|\bthen\b|"
                     r"[àa] (cette|l')[ ée]poque|remis [àa] (0|z[ée]ro)|\breset\b|\bwhen\b|\bhad\b|lorsque|\bquand\b|"
                     r"at the time", re.I)
KM_RESTO = re.compile(r"depuis (sa |la |leur )?(fin de (sa |la ))?(restauration|r[ée]fection|r[ée]vision)|"
                      r"apr[eè]s (sa |la )?restauration|since (its |the )?restor", re.I)
KM_BEFORE_BAD = re.compile(r"(\bat|\b[àa]|since|depuis|further|another|suppl[ée]mentaires|\bper|\baux|\bles|tous les|"
                           r"chaque|parcouru|parcourra|roul[ée]|covered|driven)\s+(environ |quelque |plus de |moins de |"
                           r"un peu plus de |à peine |seulement |more than |about |just |only )?$", re.I)
KM_AFTER_BAD = re.compile(r"\W{0,3}(since|depuis|after|apr[eè]s|ago|later|plus tard|par an|per year|a year|"
                          r"parcourus)\b", re.I)
# short highlight lines that state the mileage: "Seulement 42.000 km", "Moins de 11 800 km", "77 800 km certifiés"
KM_HIGHLIGHT = re.compile(r"^\d|\b(only|just|seulement|uniquement|moins de|less than|under|certifi|d'origine|d’origine|"
                          r"from new|au compteur|premi[eè]re main)\b", re.I)


def km_from(s, highlight, year):
    """Odometer in km from one sentence (number next to an odometer word) or, with highlight, from a short highlight
    line ("Seulement 42.000 km"); None. A sentence naming a year before the sale year - 1 describes the past ("un
    contrôle technique du 22 décembre 1987 présentant un kilométrage de ...") unless it also says "today"."""
    ms = [m for m in KM_NUM.finditer(s) if not KM_BEFORE_BAD.search(s[:m.start()])
          and not KM_AFTER_BAD.match(s[m.end():]) and not KM_RESTO.search(s[m.end():m.end() + 90])]
    if not ms: return None
    old = any(int(y) < year - 1 for y in re.findall(r"\b(19\d\d|20\d\d)\b", s))
    if (KM_PAST.search(s) or old) and not KM_NOW.search(s): return None
    if highlight:
        if len(s) > 90 or len(ms) != 1 or not KM_HIGHLIGHT.search(s): return None
        m = ms[0]
    else:
        cues = list(KM_ODO.finditer(s)) or (list(KM_SHOWS.finditer(s)) if KM_NOW.search(s) else [])
        near = [(min(abs(c.start() - m.end()), abs(m.start() - c.end())), i, m) for i, m in enumerate(ms) for c in cues]
        near = [t for t in near if t[0] <= 60]
        if not near: return None
        m = min(near)[2]
    n = int(re.sub(r"\D", "", m.group(1)))
    if n < 100 or n > 1500000: return None
    return round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100


def km_of(x):
    """Stated odometer in km, rounded to 100, or None. In this order: a sentence that ties the number to the odometer
    ("au compteur", "kilométrage", "km d'origine", "affiche aujourd'hui"; errata first, they give the reading on the
    sale day), then a quoted mileage in the title ("« 3 700 km »") or a short highlight line at the top of the text
    ("Moins de 11 800 km"). The French text first, then the English one (newer sales have the full text only in
    English). Readings below 100 km are not used."""
    year = int(((x.get("auction") or {}).get("start_date") or "2100")[:4])
    q = re.search(r"«([^»]*\bkm\b[^»]*)»", text(fr(x.get("title"))))
    for lang in ("fr", "en"):
        lines = lines_of({"description": {"fr": (x.get("description") or {}).get(lang) or ""}})
        errata = [l for l in lines if re.match(r"(erratum|errata|addendum|addenda|correction)", l, re.I)]
        head = []
        for l in lines:
            if len(l) > 160: break
            head.append(l)
        sentences = [s for l in errata + lines for s in re.split(r"(?<=[.;!?])\s+", l)]
        cands = [(s, False) for s in sentences] + ([(q.group(1), True)] if q and lang == "fr" else []) + \
                [(l, True) for l in head]
        for s, hl in cands:
            k = km_from(s.strip("«»“”‘’\"' -–"), hl, year)
            if k: return k
    return None


# ------------------------------------------------------------------------------------------------ sales
COUNTRY = [(r"bruxelles|brussels|autoworld|belgique|belgium|knokke|zoute", "BE"), (r"gen[eè]v|geneva|gstaad", "CH"),
           (r"monaco|monte[- ]carlo", "MC"), (r"luxembourg", "LU")]


def sale_info(a):
    loc = text(fr(a.get("auction_location")))
    name = text(fr(a.get("title")))
    cc = next((c for pat, c in COUNTRY if re.search(pat, "%s %s" % (loc, name), re.I)), "FR")
    return dict(code=a.get("sale_no") or "", name=name, type=a.get("type"), status=a.get("status"),
                start=a.get("start_date"), end=a.get("end_date"), place=loc, country=cc,
                sessions=[(d.get("start_date"), d.get("start_lot")) for d in a.get("dates") or [] if d.get("start_date")])


def lot_num(s):
    m = re.match(r"\d+", str(s or ""))
    return int(m.group(0)) if m else 0


def sale_day(s, lot):
    """Day the lot was sold: closing day of a timed sale; the session of a live sale whose first lot is the highest
    one not above this lot ("2026-11-12T13:30Z, from lot 190"); else the first day."""
    if s["type"] == "timed" and s.get("end"): return s["end"][:10]
    ses = sorted((lot_num(f), d) for d, f in s["sessions"] if f)
    day = s["start"][:10] if s.get("start") else None
    for first, d in ses:
        if first <= lot_num(lot): day = d[:10]
    return day


try:
    # -------------------------------------------------------------------------------------------- 1. lot lists
    past = search("completed")
    if past is None: sys.exit("Aguttes search failed")
    save(past, os.path.join(DIR, "search.json"))
    upcoming, up_p = load("upcoming.json", {})
    new_up = search("published")
    for u, x in (new_up or {}).items():
        if classify(title_of(x)): upcoming[u] = x
    save(upcoming, up_p)

    def wanted(x): return (x.get("auction") or {}).get("start_date", "")[:10] >= SINCE and classify(title_of(x))

    cands = {u: x for u, x in past.items() if wanted(x) and x.get("status") == "sold"}
    print(len(cands), "sold Porsche results since 2015 assigned to a variant;", len(upcoming), "upcoming lots kept",
          flush=True)

    # -------------------------------------------------------------------------------------------- 2. sale pages
    new_pages = 0

    def sale(auuid):
        """Sale details from the catalogue page, cached once the sale is completed. None if not fetched."""
        global new_pages
        p = os.path.join(DIR, "sales", "%s.json" % re.sub(r"[^0-9a-f-]", "", auuid))
        if os.path.exists(p):
            s = json.load(open(p))
            if s.get("status") == "completed": return s
        if LOT_PAGES is not None and new_pages >= LOT_PAGES: return None
        h = get("%s/catalogue/%s" % (BASE, auuid))
        new_pages += 1
        a = (page_props(h) or {}).get("auction")
        if not a: print("sale page", auuid, "failed", flush=True); return None
        s = sale_info(a)
        save(s, p)
        print("sale", s["code"], s["start"][:10] if s["start"] else "", s["name"][:60], s["country"], flush=True)
        return s

    auctions = sorted({x["auction_uuid"]: x["auction"].get("start_date", "") for x in cands.values()}.items(),
                      key=lambda a: a[1], reverse=True)
    sales = {}
    for au, _ in auctions:
        s = sale(au)
        if s: sales[au] = s

    # -------------------------------------------------------------------------------------------- 3. unsold lots
    unsold, check_stats = {}, Counter()
    for u, x in sorted(upcoming.items(), key=lambda i: i[1].get("auction", {}).get("start_date", "")):
        if u in past and past[u].get("status") == "sold": continue
        start = (x.get("auction") or {}).get("start_date", "")[:10]
        if not start or (TODAY - dt.date.fromisoformat(start)).days < CHECK_DAYS: continue
        p = os.path.join(DIR, "checked", "%s.json" % u)
        if not os.path.exists(p):
            if LOT_PAGES is not None and new_pages >= LOT_PAGES: continue
            s = sale(x["auction_uuid"])
            if not s or s.get("status") != "completed" or (TODAY - dt.date.fromisoformat(sale_day(s, x["lot_no"]))).days < CHECK_DAYS:
                continue
            h = get(BASE + x["href"])
            if h is None: continue
            new_pages += 1
            lot = (page_props(h) or {}).get("lot") or {}
            save(dict(status=lot.get("status") or ("gone" if h == "" else "no lot data"),
                      price=(lot.get("financeItem") or {}).get("hammer_bp_incl_vat")), p)
        c = json.load(open(p))
        check_stats[c["status"]] += 1
        if c["status"] == "unsold":
            s = sale(x["auction_uuid"])
            if s: sales[x["auction_uuid"]] = s; unsold[u] = x
    if check_stats: print("upcoming lots after their sale, lot page status:", dict(check_stats), flush=True)
except Blocked as e:
    sys.exit("Aguttes answered with a bot challenge (%s); stopped, nothing written." % e)


# ------------------------------------------------------------------------------------------------ 4. rows
def num(v):
    try: return float(v)
    except (TypeError, ValueError): return None


rows, skipped = [], Counter()
dup = Counter((x["auction_uuid"], hashlib.sha1(text(fr(x.get("description"))).encode()).hexdigest())
              for x in past.values() if len(text(fr(x.get("description")))) > 200)
for u, x, sold in [(u, x, True) for u, x in cands.items()] + [(u, x, False) for u, x in unsold.items()]:
    s = sales.get(x["auction_uuid"])
    if not s: skipped["sale page not fetched yet"] += 1; continue
    d = text(fr(x.get("description")))
    if len(d) > 200 and dup[(x["auction_uuid"], hashlib.sha1(d.encode()).hexdigest())] > 1:
        skipped["catalogue text copied onto another lot of the sale"] += 1
        continue
    date = sale_day(s, x["lot_no"])
    if not date or date < SINCE: continue
    amt = num((x.get("financeItem") or {}).get("hammer_bp_incl_vat")) or num(x.get("price"))
    if sold and not amt: skipped["sold, no price"] += 1; continue
    r = dict(id=u, code=s["code"] or x["auction_uuid"][:8], lot=str(x["lot_no"]), title=title_of(x), date=date,
             sold=sold, amt=int(round(amt)) if sold else None, cur="EUR", country=s["country"], chassis=chassis_of(x),
             km=km_of(x), url=BASE + x["href"], sale=s["name"])
    lo, hi = num(x.get("low")), num(x.get("high"))
    if not sold and lo and hi: r["est"] = [int(lo), int(hi), "EUR"]
    rows.append(r)
rows.sort(key=lambda r: (r["date"], r["code"], lot_num(r["lot"]), r["lot"]))
json.dump(rows, open(os.path.join(DIR, "aguttes.json"), "w"), ensure_ascii=False)
if skipped: print("left out:", dict(skipped), flush=True)
print(len(rows), "Aguttes results since 2015 (%d sold, %d not sold);" % (sum(r["sold"] for r in rows),
      sum(not r["sold"] for r in rows)), new_pages, "new pages", flush=True)

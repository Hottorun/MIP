"""Osenat results straight from Osenat: every Porsche car lot with price, sale date and chassis number.

usage: python3 -I osenatfetch.py WORK [--lot-pages N]

Osenat's website (osenat.com, built and hosted by Drouot's website service) has no JSON API and no structured lot
data; this script reads its plain HTML catalogue pages, the same ones a visitor sees.
1. Sale list: Osenat's sitemap of sale catalogues (sitemap-67-fr-sale.xml and the file it lists; 2 requests on every
   run). Car sales are picked by the words in their address ("automobiles", "motos", "voitures", "youngtimers",
   "Epoqu'auto", "canots", ...); sales of the other departments hold no Porsche cars, only toys, posters, design.
2. Porsche lots per sale: the sale catalogue with the site's own search box filled in
   (/catalogue/<sale>?search=porsche, 100 lots per page, one request per sale). The page header gives the sale name,
   day and place (an online sale over several days is dated by its last day, when the lots close); each lot card
   gives lot number, lot id, the first lines of the description (title, usually the chassis line), the result
   ("Résultat : 84 280 EUR"), whether results are shown "avec frais" (with buyer's premium) or "sans frais" (hammer
   price only), and the estimate. Cached in WORK/web/osenat/sales/<sale>.json; fetched again while the sale is
   upcoming or ended less than FRESH_DAYS ago (results are corrected and post-sale deals added after the sale).
   Sales before 2015 are kept with their header only and never fetched again. --lot-pages N stops after N new sale
   pages (for a first test run).
   The lot pages (/lot/...) are not used: Osenat's server answers this script there with "429 Too Many Requests" from
   the first request on (catalogue pages are served normally), so the full description is not read. Chassis numbers
   come from the lines the card shows; mileage is set only where those lines state it, which is rare.
Sold: the lot shows a result. Not sold: no result, the sale ended at least SETTLE_DAYS ago and the sale shows results
(asked once per sale with the catalogue's own "Vendu" filter; a sale without any published result is left out).
Price: from 2017 on Osenat shows results with buyer's premium ("Résultats avec frais"). Sales of 2015-2016 and some
online sales show only the hammer price ("Résultats sans frais"); for those the premium for cars that the sale's own
conditions state (/vente/<sale>, fetched once per such sale and kept as "terms" in the sale's cache file) is added:
"16,67 % HT (soit 20 % TTC) sur une tranche jusqu'à 350 000 euros et de 11 % HT (soit 13.20 % TTC) au-delà",
"Frais : 20%TTC pour les voitures". A hammer-price lot of a sale that states no premium for cars is left out (counted
in the notes the script prints).
Writes WORK/web/osenat/osenat.json in the format build.py reads for its HOUSES. Osenat's permission for this access
confirmed by the project owner on 13 November 2026. robots.txt excludes only /recherche/ (not used). One request
every 1.5 seconds. Stops if Osenat answers with a bot challenge or keeps answering 429.
"""
import datetime as dt, gzip, html, json, os, re, sys, time, unicodedata, urllib.error, urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.osenat.com"
DELAY = 1.5
SINCE = "2015-01-01"
FRESH_DAYS = 90    # sales that ended more recently than this are fetched again
SETTLE_DAYS = 3    # a lot without a result counts as unsold only this long after the sale
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "osenat")
os.makedirs(os.path.join(DIR, "sales"), exist_ok=True)
TODAY = dt.date.today()
MONTHS = {m: i + 1 for i, m in enumerate(["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout",
                                          "septembre", "octobre", "novembre", "decembre"])}
CAR_SALE = re.compile(r"automobiles?\b|\bauto\b|motos?\b|voitures?|vehicul|epoqu|youngtimer|canots?|porsche|garage|"
                      r"collector|mobilit", re.I)
CHALLENGE = re.compile(r"cf-chl|challenge-platform|Just a moment\.\.\.|_Incapsula_|akamai-bm|px-captcha|captcha-delivery|"
                       r"Attention Required|Access Denied|g-recaptcha|hcaptcha", re.I)


class Blocked(Exception): pass


def get(url):
    """Response body as text. None after three failed tries, "" for a missing page. Raises Blocked on a bot challenge
    or when Osenat keeps answering "429 Too Many Requests" after waiting as long as it asks (Retry-After, at least a
    minute)."""
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip", "Accept-Language": "fr"})
    k = throttled = 0
    while k < 3:
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
            if e.code in (403, 429, 503) and (CHALLENGE.search(t) or re.search(r"captcha|blocked|denied", t, re.I)): raise Blocked(url)
            if e.code in (404, 410): return ""
            if e.code == 429:
                throttled += 1
                if throttled > 3: raise Blocked("%s: still HTTP 429 after %d pauses" % (url, throttled - 1))
                ra = e.headers.get("Retry-After") or ""
                wait = max(60, int(ra) if ra.isdigit() else 0) * throttled
                print("HTTP 429 (too many requests) on", url, "- pausing %d s" % wait, flush=True)
                time.sleep(wait)
                continue
            print("retry", url, e.code, flush=True)
        except Blocked:
            raise
        except Exception as e:
            print("retry", url, e, flush=True)
        k += 1
        time.sleep(10 * k)
    return None


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def text(h):
    """HTML -> text with line breaks kept."""
    t = re.sub(r"<br\s*/?>|</p>|</div>|</li>", "\n", h or "", flags=re.I)
    t = html.unescape(re.sub(r"<[^>]+>", " ", t)).replace("\xa0", " ").replace(" ", " ")
    return "\n".join(re.sub(r"[ \t]+", " ", l).strip() for l in t.split("\n")).strip()


def flat(h): return re.sub(r"\s+", " ", text(h)).strip()


def ascii_low(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()


def sale_day(when, name=""):
    """Sale day from the catalogue header: "lundi 29 juin 2026 14:00" -> 2026-06-29; a sale over several days
    ("Du 23 au 26 Janvier 2022", online sales where every lot closes at the end) -> its last day. A header without
    the year takes it from the sale name."""
    s = ascii_low(when)
    days = re.findall(r"\b(\d{1,2})(?:er)?\s+(" + "|".join(MONTHS) + r")\b(?:\s+(\d{4}))?", s)
    if not days:
        m = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", s)
        return "%s-%02d-%02d" % (m.group(3), int(m.group(2)), int(m.group(1))) if m else None
    d, mon, y = days[-1]
    y = y or next((x for _, _, x in days if x), "") or (re.findall(r"\b(20\d\d)\b", name) or [""])[-1]
    if not y: return None
    return "%s-%02d-%02d" % (y, MONTHS[mon], int(d))


def with_premium(hammer, terms):
    """Hammer price + the buyer's premium the sale's own conditions state for cars, or None if they state none that is
    clearly the one for cars. "une commission d'achat de 16,67 % HT (soit 20 % TTC) sur une tranche jusqu'à 350 000
    euros et de 11 % HT (soit 13.20 % TTC) à partir de 350000 euros" (rates for automobilia or motorcycles, and the
    surcharge for live online bidding, are not used); "Frais : 20%TTC pour les voitures mais 24 % TTC moto et
    automobilia" -> 20 %."""
    t = ascii_low(flat(terms).replace("’", "'")).replace(",", ".")
    tranche = re.compile(r"\(soit\s*(\d{1,2}(?:\.\d+)?)\s*%\s*t\.?t\.?c\.?\)\s*sur une tranche jusqu'?\s*a\s*(\d[\d .]*)\s*(?:euros|eur|€)"
                         r"\s*et de [^()]{0,40}\(soit\s*(\d{1,2}(?:\.\d+)?)\s*%\s*t\.?t\.?c")
    for m in tranche.finditer(t):
        if re.search(r"automobilia|moto|bijou|montre|\bvins?\b", t[max(0, m.start() - 120):m.start()]): continue
        r1, cap, r2 = float(m.group(1)), int(re.sub(r"\D", "", m.group(2))), float(m.group(3))
        return int(round(hammer + min(hammer, cap) * r1 / 100 + max(0, hammer - cap) * r2 / 100))
    found = [(float(m.group(1)), t[m.end():m.end() + 40]) for m in re.finditer(r"(\d{1,2}(?:\.\d{1,2})?)\s*%\s*t\.?t\.?c", t)]
    found = [(r, after) for r, after in found if 10 <= r <= 35]
    cars = {r for r, after in found if re.match(r"\W*(pour les |sur les )?(voitures|automobiles|vehicules)", after)}
    return int(round(hammer * (1 + cars.pop() / 100))) if len(cars) == 1 else None


def amount(s):
    """"Résultat : 84 280 EUR" -> 84280"""
    m = re.search(r"(\d[\d .   ]*)\s*(?:EUR|€)", s or "")
    return int(re.sub(r"\D", "", m.group(1))) if m else None


YEAR_PORSCHE = re.compile(r"\b(19[4-9]\d|20[0-3]\d)\b.*\bporsche\b|\bporsche\b.*\b(19[4-9]\d|20[0-3]\d)\b", re.I)
HEADER_LINE = re.compile(r"^\s*[•\-–]|ch[aâ]ssis|num[ée]ro|n°|carte grise|titre de|immatricul|sans r[ée]serve|moteur|"
                         r"\bvin\b|s[ée]rie", re.I)


def head_of(desc):
    """The car's name from the top of the description; where the first line is only "1961 PORSCHE" (or "2000",
    "PORSCHE") the next lines are added until a header line (chassis, registration ...) starts:
    "1961 PORSCHE / 356 ROADSTER / Châssis: 89023" -> "1961 PORSCHE 356 ROADSTER"; "Type : 911 2L S" -> "911 2L S"."""
    lines = [l.strip() for l in (desc or "").split("\n") if l.strip()]
    if not lines: return ""
    t = lines[0]
    for l in lines[1:4]:
        if not re.fullmatch(r"((19|20)\d\d)?\s*(porsche)?", t, re.I) or HEADER_LINE.search(l): break
        t += " " + re.sub(r"^\s*type\s*:?\s*", "", l, flags=re.I)
    return t


try:
    # ------------------------------------------------------------------------------------------------ 1. sale list
    idx = get(BASE + "/sitemap-67-fr-sale.xml")
    if not idx: sys.exit("Osenat sale sitemap failed")
    cands = {}
    for sm in re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", idx):
        x = get(html.unescape(sm))
        if x is None: sys.exit("Osenat sale sitemap %s failed" % sm)
        for sid, slug in re.findall(r"<loc>\s*https?://www\.osenat\.com/catalogue/(\d+)-([^<\s]*)\s*</loc>", x):
            if CAR_SALE.search(slug.replace("-", " ").replace("autograph", "")): cands[sid] = slug
    print(len(cands), "car sales in the sitemap", flush=True)

    # ------------------------------------------------------------------------------------------------ 2. sale pages
    def parse_sale(h):
        hd = lambda k: flat((re.search(r'class="%s">(.*?)</(?:div|h1)>' % k, h, re.S) or [None, ""])[1])
        info = (re.search(r'<div id="description-modal".*?<div class="modal-body">(.*?)</div>\s*</div>\s*</div>', h, re.S) or [None, ""])[1]
        cards = []
        for c in re.split(r'<div class="ordre_\w+ product', h)[1:]:
            u = re.search(r'href="(/lot/(\d+)/(\d+)-[^"]*)"', c)
            if not u: continue
            res = re.search(r'class="sale-flash">(.*?)</div>', c, re.S)
            est = re.search(r'class="estimAff4">(.*?)</div>', c, re.S)
            cards.append(dict(id=u.group(3), url=u.group(1), lot=flat((re.search(r"class='lotnum'>(.*?)</span>", c, re.S) or [None, ""])[1]),
                              text=text((re.search(r'id="lotDesc-\d+">(.*?)</h2>', c, re.S) or [None, ""])[1]),
                              result=flat(res.group(1)) if res else "", est=flat(est.group(1)) if est else "",
                              fees=flat((re.search(r'class="explicationResultats">(.*?)</div>', c, re.S) or [None, ""])[1])))
        total = re.search(r"Lots? \d+ à \d+ sur (\d+)", h)
        return dict(name=hd("nom_vente"), when=hd("date_vente"), place=hd("lieu_vente"), info=flat(info)[:6000],
                    cards=cards, total=int(total.group(1)) if total else len(cards))

    def fetch_sale(sid):
        """Header and Porsche lot cards of a sale; None if a page failed."""
        out, off = None, 0
        while True:
            h = get("%s/catalogue/%s?lang=fr&search=porsche&offset=%d&max=100" % (BASE, sid, off))
            if h is None: return None
            if not h: return dict(name="", when="", place="", info="", cards=[], total=0, missing=True)
            s = parse_sale(h)
            if out is None: out = s
            else: out["cards"] += s["cards"]
            off += 100
            if off >= s["total"] or not s["cards"]: return out

    sales, new_sales = {}, 0
    for sid in sorted(cands, key=int, reverse=True):
        p = os.path.join(DIR, "sales", "%s.json" % sid)
        s = json.load(open(p)) if os.path.exists(p) else None
        if s is not None:
            day = s.get("date")
            if s.get("missing") or not day or day < SINCE or (TODAY - dt.date.fromisoformat(day)).days >= FRESH_DAYS:
                sales[sid] = s
                continue
        if LOT_PAGES is not None and new_sales >= LOT_PAGES: continue
        s = fetch_sale(sid)
        if s is None: print("sale", sid, "failed", flush=True); continue
        s["date"] = sale_day(s["when"], s["name"])
        s["fetched"] = TODAY.isoformat()
        if s["date"] and s["date"] < SINCE: s["cards"] = []   # not needed; header kept so it is not fetched again
        save(s, p); sales[sid] = s; new_sales += 1
        print("sale", sid, s["date"], s["name"][:60], "|", len(s["cards"]), "Porsche matches", flush=True)
    # online sales whose header has no year ("du vendredi 22 au lundi 25 avril"): the year of the sale with the
    # nearest id (Drouot numbers sales in order), checked against the weekday where the header names one
    dated = sorted((int(k), v["date"]) for k, v in sales.items() if v.get("date"))
    for sid, s in sales.items():
        if s.get("date") or s.get("missing") or not dated: continue
        near = min(dated, key=lambda x: abs(x[0] - int(sid)))
        if abs(near[0] - int(sid)) > 3000: continue
        y0 = int(near[1][:4])
        wd = re.findall(r"\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d", ascii_low(s["when"]))
        for y in (y0, y0 - 1, y0 + 1):
            d = sale_day(s["when"], str(y))
            if d and (not wd or dt.date.fromisoformat(d).weekday() == ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"].index(wd[-1])):
                s["date"] = d; save(s, os.path.join(DIR, "sales", "%s.json" % sid)); break
    no_date = [sid for sid, s in sales.items() if not s.get("date") and not s.get("missing")]
    if no_date: print("note: no sale day read for", no_date, flush=True)

    # a sale where no Porsche lot shows a result: does it show results at all (the site's own "Vendu" filter)?
    # Otherwise its lots are unknown, not unsold. Asked once per sale, after the sale.
    for sid, s in sales.items():
        if (not s.get("date") or s["date"] < SINCE or "published" in s or not s["cards"]
                or (TODAY - dt.date.fromisoformat(s["date"])).days < SETTLE_DAYS): continue
        if any(amount(c["result"]) for c in s["cards"]): s["published"] = True
        else:
            h = get("%s/catalogue/%s?lang=fr&search=&sold=true&offset=0&max=10" % (BASE, sid))
            if h is None: continue
            s["published"] = bool(re.search(r'class="sale-flash">\s*R[ée]sultat', h))
        save(s, os.path.join(DIR, "sales", "%s.json" % sid))
    # sales that show hammer prices only ("Résultats sans frais"): their conditions of sale (/vente/<sale>), once
    for sid, s in sales.items():
        if (not s.get("date") or s["date"] < SINCE or "terms" in s
                or not any(amount(c["result"]) and re.search(r"sans frais", c["fees"], re.I) for c in s["cards"])): continue
        h = get("%s/vente/%s" % (BASE, sid))
        if h is None: continue
        t = flat(re.sub(r"<script.*?</script>|<style.*?</style>", " ", h, flags=re.S))
        i = [m.start() for m in re.finditer(r"commission|frais", t, re.I)]
        s["terms"] = s.get("info", "") + " " + (t[max(0, i[0] - 200):i[0] + 3000] if i else "")
        save(s, os.path.join(DIR, "sales", "%s.json" % sid))
except Blocked as e:
    sys.exit("Osenat answered with a bot challenge or refused the requests (%s); stopped, not retrying" % e)


# ---------------------------------------------------------------------------------------------------- 4. rows
def title_of(line):
    """The car's name from the top of the description in a form classify() reads: "<year> Porsche <model>". Osenat's
    lines are mostly like this already ("1972 PORSCHE 911 2.4 E « TRAPPE À HUILE »", "1991 Porsche 944 S2"). Cuts
    "sans réserve", "carte grise ..." and chassis numbers run into the line; drops the quote marks but keeps the
    words (« RECRÉATION », "Backdated" must still reach classify()); translates the French words classify() rejects
    on (réplica, recréation, modifiée, préparée, course, tracteur, miniature ...); writes decimal commas and litres as
    classify() expects ("3,2L" -> "3.2", "2 litres" -> "2.0", "GT 3" -> "GT3", "VW-Porsche" -> "Porsche",
    "par" -> "by"); puts the 911 model letter before the displacement ("911 2.4 E" -> "911 E 2.4"); names the 930 a
    "911 Turbo"; and puts a trailing year in front ("Porsche 911 Carrera 2.7 de 1974" -> "1974 Porsche 911 Carrera
    2.7")."""
    t = re.split(r"\s*(?:[-–•,]\s*)?(?:ch[aâ]ssis|num[ée]ro|n°|carte grise|titre de circulation|moteur n|sans r[ée]serve|"
                 r"no reserve|immatricul|[àa] immatriculer)", line, flags=re.I)[0]
    t = re.sub(r"[«»“”\"]|''", " ", t)
    for fr, en in (("r[ée]plique|r[ée]plica", "replica"), ("recr[ée]ation", "recreation"), ("modifi[ée]e?s?", "modified"),
                   ("pr[ée]par[ée]e?", "prepared"), ("course", "race car"), ("tracteur", "tractor"), ("jouet|miniature", "model"),
                   ("projet", "project"), ("[ée]lectrique", "electric")):
        t = re.sub(r"\b(?:%s)\b" % fr, en, t, flags=re.I)
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)
    t = re.sub(r"\b(\d\.\d)\s?(?:L(?=\b|[A-Z])|litres?\b)", r"\1 ", t, flags=re.I)
    t = re.sub(r"(?<![\d.])([1-6])\s?(?:L|litres?)\b", r"\1.0", t, flags=re.I)
    t = re.sub(r"\bGT ([234])\b", r"GT\1", t)
    t = re.sub(r"\b(VW|Volkswagen)[- ]Porsche\b", "Porsche", t, flags=re.I)
    t = re.sub(r"\s+", " ", t)
    t = re.sub(r"\b911 (\d\.\d) ?([TESL])\b", r"911 \2 \1", t)
    t = re.sub(r"\b930 (Turbo\b|(?=3\.[03]\b))", r"911 Turbo ", t, flags=re.I)   # type number: "930 Turbo", "930 3.3"
    t = re.sub(r" par ", " by ", t)
    t = re.sub(r"\s+", " ", t).strip(" -–,;:.")
    if not re.match(r"(19|20)\d\d\s+Porsche\b", t, re.I):
        m = re.search(r"\bPorsche\b(.*?)[\s,(–-]+(?:de\s+|from\s+)?((?:19|20)\d\d)\)?$", t, re.I)
        if m: t = "%s Porsche%s" % (m.group(2), m.group(1).rstrip())
    return re.sub(r"\bPORSCHE\b", "Porsche", t)


CHASSIS = re.compile(r"(?:ch[aâ]ssis|num[ée]ro de s[ée]rie|n°\s*de\s*s[ée]rie|s[ée]rie\s*(?:n°|num[ée]ro)|\bvin\b|"
                     r"chassis number|serial number)\s*(?:n°|n[º°o]\.?|no\.?|number|#)?\s*[:.]?\s*([A-Z0-9][A-Z0-9 ./-]{3,30})", re.I)


def chassis_of(card):
    """"Numéro de châssis : 9112200657" -> "9112200657", from the first lines of the description the lot card shows.
    The card cuts the text with "...": a number at the cut is used only if it is a complete 17-character VIN."""
    lines = card.split("\n")
    for i, line in enumerate(lines[:12]):
        m = CHASSIS.search(line)
        if m:
            v = re.match(r"[A-Z0-9./-]+(?:\s\d{3}\b(?![./-]))*", m.group(1), re.I).group(0)   # "114 607", not "... Très"
            cut = i == len(lines) - 1 and re.search(r"(\.\.\.|…)\s*$", line) and re.fullmatch(r"[\s.…]*", line[m.start(1) + len(v):])
            v = v.strip(" .;,:-/")
            if cut and not re.fullmatch(r"[A-Z0-9]{17}", v, re.I): return ""
            if re.search(r"\d", v) and len(re.sub(r"\W", "", v)) >= 4: return v
    return ""


# Mileage: only the odometer reading as stated now, not distances since a restoration or service.
KM_NUM = re.compile(r"(?<![\d.,])(\d{1,3}(?:[ ,.  ]\d{3})+|\d+)\s*(kilom[eè]tres|kilometers|kilometres|kms?|miles)\b"
                    r"(?!\s*/\s*h|\s*-?\s*h\b|\s+(par|per) heure)", re.I)
KM_ODO = re.compile(r"odometer|compteur|kilom[ée]trage|mileage|totalis|affich|indique|au compteur|km d'origine|"
                    r"kilom[eè]tres d'origine|from new|depuis l'origine|depuis neuf|d'origine|showing|displays|reads", re.I)
KM_PAST = re.compile(r"\b(en|in|since|depuis) (19|20)\d\d\b|affichait|totalisait|indiquait|\balors\b|\bthen\b|"
                     r"at (the|this|that) time|[àa] (cette|l')[ ée]poque|lors de|when (it|the|he|she)\b|"
                     r"remis [àa] (0|z[ée]ro)|\breset\b", re.I)
KM_NOW = re.compile(r"aujourd'hui|today|\bnow\b|d[ée]sormais|currently|actuellement|[àa] ce jour", re.I)
KM_RESTO = re.compile(r"depuis (sa |la |leur |son )?(fin de (sa |la ))?(restauration|r[ée]fection|r[ée]vision|remise)|"
                      r"apr[eè]s (sa |la )?(restauration|r[ée]fection)|since (its |the )?(restor|rebuild|overhaul)|"
                      r"moteur|engine|bo[iî]te|gearbox", re.I)
KM_BEFORE_BAD = re.compile(r"(\bat|\b[àa]|since|depuis|further|another|suppl[ée]mentaires|\bper|\baux|\bles|parcouru|"
                           r"effectu[ée]s?|vidange|entretien|r[ée]vision)\s+(environ |plus de |more than |about |some |quelque )?$", re.I)
KM_AFTER_BAD = re.compile(r"\W{0,3}(since|depuis|after|apr[eè]s|ago|later|plus tard|par an|per year|a year|de course|"
                          r"en course|parcourus? depuis)\b", re.I)


def km_of(desc):
    """Stated odometer in km rounded to 100, or None: a number with km/miles next to an odometer word ("compteur",
    "kilométrage", "affiche", "km d'origine", "odometer", "showing") or a header line that is only the mileage
    ("• 45 000 km d'origine", "- 82 000 km"). Distances since a restoration, engine rebuild or service, readings from
    the car's past and readings under 100 km (reset at a restoration) are not used."""
    for i, line in enumerate(desc.split("\n")):
        head = i < 12 and len(line) <= 60 and re.match(r"\s*[•\-–]", line)
        for s in re.split(r"(?<=[.;!?])\s+", line):
            s = s.strip(" •-–")
            ms = [m for m in KM_NUM.finditer(s) if not KM_BEFORE_BAD.search(s[:m.start()]) and not KM_AFTER_BAD.match(s[m.end():])
                  and not KM_RESTO.search(s[max(0, m.start() - 60):m.end() + 60])]
            if not ms: continue
            if KM_PAST.search(s) and not KM_NOW.search(s): continue
            if head and len(ms) == 1: m = ms[0]
            else:
                cues = list(KM_ODO.finditer(s))
                near = sorted((min(abs(c.start() - m.end()), abs(m.start() - c.end())), i, m) for i, m in enumerate(ms) for c in cues)
                near = [x for x in near if x[0] <= 50]
                if not near: continue
                m = near[0][2]
            n = int(re.sub(r"\D", "", m.group(1)))
            if n < 100 or n > 1500000: continue
            return round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100
    return None


def est_of(s):
    m = re.match(r"\s*(\d[\d  ]*)\s*-\s*(\d[\d  ]*)\s*EUR", s or "")
    return [int(re.sub(r"\D", "", m.group(1))), int(re.sub(r"\D", "", m.group(2))), "EUR"] if m else None


out, skipped, unclassified = [], Counter(), []
for sid, s in sales.items():
    if not s.get("date") or s["date"] < SINCE or s["date"] > TODAY.isoformat(): continue
    over = (TODAY - dt.date.fromisoformat(s["date"])).days >= SETTLE_DAYS
    place = ascii_low(s.get("place") or "")
    country = "MC" if "monaco" in place else "BE" if re.search(r"belgi|bruxelles", place) else "CH" if re.search(r"suisse|gen[eè]ve", place) else "FR"
    for c in s["cards"]:
        desc = re.sub(r"\s*(\.\.\.|…)$", "", c["text"])   # the card shows the description's first lines, cut with "..."
        line = head_of(desc)
        if not YEAR_PORSCHE.search(line): continue                   # automobilia, models, other makes
        title = title_of(line)
        if not classify(title):
            unclassified.append(title)
            continue
        amt = amount(c["result"])
        if amt:
            sold = True
            if re.search(r"sans frais", c["fees"], re.I):
                amt = with_premium(amt, s.get("terms") or s.get("info"))
                if not amt: skipped["sold, hammer price only (premium not stated)"] += 1; continue
                skipped["sold, hammer price + premium from the sale's conditions"] += 1   # counted, kept
        else:
            if not over or not s.get("published"): skipped["no result shown yet"] += 1; continue
            sold, amt = False, None
        row = dict(id=c["id"], code=sid, lot=c["lot"], title=title, date=s["date"], sold=sold, amt=amt, cur="EUR",
                   country=country, chassis=chassis_of(c["text"]), km=km_of(desc), url=BASE + c["url"],
                   sale=re.sub(r"\s+", " ", s["name"]).strip())
        e = est_of(c["est"])
        if not sold and e: row["est"] = e
        out.append(row)
out.sort(key=lambda r: (r["date"], r["code"], int(re.sub(r"\D", "", r["lot"]) or 0)))
json.dump(out, open(os.path.join(DIR, "osenat.json"), "w"), ensure_ascii=False)
if skipped: print("notes:", ", ".join("%d %s" % (n, k) for k, n in sorted(skipped.items())), flush=True)
if unclassified: print(len(unclassified), "Porsche lots not assigned to a variant, e.g.", unclassified[:12], flush=True)
waiting = sum(1 for s in sales.values() if not s.get("date") and not s.get("missing")) + sum(1 for sid in cands if sid not in sales)
if waiting: print("note:", waiting, "sales not fetched or without a sale day", flush=True)
print(len(out), "Osenat results since 2015 (%d sold, %d not sold);" % (sum(o["sold"] for o in out), sum(not o["sold"] for o in out)),
      new_sales, "sale pages fetched", flush=True)

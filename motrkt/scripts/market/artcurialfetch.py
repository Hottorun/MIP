"""Artcurial Motorcars results straight from Artcurial: every Porsche lot with price, sale date, chassis number and mileage.

usage: python3 -I artcurialfetch.py WORK [--lot-pages N]

Artcurial's site loads its data from a JSON API (https://www.artcurial.com/ace); this script reads the same API.
1. Sale list: past Motorcars sales (GET /ace/sales/results, specialty VOIT), 50 sales per request, about 2 requests on
   every run. Sale date and country come from the sale's sessions (vacations); one sale can have several days.
2. Lots: for each sale since 2015, the sale's lots matching "Porsche" (GET /ace/sales/<ref>/items with the site's own
   full-text filter), 40 lots per request. The lot list already holds title, chassis number, description, hammer price
   and price with buyer's premium, so no lot pages are fetched. Cached in WORK/web/artcurial/lots/<ref>.json; sales
   that ended in the last 90 days are fetched again (Artcurial records post-sale deals as sold a few days later).
   --lot-pages N stops after N new sale lot lists (for a first test run).
   Artcurial publishes only sold lots: lots that did not sell are removed from the sale (the item endpoint answers 204),
   so every row here is sold. The price is Artcurial's own price with premium (finalPrice); the few sold lots without
   one (missing, or equal to the hammer price) are skipped. A page the API cannot serve (HTTP 500 on one broken lot)
   is fetched again in smaller pages so that only the broken lot is lost.
3. Chassis number from the lot's chassis field or the description header ("Châssis n° ..."); mileage only where the
   description states the current odometer reading ("odometer", "compteur", "kilométrage", "km d'origine", a highlight like
   "- Only 21,525km"), in km rounded to 100.
Writes WORK/web/artcurial/artcurial.json, which build.py reads. robots.txt excludes the /motorcars pages; Artcurial's
permission for this access confirmed by the project owner on 11 November 2026. One request every 1.5 seconds.
"""
import datetime, gzip, html, json, os, re, sys, time, urllib.error, urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
BASE = "https://www.artcurial.com"
API = BASE + "/ace"
DELAY = 1.5
PAGE = 40          # larger pages are refused when they hold a broken lot; 40 keeps the fallback cheap
FRESH_DAYS = 90    # sales that ended more recently than this are fetched again
W = sys.argv[1]
LOT_PAGES = int(sys.argv[sys.argv.index("--lot-pages") + 1]) if "--lot-pages" in sys.argv else None
DIR = os.path.join(W, "web", "artcurial")
os.makedirs(os.path.join(DIR, "lots"), exist_ok=True)
PORSCHE = "?filter=or(fts,fts,Porsche::descriptions.fts,fts,Porsche)"
BROKEN = "broken"


def get(url):
    """Parsed JSON; {} for no content / missing; None after three failed tries; BROKEN for an HTTP 500 that comes back
    on the retry (the API cannot serialise one of the lots; this does not go away). Stops on anything that is not JSON
    (bot challenge)."""
    time.sleep(DELAY)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json", "Accept-Encoding": "gzip"})
    for k in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                if r.headers.get("Content-Encoding") == "gzip": b = gzip.decompress(b)
                if r.status == 204 or not b: return {}
                if "json" not in (r.headers.get("Content-Type") or ""):
                    sys.exit("Artcurial answered %s with %s instead of JSON (bot challenge?); stopping, not retrying"
                             % (url, r.headers.get("Content-Type")))
                return json.loads(b.decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            if e.code in (404, 410): return {}
            if e.code in (403, 429) and "json" not in (e.headers.get("Content-Type") or ""):
                sys.exit("Artcurial answered %s with HTTP %d (bot protection?); stopping, not retrying" % (url, e.code))
            print("retry", url, e.code, flush=True)
            if e.code == 500 and k >= 1: return BROKEN
        except Exception as e:
            print("retry", url, e, flush=True)
        time.sleep(10 * (k + 1))
    return None


def save(obj, p): json.dump(obj, open(p, "w"), ensure_ascii=False)


def text(h): return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h or ""))).strip()


# ------------------------------------------------------------------------------------------------ 1. sale list
sales, page = {}, 0
while True:
    d = get("%s/sales/results?filter=specialties.specialty.ref,MTCA,VOIT&page=%d&size=50" % (API, page))
    if not isinstance(d, dict) or not d: sys.exit("Artcurial sale list failed on page %d" % page)
    for s in d["content"]: sales[s["ref"]] = s
    print("sale list page", page + 1, "of", d["totalPages"], len(sales), "sales", flush=True)
    page += 1
    if page >= d["totalPages"] or not d["content"]: break
if len(sales) < d["totalElements"]:
    print("note:", d["totalElements"] - len(sales), "of", d["totalElements"], "sales not returned (unpublished)", flush=True)


def sessions(s):
    """vacationRef -> (date, ISO-2 country) for each day of a sale."""
    out = {}
    for v in s.get("vacations") or []:
        day = ((v.get("validity") or {}).get("beginDate") or "")[:10]
        cc = (((v.get("address") or {}).get("country") or {}).get("alphaTwo") or "").upper()
        if day: out[v["ref"]] = (day, cc)
    return out


today = datetime.date.today()
todo = []
for ref, s in sales.items():
    ses = sessions(s)
    first = min([d for d, _ in ses.values()] or [(s.get("validity") or {}).get("beginDate", "")[:10]])
    last = max([d for d, _ in ses.values()] or [first])
    if not first or first < "2015-01-01" or s.get("status") != "FINISHED": continue
    todo.append((first, last, ref, s, ses))
todo.sort(reverse=True)
print(len(todo), "Motorcars sales since 2015", flush=True)


# ------------------------------------------------------------------------------------------------ 2. lots
def fetch_lots(ref):
    """All lots of a sale that match "Porsche". A page refused with HTTP 500 is fetched again as 5 pages of 8, then
    single lots, so only the broken lot is lost. None if a page could not be fetched (not cached, tried again on the
    next run)."""
    url = "%s/sales/%s/items%s&page=%%d&size=%%d" % (API, ref, PORSCHE)
    lots, broken, total, failed = [], [], [], []

    def rng(page, size):
        d = get(url % (page, size))
        if d is None: failed.append(page); return
        if d is BROKEN:
            if size == 1: broken.append(page); return
            step = 8 if size > 8 else 1
            for k in range(size // step): rng(page * (size // step) + k, step)
            return
        lots.extend(d.get("content") or [])
        total.append(d.get("totalElements") or 0)

    rng(0, PAGE)
    if not total or failed: return None, broken
    page = 1
    while page * PAGE < max(total) and not failed:
        rng(page, PAGE); page += 1
    return (None if failed else lots), broken


new_lists, missing = 0, 0
for first, last, ref, s, ses in todo:
    p = os.path.join(DIR, "lots", "%s.json" % ref)
    fresh = (today - datetime.date.fromisoformat(last)).days < FRESH_DAYS
    if os.path.exists(p) and not fresh: continue
    if LOT_PAGES is not None and new_lists >= LOT_PAGES:
        missing += not os.path.exists(p)
        continue
    lots, broken = fetch_lots(ref)
    if lots is None: print("sale", ref, "lot list failed", flush=True); continue
    save(dict(lots=lots, broken=broken), p); new_lists += 1
    print("sale", ref, first, len(lots), "Porsche lots", ("broken offsets %s" % broken) if broken else "", flush=True)


# ------------------------------------------------------------------------------------------------ 3. rows
YEAR_MAKE = re.compile(r"\b(18|19|20)\d\d\s+\S")
# where catalogue header lines run into the title in older sales ("... Cabriolet No reserve Titre de circulation
# monégasqueChâssis n° WPO...")
TITLE_END = re.compile(r"\s*(?:titre de circulation|carte grise|ch[aâ]ssis\s*n|chassis\s*no|moteur\s*n|engine\s*no|"
                       r"french title|\n\s*-|\s-\s(?=[A-Z]))", re.I)


def title_of(e):
    """Lot title in a form classify() reads: "<year> Porsche <model>". Artcurial titles are mostly already like this
    ("1973 Porsche 911 2.4 E Targa  No reserve", French or English). Older sales sometimes have only "No reserve" as
    the title and the car in shortDescription or manufacturer. Drops "No reserve" and catalogue header text, writes
    decimal commas, litres and French "par" as classify() expects ("3,2L" -> "3.2", "2L" -> "2.0", "GT 3" -> "GT3",
    "VW-Porsche" -> "Porsche", "par" -> "by") and puts the 911 model letter before the displacement
    ("911 2.4 S Targa" -> "911 S 2.4 Targa")."""
    t = ""
    for f in ("titleWithHtml", "manufacturer", "shortDescription"):
        c = html.unescape(re.sub(r"<[^>]+>", "\n", e.get(f) or ""))
        c = TITLE_END.split(c)[0]
        c = re.sub(r"[-\s]*\b(no reserve|sans (prix de )?r[ée]serve)\b[-\s]*", " ", c, flags=re.I)
        c = re.sub(r"\s+", " ", c).strip(" -–")
        if YEAR_MAKE.search(c): t = c; break
        t = t or c
    t = re.sub(r"(\d),(\d)", r"\1.\2", t)
    t = re.sub(r"\b(\d\.\d)\s?L\b", r"\1", t)
    t = re.sub(r"(?<![\d.])([1-6])\s?L\b", r"\1.0", t)  # "911 2L T", "Turbo 3 L"; not "911 L"
    t = re.sub(r"\bGT ([23])\b", r"GT\1", t)
    t = re.sub(r"\b(VW|Volkswagen)[- ]Porsche\b", "Porsche", t, flags=re.I)
    t = re.sub(r"\b911 (\d\.\d) ([TESL])\b", r"911 \2 \1", t)
    t = re.sub(r" par ", " by ", t)  # "356 B GT par Hedonic": classify() rejects coachbuilt/tuned cars by " by "
    if not re.search(r"\b(19|20)\d\d\s+Porsche\b", t, re.I):
        m = re.search(r"\bPorsche\b(.*?)[\s,(–-]+((?:19|20)\d\d)\)?$", t, re.I)
        if m: t = "%s Porsche%s" % (m.group(2), m.group(1).rstrip())
    return re.sub(r"\bPORSCHE\b", "Porsche", t)


CHASSIS = re.compile(r"\s*(?:ch[aâ]ssis|frame|n°\s*de\s*s[ée]rie|vin)\s*(?:no\.?|n°|n[º°o]\.?|number|#)?\s*[:.]?\s*(\S.*)",
                     re.I)


def chassis_of(e):
    """"Chassis No. 307344S\\nEngine No. 961292" -> "307344S". Older sales have no chassisNumber field; there it is
    one of the header lines at the top of the description ("Titre de circulation italien<br/>Châssis n° 121542")."""
    raw = html.unescape(re.sub(r"<[^>]+>", "\n", e.get("chassisNumber") or ""))
    head = html.unescape(re.sub(r"<[^>]+>", "\n", (e.get("descriptionWithHtml") or "")[:800]))
    head = "\n".join(l for l in head.split("\n") if not l.strip().startswith("-"))[:400]
    for line in raw.split("\n") + head.split("\n"):
        m = CHASSIS.match(line)
        if m:
            # cut at what follows the number on the same line ("WPOCA2996SS343393- Boîte manuelle")
            v = re.split(r"\s*(?:[-–]\s|moteur|engine|bo[iî]te|gearbox)", m.group(1), flags=re.I)[0]
            return re.sub(r"\s+", " ", v).strip(" .;,")
    return ""


# Mileage: only the odometer reading as stated now, not distances covered since a restoration or service, readings
# from the car's history, service records "at 81,184 km", or km/h.
KM_NUM = re.compile(r"(?<![\d.,])(\d{1,3}(?:[ ,.  ]\d{3})+|\d+)\s*(kilom[eè]tres|kilometers|kilometres|kms?|miles)\b"
                    r"(?!\s*/\s*h|\s*-?\s*h\b|\s+(par|per) heure)", re.I)
KM_ODO = re.compile(r"odometer|odomoter|compteur|\bclock|kilom[ée]trage|mileage|totalis|totall?ing|\btotals\b|"
                    r"km d'origine|kilom[eè]tres d'origine|from new|depuis l'origine|depuis neuf", re.I)
KM_SHOWS = re.compile(r"affiche|display|shows|showing|reads|indique", re.I)  # counts with KM_NOW only
KM_NOW = re.compile(r"today|aujourd'hui|\bnow\b|d[ée]sormais|currently|actuellement|[àa] ce jour|to date", re.I)
KM_PAST = re.compile(r"\b(en|in|since|depuis) (19|20)\d\d\b|affichait|totalisait|indiquait|\balors\b|\bthen\b|"
                     r"at (the|this|that) time|[àa] (cette|l')[ ée]poque|by which time|when (it|the|he|she)\b|"
                     r"remis [àa] (0|z[ée]ro)|\breset\b", re.I)
KM_RESTO = re.compile(r"since (its |the )?restor|since it was restored|after (its |the )?restor|"
                      r"depuis (sa |la )?(fin de (sa |la ))?restauration|apr[eè]s (sa |la )?restauration", re.I)
KM_GENUINE = re.compile(r"r[ée]els|genuine|actual|true|real\b", re.I)
KM_BEFORE_BAD = re.compile(r"(\bat|\b[àa]|since|depuis|further|another|suppl[ée]mentaires|\bper|\baux|\bthe|\bles)\s+"
                           r"(about |around |environ |some |quelque |plus de |more than |just |only )?$", re.I)
KM_AFTER_BAD = re.compile(r"\W{0,3}(since|depuis|after|apr[eè]s|ago|later|plus tard|par an|per year|a year)\b", re.I)
# short highlight bullets that state the mileage: "- Only 21,525km", "- Exceptional original condition, only 7,300km",
# "- Première main, moins de 7 700 km"
KM_BULLET = re.compile(r"^\d|\b(only|just|seulement|uniquement|moins de|less than|under|first hand|one owner|"
                       r"premi[eè]re main|d'origine|from new)\b", re.I)


def km_of(e):
    """Stated odometer in km, rounded to 100, or None. From a sentence where the number stands next to the odometer
    ("odometer", "compteur", "kilométrage", "km d'origine", "totalise", "from new"; "displays ... today"), or from a
    short highlight bullet that is only the mileage ("- Only 21,525km"). "Displays 765 km, which refers to 100,765 km
    genuine mileage" takes the genuine figure. Readings below 100 km (odometer reset at a restoration) are not used."""
    for blob in (e.get("descriptionWithHtml"), e.get("shortDescription")):
        for line in re.split(r"<br\s*/?>|</p>|\n", blob or ""):
            line = text(line)
            bullet = line.startswith("-")
            for s in [line] if bullet else re.split(r"(?<=[.;!?])\s+", line):
                s = s.lstrip("-– ").strip()
                ms = list(KM_NUM.finditer(s))
                if not ms: continue
                if len(ms) > 1 and KM_GENUINE.search(s[ms[0].end():]): m = ms[-1]
                else:
                    ms = [m for m in ms if not KM_BEFORE_BAD.search(s[:m.start()]) and not KM_AFTER_BAD.match(s[m.end():])
                          and not KM_RESTO.search(s[m.end():m.end() + 90])]
                    if not ms: continue
                    if bullet and len(s) <= 80 and len(ms) == 1 and KM_BULLET.search(s) and not KM_PAST.search(s):
                        m = ms[0]
                    else:
                        if KM_PAST.search(s) and not KM_NOW.search(s): continue
                        cues = list(KM_ODO.finditer(s)) or (list(KM_SHOWS.finditer(s)) if KM_NOW.search(s) else [])
                        near = [(min(abs(c.start() - m.end()), abs(m.start() - c.end())), i, m)
                                for i, m in enumerate(ms) for c in cues]
                        near = [t for t in near if t[0] <= 60]
                        if not near: continue
                        m = min(near)[2]
                n = int(re.sub(r"\D", "", m.group(1)))
                if n < 100 or n > 1500000: continue
                return round(n * (1.609344 if m.group(2).lower() == "miles" else 1) / 100) * 100
    return None


def desc(x):
    ds = x.get("descriptions") or {}
    return ds.get("ENGLISH") or ds.get("FRENCH") or (next(iter(ds.values())) if ds else {})


out, seen, skipped = [], set(), Counter()
statuses = Counter()
for first, last, ref, s, ses in todo:
    p = os.path.join(DIR, "lots", "%s.json" % ref)
    if not os.path.exists(p): continue
    for x in json.load(open(p))["lots"]:
        statuses[x.get("status")] += 1
        if x.get("uuid") in seen or x.get("category") not in ("VEHICLE", None) or x.get("type") == "AUTOMOBILIA": continue
        st = (x.get("status") or "").upper()
        if st == "SOLD": sold = True
        elif st in ("UNSOLD", "NOT_SOLD", "BOUGHT_IN", "PASSED"): sold = False
        else: skipped["status " + st] += 1; continue
        e = desc(x)
        title = title_of(e)
        if not classify(title): continue
        day, cc = ses.get(x.get("vacationRef"), (first, next(iter(ses.values()), ("", ""))[1]))
        if day < "2015-01-01": continue
        amt = x.get("finalPrice")
        # finalPrice is the price with buyer's premium; a few lots have none, or one equal to the hammer price
        # (premium not recorded). A hammer price alone is not used.
        if sold and (not amt or amt <= (x.get("adjudicationPrice") or 0)):
            skipped["sold, hammer price only"] += 1
            continue
        lot = "%s%s" % (x["index"], "" if (x.get("subIndex") or "a") == "a" else x["subIndex"])
        seen.add(x["uuid"])
        out.append(dict(id=x["uuid"], code=ref, lot=lot, title=title, date=day, sold=sold,
                        amt=int(round(amt)) if sold else None, cur=x.get("currency") or ("EUR" if sold else None),
                        country=cc, chassis=chassis_of(e), km=km_of(e),
                        url="%s/en/sales/%s/lots/%s-%s" % (BASE, ref, x["index"], x.get("subIndex") or "a"),
                        sale=text(s.get("name"))))
out.sort(key=lambda r: (r["date"], r["code"], int(re.sub(r"\D", "", r["lot"]) or 0)))
json.dump(out, open(os.path.join(DIR, "artcurial.json"), "w"), ensure_ascii=False)
print("lot statuses:", dict(statuses), flush=True)
if skipped: print("skipped:", dict(skipped), flush=True)
if missing: print("note:", missing, "sales not fetched yet (--lot-pages)", flush=True)
print(len(out), "Artcurial results since 2015;", new_lists, "new sale lot lists", flush=True)

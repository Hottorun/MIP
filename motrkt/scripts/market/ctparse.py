"""Classic Trader listing pages -> asking-price observations.

usage: python3 -I ctparse.py WORK

Reads every stored day under WORK/web/ct/pages/ and writes WORK/web/asks.json: one row per listing and day it was
seen (price, mileage, year, seller type, country). Listings without a price ("Preis auf Anfrage"), auction lots and
non-EUR prices without an ECB rate are skipped. The variant is assigned with classify.py, like the auction results.
"""
import glob, gzip, html, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify  # noqa: E402

LD = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def prop(h, key):
    """Value of an Astro island prop `"key":[0,value]` (strings, numbers, null)."""
    m = re.search(r'"%s":\[0,("(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|null|true|false)\]' % re.escape(key), h)
    return json.loads(m.group(1)) if m else None


def parse(path, day):
    raw = gzip.open(path).read().decode("utf-8", "replace")
    car = None
    for block in LD.findall(raw):
        try:
            d = json.loads(block)
        except ValueError:
            continue
        for x in d if isinstance(d, list) else [d]:
            if x.get("@type") == "Car" and x.get("offers"):
                car = x
    if not car:
        return None
    off = car["offers"]
    price, cur = off.get("price"), off.get("priceCurrency")
    item = off.get("itemOffered") or {}
    seller = off.get("offeredBy") or {}
    h = html.unescape(raw)
    lid = os.path.basename(path).split(".")[0]
    model = (car.get("model") or item.get("model") or "").strip()
    try:
        year = int(car.get("vehicleModelDate") or 0)
    except ValueError:
        year = 0
    km = (car.get("mileageFromOdometer") or {}).get("value")
    return {
        "id": "CT-" + lid,
        "day": day,
        "url": off.get("url") or "",
        "model": model,
        "year": year,
        "price": price if isinstance(price, (int, float)) and 500 < price < 99_000_000 else None,
        "cur": cur,
        "km": km if isinstance(km, (int, float)) and 0 < km < 2_000_000 else None,
        "seller": "Händler" if seller.get("@type") == "AutoDealer" else "Privat",
        "sellerName": seller.get("name") if seller.get("@type") == "AutoDealer" else None,
        "country": ((seller.get("address") or {}).get("addressCountry")) or prop(h, "locationCountryCode"),
        "body": item.get("bodyType"),
        "gear": car.get("vehicleTransmission"),
        "rhd": "RightHand" in (car.get("steeringPosition") or ""),
        "auction": bool(re.search(r'"priceIsAuctionSale":\[0,true\]', h)) or "Auktion" in (off.get("name") or ""),
        "available": "InStock" in (off.get("availability") or ""),
    }


def body_word(model, body):
    """Body as a title word for classify.py (BaT titles name it: "1988 Porsche 911 Carrera Targa")."""
    m = model.lower()
    if not body or any(w in m for w in ("speedster", "boxster", "spyder", "targa", "cabrio", "roadster")):
        return ""
    if body.startswith("Cabriolet (Roadster)"):
        return " Roadster"
    return {"Cabriolet": " Cabriolet", "Targa": " Targa", "Cabriolet (Targa)": " Targa"}.get(body, "")


def ct_name(model):
    """Classic Trader writes "911 2.2 S", "911 2.4 T \"Ölklappe\"", "911 Carrera RS 2.7 (Sport)"; auction titles (which
    classify.py knows) write "911S 2.2", "911T 2.4", "911 Carrera RS 2.7"."""
    m = re.sub(r'\s*"Ölklappe"', "", model)
    m = re.sub(r"\s*\((Sport|Touring)\)", "", m)
    m = re.sub(r"^911 ([23]\.\d) ([TELS])\b", r"911\2 \1", m)
    return m.strip()


def assign(year, model, body):
    """Listings give the build year, auction titles the model year (a car built in autumn 1971 is a 1972 model). Try
    both; where the name states the displacement, keep the variant that matches it."""
    name = ct_name(model)
    cands = []
    for y in (year, year + 1):
        c = classify("%d Porsche %s%s" % (y, name, body_word(model, body)))
        if c and c not in cands:
            cands.append(c)
    if not cands and re.fullmatch(r"911 2\.7", name) and 1973 <= year <= 1977:
        # classify.py takes a plain "911 2.7" only for model year 1974, because US cars of 1975-1977 were sold as
        # 911 S. These listings are European cars, where the plain 911 2.7 was built until 1977.
        b = body_word(model, body).strip() or "Coupé"
        return ("porsche-911-g-modell-2-7", b, "", max(year, 1974))
    if not cands:
        return None
    disp = re.search(r"\b([23]\.\d)\b", model)
    if disp:
        tok = disp.group(1).replace(".", "-")
        match = [c for c in cands if tok in c[0]]
        if match:
            return match[0]
        if any(re.search(r"-\d-\d($|-)", c[0]) for c in cands):
            return None  # names another displacement than the one in the listing
    return cands[0]


def main():
    work = sys.argv[1]
    rows = []
    for d in sorted(glob.glob(os.path.join(work, "web", "ct", "pages", "*"))):
        day = os.path.basename(d)
        for p in sorted(glob.glob(os.path.join(d, "*.html.gz"))):
            r = parse(p, day)
            if not r or r["price"] is None or r["auction"] or not r["year"]:
                continue
            c = assign(r["year"], r["model"], r["body"])
            if not c:
                r["variant"] = None
            else:
                r["variant"], cb, r["gearClass"], _ = c
                r["body"] = r["body"] or cb
            rows.append(r)
    json.dump(rows, open(os.path.join(work, "web", "asks.json"), "w"), ensure_ascii=False)
    ok = [r for r in rows if r["variant"]]
    print(len(rows), "priced listings,", len(ok), "assigned to a variant")


if __name__ == "__main__":
    main()

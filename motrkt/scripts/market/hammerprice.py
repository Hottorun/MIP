"""Results from the Hammer Price app (hammerprice.csv, read from the app by hand with Hammer Price's written permission).

Hammer Price lists, per model year, the Porsche lots of many auction houses: sold prices and, for unsold lots, the
highest bid. Most sold lots of the big houses are already in our data (fetched from the houses themselves); this adds
  - the houses and sales we cannot fetch (Mecum before 2023, Barrett-Jackson, Russo and Steele, Historics, COYS, ...),
  - the highest bid of unsold lots, also for lots we know only as "not sold".
A Hammer Price row is the same lot as one we have when the house matches, the dates lie within two weeks (Hammer Price
dates a sale by its first day, online sales often by their last; Mecum Kissimmee runs up to two weeks) and either the lot number
(and the build year) or, for sold lots, the variant and the price within 2 % agree. Matched sold lots also check the
currency: price differences are counted in `check`.
"""
import csv, datetime as dt, os, re, collections

HOUSE = {"Gooding & Co.": "Gooding & Company", "Broad Arrow Auctions": "Broad Arrow", "Artcurial Motorcars": "Artcurial",
         "Iconic Auctioneers formerly known as Silverstone Auctions": "Iconic Auctioneers", "H & H Classics": "H&H"}
SAME = {"Silverstone Auctions": "Iconic Auctioneers"}   # one house, two names
SKIP_HOUSE = {"Bring a Trailer"}                         # fetched directly, every lot
CODE = lambda h: re.sub(r"[^A-Z0-9]", "", h.upper())[:6]


def lotn(x):
    x = str(x or "").strip().lower()
    x = x.rsplit("-", 1)[-1] if "-" in x else x
    return re.sub(r"^[a-z]+", "", x)


def day(d): return dt.date.fromisoformat(d).toordinal()


def load(path, classify, to_eur, out, url_of):
    """Returns the new rows; adds highest bids to known unsold lots in `out`; prints a summary."""
    st = collections.Counter(); check = []
    grp = lambda h: SAME.get(h, h)
    idx = collections.defaultdict(list)
    for o in out:
        idx[grp(o["house"])].append(o)
    new = []
    for r in csv.DictReader(open(path, encoding="utf-8"), delimiter=";"):
        if r["status"] not in ("SOLD", "HIGH BID") or not r["preis"] or not r["waehrung"] or not r["datum"]:
            st["ohne Beleg (geschätzt, zurückgezogen, ohne Preis oder Datum)"] += 1; continue
        house = HOUSE.get(r["haus"], r["haus"])
        if house in SKIP_HOUSE: st["Bring a Trailer (direkt abgerufen)"] += 1; continue
        if r["modell"].startswith("["): st["andere Marke, Nachbau oder Umbau"] += 1; continue
        # spellings of the app the classifier does not know: "Boxter", "911R", a bare "930" (the 930 is the Turbo)
        m_ = re.sub(r"\bBoxter\b", "Boxster", r["modell"]); m_ = re.sub(r"\b911R\b", "911 R", m_); m_ = re.sub(r"^930$", "930 Turbo", m_)
        title = "%s Porsche %s" % (r["baujahr"], m_)
        c = classify(title)
        if not c: st["keiner Variante eindeutig zuzuordnen"] += 1; continue
        vid, body, gear, year = c
        amt, cur = int(r["preis"]), r["waehrung"]
        eur = to_eur(amt, cur, r["datum"])
        if eur is None: st["Währung ohne EZB-Kurs"] += 1; continue
        eur = round(eur); sold = r["status"] == "SOLD"; d0 = day(r["datum"])
        def same(o):
            if abs(day(o["date"]) - d0) > 14: return False
            # same lot number and car; the price in the same currency, or the same number (the app shows a few sales in
            # the wrong currency), unless the lot went unsold here or there
            if lotn(o["lot"]) == lotn(r["los"]) and (o.get("year") == year or o["variant"] == vid) and (
                    not (sold and o["sold"]) or o["cur"] == cur or (o["orig"] and abs(o["orig"] / amt - 1) < 0.03)): return True
            return sold and o["sold"] and o["variant"] == vid and o["eur"] and abs(o["eur"] / eur - 1) < 0.02
        m = next((o for o in idx[grp(house)] if same(o)), None)
        if m:
            if sold and m["sold"]:
                st["schon vorhanden (verkauft)"] += 1
                if m["eur"]: check.append(m["eur"] / eur)
            elif not sold and not m["sold"]:
                if not m.get("bid"):
                    m["bid"] = eur; m["bidCur"] = cur; m["bidSrc"] = "Hammer Price"; st["Höchstgebot zu bekanntem Los ergänzt"] += 1
                    if not m.get("orig"): m["orig"], m["cur"] = amt, cur   # shown in the app in the sale's currency
                else: st["schon vorhanden (Höchstgebot)"] += 1
            else: st["schon vorhanden, Status weicht ab (Haus gilt)"] += 1
            continue
        lot = "HP-%s-%s-%s" % (CODE(house), r["datum"], r["los"])
        o = dict(variant=vid, title=title, date=r["datum"], house=house, eur=eur if sold else None, bid=None if sold else eur,
                 sold=sold, orig=amt, cur=cur, km=None, loc=r["land"], body=body, gear=gear, vin="", lot=lot,
                 url=url_of(house, title) or "", year=year, src="hp", event=r["auktion"], nomodel=bool(r["land"]))
        if not sold: o["bidCur"] = cur
        new.append(o); idx[grp(house)].append(o)
        st["neu (verkauft)" if sold else "neu (Höchstgebot)"] += 1
    off = sorted(check)
    bad = sum(1 for x in off if abs(x - 1) > 0.03)
    print("Hammer Price:", dict(st))
    if off: print("   Preisabgleich mit vorhandenen Losen: %d, davon %d mit mehr als 3 %% Abweichung (Median %.4f)" % (len(off), bad, off[len(off) // 2]))
    return new

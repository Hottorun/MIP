"""Checks that an auction result really is the variant it was assigned to, independently of the title.

classify.py assigns a result by its title. Titles can be wrong or incomplete (an aggregator writes "718 Spyder" for a
718 Spyder RS, a seller "911 Carrera" for a Carrera S, "1994 911 Carrera 2" for a 993). The chassis number (FIN/VIN)
cannot be: where a result has one, it is checked against the variant here.

  Typ        positions 7-8 of every 17-digit Porsche FIN: 96 = 964/968, 99 or A9 = 993/996/997/991/992, 98 or A8 =
             Boxster/Cayman/718/Carrera GT, 92 = 928, 93 = 930/924, 94/95 = 944/959, 91 = early 911/918 …
  Modelljahr position 10 (from 1990), against the variant's build years (variant_years.json, one year of slack).
  US-FIN     cars for North America (positions 4-6 not "ZZZ", from model year 1990) also name the body (position 4:
             A Coupé, B Targa, C Cabriolet/Roadster, D 993 Targa) and the model line (position 5, e.g. 718: A Boxster/
             Cayman, B S, C Spyder/GT4, D GTS 4.0, E Spyder RS/GT4 RS; 991/992: A Carrera/4/T, B S/4S/GTS, C GT3,
             D Turbo/Turbo S, E GT2 RS, F GT3 RS/R/S/T/Speedster, G Sport Classic). The table LINE below was read off
             the results whose title and FIN agree (November 2026); a letter that belongs to another line of the same
             series is a contradiction, a letter not in the table is not judged.
  Karosserie the body named in the title (Cabriolet, Targa, Speedster) against the variant's body styles in the
             catalog (variant_bodies.json, written by catalog.mts).

Besides the FIN, TITLE lists titles that name a different car than the series variant although classify.py assigned
them (Clubsport versions of the 964/993 RS, Black Edition, Group 4/B race cars, "… Specification" conversions, tuners).

check() returns the list of contradictions (German, for the review list); empty = nothing found. apply() (called by
build.py) first applies manual/zuordnung-korrekturen.csv (moves a result to another variant, or hides it, by lot id or
FIN, with the reason), then marks every result that still contradicts its variant as hidden: it stays in
sales_all.json and goes to src/data/real/sales-ausgeblendet.csv with the reason, but not into sales.csv and not into
the market value. Nothing is deleted.

usage: python3 -I audit.py src/data/real/sales.csv   prints every contradiction in the file (exit 1 if any)
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
YEARS = {k: (v[0], v[1] or 9999) for k, v in json.load(open(os.path.join(HERE, "variant_years.json"))).items()}
BODIES = json.load(open(os.path.join(HERE, "variant_bodies.json")))
YC = "ABCDEFGHJKLMNPRSTVWXY123456789"   # model-year letters, 1980 + index, repeating every 30 years
VIN = re.compile(r"WP[01][A-HJ-NPR-Z0-9]{14}")

# type code (FIN positions 7-8) of each series; codes outside KNOWN (typos such as "9Z") are not judged
TYPE = [(r"-(996|997|991|992)-|911-gt1-", {"99", "A9"}), (r"-993-", {"99"}), (r"-964-", {"96"}), (r"porsche-930-", {"93"}),
        (r"-g-modell-|-f-modell-", {"91"}), (r"porsche-928-", {"92"}), (r"porsche-944-", {"94", "95"}), (r"porsche-924-", {"92", "93"}),
        (r"porsche-968-", {"96"}), (r"porsche-959-", {"95"}), (r"porsche-(boxster|cayman|718)-", {"98", "A8"}),
        (r"carrera-gt-carrera-gt", {"98"}), (r"porsche-918-", {"91", "A1"})]
KNOWN = {"91", "92", "93", "94", "95", "96", "98", "99", "A8", "A9", "A1"}

# model line (US FIN position 5): (series, variant pattern, letters)
LINE = [
    ("996", r"-996-[12]-(carrera|carrera-4|carrera-4s|targa)$", "A"), ("996", r"-996-[12]-(turbo|turbo-s|gt2)$", "B"),
    ("996", r"-996-[12]-gt3(-rs)?$", "C"),
    ("997", r"-997-[12]-(carrera|carrera-4)$", "A"), ("997", r"-997-[12]-(carrera-s|carrera-4s|speedster|sport-classic)$", "B"),
    ("997", r"-997-[12]-gt3(-rs)?$", "C"), ("997", r"-997-[12]-(turbo|turbo-s|gt2)$", "D"), ("997", r"-997-2-gt2-rs$", "E"),
    ("997", r"-997-2-gt3-rs-4-0$", "F"),
    ("99x", r"-99[12]-[12]-(carrera|carrera-4|carrera-t)$", "A"),
    ("99x", r"-99[12]-[12]-(carrera-s|carrera-4s|carrera-gts|carrera-4-gts|dakar|50-jahre-edition)$", "B"),
    ("99x", r"-99[12]-[12]-gt3$", "C"), ("99x", r"-99[12]-[12]-(turbo|turbo-s)$", "D"), ("99x", r"-99[12]-[12]-gt2-rs$", "E"),
    ("99x", r"-99[12]-[12]-(gt3-rs|r|s-t|speedster)$", "F"), ("99x", r"-992-1-sport-classic$", "G"),
    ("993", r"-993-(carrera|carrera-4|carrera-4s|carrera-s|targa|carrera-rs)$", "A"), ("993", r"-993-(turbo|turbo-s)$", "C"),
    ("964", r"-964-(carrera-2|carrera-4|speedster|carrera-rs)$", "B"), ("964", r"-964-turbo$", "A"), ("964", r"-964-turbo-3-6$", "C"),
    ("986", r"-986-boxster$", "A"), ("986", r"-986-boxster-s(-50-jahre-550-spyder)?$", "B"),
    ("987", r"-987-[12]-(boxster|cayman)$", "A"),
    ("987", r"-987-[12]-(boxster-s|cayman-s|cayman-r|boxster-rs-60-spyder|boxster-s-black-edition|boxster-spyder)$", "B"),
    ("981", r"-981-(boxster|cayman)$", "A"), ("981", r"-981-(boxster-s|cayman-s|boxster-gts|cayman-gts)$", "B"),
    ("981", r"-981-(boxster-spyder|cayman-gt4)$", "C"),
    ("718", r"-718-718-(boxster|cayman)$", "A"), ("718", r"-718-718-(boxster-s|cayman-s)$", "B"),
    ("718", r"-718-718-(spyder|cayman-gt4)$", "C"), ("718", r"-718-718-(boxster-gts-4-0|cayman-gts-4-0)$", "D"),
    ("718", r"-718-718-(spyder-rs|cayman-gt4-rs)$", "E"),
]
LINE_LETTERS = {}
for fam, _, ls in LINE: LINE_LETTERS[fam] = LINE_LETTERS.get(fam, "") + ls
US_BODY = {"A": {"Coupé"}, "B": {"Targa"}, "C": {"Cabriolet", "Roadster"}, "D": {"Targa"}}
LINE_NAME = {"718": {"A": "Boxster/Cayman", "B": "S", "C": "Spyder/GT4", "D": "GTS 4.0", "E": "Spyder RS/GT4 RS"},
             "99x": {"A": "Carrera/Carrera 4/T", "B": "S/4S/GTS", "C": "GT3", "D": "Turbo/Turbo S", "E": "GT2 RS", "F": "GT3 RS/R/S/T/Speedster", "G": "Sport Classic"},
             "997": {"A": "Carrera/Carrera 4", "B": "S/4S", "C": "GT3/GT3 RS 3.6/3.8", "D": "Turbo/GT2", "E": "GT2 RS", "F": "GT3 RS 4.0"},
             "996": {"A": "Carrera/4/4S/Targa", "B": "Turbo/GT2", "C": "GT3"},
             "993": {"A": "Carrera/4/4S/S/Targa/RS", "C": "Turbo"}, "964": {"A": "Turbo 3.3", "B": "Carrera 2/4", "C": "Turbo 3.6"},
             "986": {"A": "Boxster", "B": "Boxster S"}, "987": {"A": "Boxster/Cayman", "B": "S/R/Spyder"},
             "981": {"A": "Boxster/Cayman", "B": "S/GTS", "C": "Spyder/GT4"}}
RACE = re.compile(r"rennsportwagen-|gt-rennwagen-|cup-und-clubsport-")
# titles that name a different car than the series variant: (pattern, reason, only for variants matching, not for
# variants matching). The series variant keeps only series cars, as classify.py does with its SPECIAL list; these
# results are hidden, not dropped, so the list of what was left out stays complete.
TITLE = [
    (r"\bgroup ?(4|5|b|c)\b|\bgruppe ?(4|5|b)\b|\bgr\. ?[45]\b|\bfia\b|competition prepared|\bhtp\b",
     "Rennversion oder für den historischen Rennsport aufgebaut (Titel: „{m}“)", None, r"-sc-rs$"),
    (r"\bspecification\b", "nach Vorbild umgebaut (Titel: „{m}“), kein Serienzustand", None, None),
    (r"\bcup\b", "Cup-Rennwagen, keine Straßenversion", None, None),
    (r"club ?sport", "Clubsport-Version mit eigener Kleinserie (Titel: „{m}“), gehört nicht zur Serienvariante",
     r"-964-carrera-rs(-3-8)?$|-993-carrera-rs$|-924-carrera-gts$", None),
    (r"clubsport 25\b", "Sondermodell GT2 RS Clubsport 25 (30 Stück), nicht der GT2 RS Clubsport", None, None),
    (r"cup 4\.0|brumos", "GT3 Cup 4.0 (Brumos Edition) mit anderem Motor als der GT3 Cup", r"gt3-cup-997$", None),
    (r"black edition", "Sondermodell Black Edition ohne eigene Variante", None, r"black-edition$"),
    (r"limited edition|can-am", "Sondermodell (Limited Edition)", r"porsche-914-", None),
    (r"rothmans", "Sondermodell (Rothmans-Edition)", None, None),
    (r"heritage design", "Sondermodell Heritage Design Edition ohne eigene Variante", None, r"speedster$|-s-t$"),
    (r"pre-?production|vorserie", "Vorserienfahrzeug", None, None),
    (r"shark ?werks", "Tuner-Umbau (Shark Werks)", None, None),
    (r"manthey", "Umbau von Manthey, nicht das Werks-Kit (das gibt es ab 991.2 GT2 RS)", None, r"-992-|718-718-|991-2-gt2-rs$"),
    (r"gt3 options|gt3 parts", "Carrera mit GT3-Teilen, kein GT3", None, None),
    (r"speedster", "Speedster mit Turbo-Technik, ein Umbau (Werks-Turbo nur als Coupé, Targa, Cabriolet)", r"porsche-930-", None),
    (r"\brs ?60\b", "Boxster RS 60 Spyder gab es nur 2008 (987.1), dies ist ein anderer Boxster", r"987-2-boxster$", None),
    (r"targa (newfoundland|tasmania|florio)", "Rallye-Fahrzeug (Titel: „{m}“)", None, None),
]
BODY_WORDS = [("speedster", "Roadster"), ("spyder", "Roadster"), ("roadster", "Roadster"), ("cabrio", "Cabriolet"), ("convertible", "Cabriolet"), ("targa", "Targa")]


def model_year(vin, near):
    """Model year from FIN position 10, the candidate closest to `near` (the letters repeat every 30 years)."""
    c = vin[9]
    if c not in YC: return None
    return min((1980 + YC.index(c) + 30 * k for k in (-1, 0, 1)), key=lambda y: abs(y - near))


def body_of_title(title):
    t = title.lower()
    return next((b for w, b in BODY_WORDS if w in t), None)


def fits(body, allowed):
    """Roadster and Cabriolet are the same open body for this check (Speedster, Spyder, Boxster)."""
    if body in allowed: return True
    return body in ("Roadster", "Cabriolet") and bool(allowed & {"Roadster", "Cabriolet"})


def check(variant, title, vin="", year=None):
    """Contradictions between a result and its variant (list of German sentences, empty if none)."""
    out = []
    t = (title or "").lower()
    if RACE.search(variant):
        # race and cup cars: only the rules written for them (the series rules and FIN schemes do not apply)
        for pat, why, only, never in TITLE:
            mm = re.search(pat, t)
            if mm and only and re.search(only, variant) and not (never and re.search(never, variant)): out.append(why.format(m=mm.group(0)))
        return out
    for pat, why, only, never in TITLE:
        mm = re.search(pat, t)
        if mm and (not only or re.search(only, variant)) and not (never and re.search(never, variant)): out.append(why.format(m=mm.group(0)))
    m = re.search(r"\b(19[4-9]\d|20[0-3]\d)\b", title or "")
    year = year or (int(m.group(1)) if m else None)
    allowed = set(BODIES.get(variant, []))
    tb = body_of_title(title or "")
    if tb == "Cabriolet" and allowed == {"Targa"} and "914" in t: tb = None   # US sellers call the 914 a convertible
    if "targa newfoundland" in t or "targa tasmania" in t or "targa florio" in t: tb = None
    if tb and allowed and not fits(tb, allowed):
        out.append("Karosserie laut Titel %s, die Variante gibt es nur als %s" % (tb, "/".join(sorted(allowed))))
    vin = re.sub(r"[^A-Z0-9]", "", (vin or "").upper())
    if not VIN.fullmatch(vin): return out
    tc = vin[6:8]
    for pat, codes in TYPE:
        if re.search(pat, variant):
            if tc in KNOWN and tc not in codes:
                out.append("FIN %s: Typ %s passt nicht zur Baureihe dieser Variante (erwartet %s)" % (vin, tc, "/".join(sorted(codes))))
            break
    if not year or year < 1990: return out
    my = model_year(vin, year)
    # European FINs have "Z" in position 9 until about 2017; anything else there is a typo, the year letter is not read
    if vin[3:6] == "ZZZ" and vin[8] != "Z" and my and my < 2017: my = None
    y0, y1 = YEARS.get(variant, (None, None))
    if my and y0 and not (y0 - 1 <= my <= y1 + 1) and abs(my - year) > 1:
        out.append("FIN %s: Modelljahr %d liegt außerhalb der Bauzeit %d–%s" % (vin, my, y0, y1 if y1 < 9999 else "heute"))
    if vin[3:6] == "ZZZ" or not my or my < 1990: return out
    bl = vin[3]
    if bl in US_BODY and allowed and not any(fits(b, allowed) for b in US_BODY[bl]):
        out.append("FIN %s: Karosserie %s (Stelle 4 = %s), die Variante gibt es nur als %s"
                   % (vin, "/".join(sorted(US_BODY[bl])), bl, "/".join(sorted(allowed))))
    ll = vin[4]
    for fam, pat, letters in LINE:
        if re.search(pat, variant):
            if ll not in letters and ll in LINE_LETTERS[fam]:
                out.append("FIN %s: Modelllinie %s (Stelle 5 = %s), erwartet %s" % (vin, LINE_NAME[fam].get(ll, ll), ll, LINE_NAME[fam].get(letters, letters)))
            break
    return out


def load_fixes(fn=os.path.join(HERE, "manual", "zuordnung-korrekturen.csv")):
    """Decisions by hand (manual/zuordnung-korrekturen.csv): by lot id or FIN -> (new variant or "" to hide, reason)."""
    fixes = {}
    if os.path.exists(fn):
        for r in csv.DictReader(open(fn, encoding="utf-8"), delimiter=";"):
            v = ((r.get("variante_neu") or "").strip(), (r.get("grund") or "").strip())
            if (r.get("los_id") or "").strip(): fixes["lot:" + r["los_id"].strip()] = v
            if (r.get("fin") or "").strip(): fixes["fin:" + re.sub(r"[^A-Z0-9]", "", r["fin"].upper())] = v
    return fixes


def apply(rows, fixes=None):
    """Sales rows of build.py (variant, title, vin, lot): applies the decisions by hand, then hides every row that
    contradicts its variant ("hidden" = the reasons). Nothing is dropped. Returns (moved, hidden) counts."""
    fixes = load_fixes() if fixes is None else fixes
    moved = hidden = 0
    for r in rows:
        r.pop("hidden", None)
        fx = fixes.get("lot:" + (r.get("lot") or "")) or fixes.get("fin:" + re.sub(r"[^A-Z0-9]", "", (r.get("vin") or "").upper()))
        if fx:
            new, why = fx
            if not new:
                r["hidden"] = "von Hand ausgeblendet: " + why; hidden += 1; continue
            if new != r["variant"]:
                r["movedFrom"], r["variant"], r["moveReason"] = r["variant"], new, why; moved += 1
        why = check(r["variant"], r.get("title") or "", r.get("vin") or "")
        if why: r["hidden"] = "; ".join(why); hidden += 1
    return moved, hidden


if __name__ == "__main__":
    rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8"), delimiter=";"))
    n = 0
    for r in rows:
        for msg in check(r["variant_id"], r["fahrzeug"], r["fin"]):
            n += 1
            print("%s | %s | %s %s | %s | %s" % (r["variant_id"], r["fahrzeug"], r["haus"], r["datum"], r["los_id"], msg))
    print(n, "Widersprüche in", len(rows), "Ergebnissen")
    sys.exit(1 if n else 0)

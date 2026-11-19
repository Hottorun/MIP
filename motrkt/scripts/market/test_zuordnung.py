"""Tests: every auction result belongs to exactly the variant it is assigned to.

usage: python3 -I scripts/market/test_zuordnung.py      (also run by CI and by daily.sh before data are committed)

1. classify.py on the typical confusions: base and sports versions (GT3 / GT3 RS / Touring, Turbo / Turbo S,
   Carrera / S / 4 / 4S / GTS, Spyder / Spyder RS, GT4 / GT4 RS, Cayman / S / R), generations at the change
   (996 / 997.1 / 997.2, 991.1 / 991.2, 964 / 993), body styles, special and race versions, replicas, parts.
2. audit.py: chassis numbers and titles that contradict a variant are found, and the hand decisions are well formed.
3. The data in src/data/real: no visible result contradicts its variant, and every visible result is the variant
   classify.py gives its title (or a decision by hand, or Hammer Price's assignment by build year).
"""
import csv, json, os, re, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from classify import classify  # noqa: E402
import audit  # noqa: E402

REAL = os.path.join(HERE, "..", "..", "src", "data", "real")
P = "porsche-"

CASES = [
    # 718 Spyder / Spyder RS, GT4 / GT4 RS: the plain versions end with 2023, the RS follows; shortened titles of an RS
    ("2024 Porsche 718 Spyder RS", "718-718-spyder-rs"),
    ("Gulf Blue 2024 Porsche 718 Spyder RS Weissach", "718-718-spyder-rs"),
    ("2025 Porsche 718 Boxster Spyder RS", "718-718-spyder-rs"),
    ("2022 Porsche 718 Spyder 6-Speed", "718-718-spyder"),
    ("2020 Porsche 718 Boxster Spyder", "718-718-spyder"),
    ("2024 Porsche 718 SPYDER", None),                       # Hammer Price's title of a Spyder RS
    ("2024 Porsche 718 Spyder Weissach", None),              # Weissach package only on the RS
    ("2016 Porsche Boxster Spyder", "boxster-981-boxster-spyder"),
    ("2011 Porsche Boxster Spyder", "boxster-987-2-boxster-spyder"),
    ("2023 Porsche 718 Cayman GT4 RS Weissach", "718-718-cayman-gt4-rs"),
    ("2023 Porsche 718 Cayman GT4RS", "718-718-cayman-gt4-rs"),
    ("2021 Porsche 718 Cayman GT4", "718-718-cayman-gt4"),
    ("2024 Porsche 718 Cayman GT4 Weissach Package", None),
    ("2025 Porsche 718 Cayman GT4", None),
    ("2016 Porsche Cayman GT4", "cayman-981-cayman-gt4"),
    # Cayman / Cayman S / Cayman R / GTS
    ("2008 Porsche Cayman", "cayman-987-1-cayman"),
    ("2008 Porsche Cayman S", "cayman-987-1-cayman-s"),
    ("2012 Porsche Cayman R", "cayman-987-2-cayman-r"),
    ("2016 Porsche Cayman GTS", "cayman-981-cayman-gts"),
    ("2007 Porsche Cayman Design Edition 1", None),
    # GT3 / GT3 RS / Touring / RS 4.0 / Cup / R
    ("2018 Porsche 911 GT3 Touring", "911-991-2-gt3"),
    ("2015 Porsche 911 GT3", "911-991-1-gt3"),
    ("2016 Porsche 911 GT3 RS", "911-991-1-gt3-rs"),
    ("2019 Porsche 911 GT3 RS Weissach", "911-991-2-gt3-rs"),
    ("2011 Porsche 911 GT3 RS 4.0", "911-997-2-gt3-rs-4-0"),
    ("2010 Porsche 911 GT3 RS", "911-997-2-gt3-rs"),
    ("2007 Porsche 911 GT3 RS", "911-997-1-gt3-rs"),
    ("2004 Porsche 911 GT3 RS", "911-996-2-gt3-rs"),
    ("2022 Porsche 911 GT3 Touring", "911-992-1-gt3"),
    ("2023 Porsche 911 GT3 RS", "911-992-1-gt3-rs"),
    ("2018 Porsche 911 GT3 Cup", "cup-und-clubsport-911-gt3-cup-991"),
    ("2016 Porsche 911 GT3 R", "gt-rennwagen-996-bis-992-911-gt3-r-991"),
    ("2007 Porsche 911 GT3 Cabriolet", None),
    # GT2 RS and its race version
    ("2018 Porsche 911 GT2 RS Weissach", "911-991-2-gt2-rs"),
    ("2019 Porsche 911 GT2 RS Clubsport", "gt-rennwagen-996-bis-992-911-gt2-rs-clubsport"),
    ("2019 Porsche 991 GT2 RS Club Sport", "gt-rennwagen-996-bis-992-911-gt2-rs-clubsport"),
    # Turbo / Turbo S
    ("2011 Porsche 911 Turbo", "911-997-2-turbo"),
    ("2011 Porsche 911 Turbo S", "911-997-2-turbo-s"),
    ("2008 Porsche 911 Turbo", "911-997-1-turbo"),
    ("2005 Porsche 911 Turbo S Cabriolet", "911-996-2-turbo-s"),
    ("2017 Porsche 911 Turbo S", "911-991-2-turbo-s"),
    ("2021 Porsche 911 Turbo S", "911-992-1-turbo-s"),
    ("2021 Porsche 911 Turbo S Cabriolet", None),
    ("1997 Porsche 911 Turbo S", "911-993-turbo-s"),
    ("1997 Porsche 911 Turbo", "911-993-turbo"),
    ("1993 Porsche 911 Turbo S Leichtbau", "911-964-turbo-s-leichtbau"),
    ("1994 Porsche 911 Turbo 3.6", "911-964-turbo-3-6"),
    ("1977 Porsche 911 Turbo 3.3", None),                     # 3.3 only from 1978: an engine swap
    # Carrera / S / 4 / 4S / GTS / T, generations at the change
    ("2008 Porsche 911 Carrera", "911-997-1-carrera"),
    ("2008 Porsche 911 Carrera 4S", "911-997-1-carrera-4s"),
    ("2010 Porsche 911 Carrera 4", "911-997-2-carrera-4"),
    ("2012 Porsche 911 Carrera S", "911-997-2-carrera-s"),
    ("2005 Porsche 911 Carrera 4S", "911-996-2-carrera-4s"),
    ("2001 Porsche 911 Carrera", "911-996-1-carrera"),
    ("2003 Porsche 911 Carrera", "911-996-2-carrera"),
    ("2016 Porsche 911 Carrera S", "911-991-1-carrera-s"),
    ("2017 Porsche 911 Carrera S", "911-991-2-carrera-s"),
    ("2016 Porsche 911 Targa S4", "911-991-1-carrera-4s"),
    ("2016 Porsche 911 Targa 4S", "911-991-1-carrera-4s"),
    ("2018 Porsche 911 Carrera T", "911-991-2-carrera-t"),
    ("2023 Porsche 911 Carrera GTS", "911-992-1-carrera-gts"),
    ("2023 Porsche 911 Carrera 4 GTS", "911-992-1-carrera-4-gts"),
    ("2023 Porsche 911 Targa 4 GTS", "911-992-1-carrera-4-gts"),
    ("2026 Porsche 911 Carrera S", "911-992-2-carrera-s"),
    ("1996 Porsche 911 Carrera 2S", "911-993-carrera-s"),
    ("1997 Porsche 911 Carrera 4S", "911-993-carrera-4s"),
    ("1992 Porsche 911 Carrera 2", "911-964-carrera-2"),
    ("1992 Porsche 911 Carrera 4", "911-964-carrera-4"),
    ("1996 Porsche 993 Carrera 4", "911-993-carrera-4"),
    ("2008 Porsche 911 (997.2) Carrera S", "911-997-2-carrera-s"),  # 997.2 built from 2008: the title decides
    ("2008 Porsche 911 Carrera S", "911-997-1-carrera-s"),          # without it the model year does
    ("2009 Porsche 911 (997.1) Carrera S", "911-997-2-carrera-s"),  # 997.1 built until 2008: the year decides
    # body styles: Coupé / Cabriolet / Targa / Speedster
    ("1994 Porsche 911 Speedster", "911-964-speedster"),
    ("1989 Porsche 911 Speedster", "911-g-modell-speedster"),
    ("2011 Porsche 911 Speedster", "911-997-2-speedster"),
    ("2019 Porsche 911 Speedster", "911-991-2-speedster"),
    ("1997 Porsche 911 Targa", "911-993-targa"),
    ("1984 Porsche 911 Carrera Cabriolet", "911-g-modell-carrera-3-2"),
    ("1980 Porsche 911 SC Cabriolet", None),                  # the SC Cabriolet came in 1983
    ("1993 Porsche 911 Carrera RS Targa", None),
    # special and anniversary models, replicas, parts and memorabilia
    ("2014 Porsche 911 50th Anniversary Edition", "911-991-1-50-jahre-edition"),
    ("2004 Porsche Boxster S 550 Anniversary Edition", "boxster-986-boxster-s-50-jahre-550-spyder"),
    ("2008 Porsche Boxster RS 60 Spyder", "boxster-987-1-boxster-rs-60-spyder"),
    ("1973 Porsche 911 Carrera RS 2.7 Replica", None),
    ("1972 Porsche 911 RS Tribute", None),
    ("1985 Porsche 911 Carrera Backdate", None),
    ("1997 Porsche 993 Carrera RS-Look", None),
    ("1989 Porsche 911 Speedster Clubsport Recreation", None),
    ("1990 Porsche 911 Turbo-Look Cabriolet", None),
    ("1995 Porsche 993 RSR-Style Coupe", None),
    ("1988 Porsche 911 Turbo Owner's Manual", None),
    ("1974 Porsche 911 Carrera Engine", None),
    ("1970 Porsche 911 Fuchs Wheels", None),
    ("1996 Porsche 993 Carrera Singer", None),
    ("1980 Porsche 911 Club Coupe", None),
    ("1989 Porsche 911 Carrera 4 Leichtbau", None),
]

AUDIT = [
    # (variant, title, FIN, expected words in a contradiction or None for none)
    (P + "718-718-spyder", "2022 Porsche 718 Spyder", "WP0CC2A80NS235529", None),
    (P + "718-718-spyder", "2024 Porsche 718 Spyder", "WP0CE2A85RK240631", "Modelllinie"),       # FIN of a Spyder RS
    (P + "718-718-spyder-rs", "2024 Porsche 718 Spyder RS", "WP0CC2A80NS235529", "Modelllinie"),  # FIN of a Spyder
    (P + "718-718-cayman-gt4", "2022 Porsche 718 Cayman GT4", "WP0AE2A85PS270001", "Modelllinie"),
    (P + "911-992-1-turbo-s", "2021 Porsche 911 Turbo S", "WP0CD2A98MS263437", "Karosserie"),    # a Cabriolet
    (P + "911-964-carrera-2", "1994 Porsche 911 Carrera 2", "WP0ZZZ99ZRS310891", "Typ 99"),      # a 993
    (P + "911-g-modell-carrera-3-2", "1989 Porsche 911 Carrera", "WP0AB0968KS450556", "Typ 96"),  # a 964
    (P + "911-997-2-gt3-rs", "2011 Porsche 911 GT3 RS", "WP0AF2A96BS785613", "Modelllinie"),     # a GT3 RS 4.0
    (P + "911-997-2-gt3-rs", "2010 Porsche 911 GT3 RS", "WP0AC2A97AS783188", None),
    (P + "boxster-986-boxster", "2000 Porsche Boxster", "WP0CB2986YU662343", "Modelllinie"),     # a Boxster S
    (P + "911-993-carrera-rs", "1995 Porsche 911 Carrera RS Clubsport", "", "Clubsport"),
    (P + "911-993-carrera-rs", "1995 Porsche 911 Carrera RS", "", None),
    (P + "cayman-987-2-cayman-s", "2012 Porsche Cayman S Black Edition", "", "Black Edition"),
    (P + "boxster-987-2-boxster-s-black-edition", "2012 Porsche Boxster S Black Edition", "", None),
    (P + "930-turbo-3-3", "1987 Porsche 911 Turbo 'Group B'", "", "Rennversion"),
    (P + "911-964-carrera-rs", "1991 Porsche 911 Carrera 2 Coupé to RS Specification", "", "Vorbild"),
    (P + "914-914-1-7", "1972 Porsche 914 Convertible", "", None),
    (P + "928-928", "1982 Porsche 928 Cabriolet", "", "Karosserie"),
    (P + "911-997-1-gt3", "2007 Porsche 911 GT3 Shark Werks 4.1", "", "Tuner"),
    (P + "911-992-1-gt3", "2024 Porsche 911 GT3 Manthey Racing Package", "", None),
    (P + "911-992-1-carrera-4s", "2024 Porsche 911 Targa 4S Heritage Design", "", "Heritage"),
    (P + "911-991-2-speedster", "2019 Porsche 911 Speedster Heritage Design", "", None),
    (P + "cup-und-clubsport-911-gt3-cup-997", "2012 Porsche 911 GT3 Cup 4.0 Brumos Edition", "", "Cup 4.0"),
]


class Classify(unittest.TestCase):
    def test_cases(self):
        wrong = []
        for title, want in CASES:
            c = classify(title)
            got = c[0][len(P):] if c else None
            if got != want: wrong.append("%s: %s statt %s" % (title, got, want))
        self.assertEqual(wrong, [])


class Audit(unittest.TestCase):
    def test_cases(self):
        wrong = []
        for variant, title, vin, want in AUDIT:
            why = audit.check(variant, title, vin)
            if want is None and why: wrong.append("%s: unerwartet %s" % (title, why))
            if want and not any(want in w for w in why): wrong.append("%s: „%s“ nicht gefunden (%s)" % (title, want, why))
        self.assertEqual(wrong, [])

    def test_fixes_well_formed(self):
        ids = {v for v, _ in json.load(open(os.path.join(HERE, "variant_ids.json")))}
        bad = []
        for i, r in enumerate(csv.DictReader(open(os.path.join(HERE, "manual", "zuordnung-korrekturen.csv"), encoding="utf-8"), delimiter=";"), 2):
            if len(r) != 5 or None in r: bad.append("Zeile %d: Spaltenzahl" % i)
            if not (r.get("los_id") or r.get("fin")): bad.append("Zeile %d: weder los_id noch fin" % i)
            if r.get("variante_neu") and r["variante_neu"] not in ids: bad.append("Zeile %d: Variante %s unbekannt" % (i, r["variante_neu"]))
            if not (r.get("grund") or "").strip() or not re.fullmatch(r"\d{4}-\d\d-\d\d", r.get("geprueft") or ""): bad.append("Zeile %d: Grund/Datum" % i)
        self.assertEqual(bad, [])


class Data(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = list(csv.DictReader(open(os.path.join(REAL, "sales.csv"), encoding="utf-8"), delimiter=";"))

    def test_no_contradictions(self):
        bad = ["%s | %s | %s" % (r["variant_id"], r["fahrzeug"], w) for r in self.rows for w in audit.check(r["variant_id"], r["fahrzeug"], r["fin"])]
        self.assertEqual(bad[:30], [], "%d sichtbare Ergebnisse widersprechen ihrer Variante" % len(bad))

    def test_variant_is_the_titles(self):
        fixes = audit.load_fixes()
        bad = []
        for r in self.rows:
            c = classify(r["fahrzeug"])
            got = c[0] if c else None
            if got == r["variant_id"]: continue
            if fixes.get("lot:" + r["los_id"]) or fixes.get("fin:" + r["fin"]): continue
            # Hammer Price names some cars only "911", "911 Targa", "924": assigned by build year (hammerprice.by_year)
            if got is None and r["los_id"].startswith(("HP-", "MEC-", "BJ-", "BA-")) and re.fullmatch(r"\d{4} Porsche (911|924)( Targa| Cabriolet| Coupe)?", r["fahrzeug"]): continue
            bad.append("%s | %s -> %s" % (r["variant_id"], r["fahrzeug"], got))
        self.assertEqual(bad[:30], [], "%d Ergebnisse stehen nicht bei der Variante ihres Titels" % len(bad))

    def test_hidden_have_reason(self):
        fn = os.path.join(REAL, "sales-ausgeblendet.csv")
        if not os.path.exists(fn): self.skipTest("noch keine ausgeblendeten Ergebnisse")
        rows = list(csv.DictReader(open(fn, encoding="utf-8"), delimiter=";"))
        self.assertTrue(all((r.get("grund") or "").strip() for r in rows))
        self.assertFalse({r["los_id"] for r in rows} & {r["los_id"] for r in self.rows}, "ein Ergebnis ist zugleich sichtbar und ausgeblendet")


if __name__ == "__main__":
    unittest.main(verbosity=1)

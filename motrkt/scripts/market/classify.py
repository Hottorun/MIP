"""Assign an auction title (year + model text) to exactly one catalog variant, or None.
Conservative: anything modified, replica, part, or not clearly one variant is rejected."""
import re, html

P = "porsche-"
EXCL = ["modif", "powered", "backdat", "restomod", "singer", "reimagin", "outlaw", "replica", "tribute", "recreation",
        "continuation", "kit car", "project", "conversion", "converted", "wide-body", "widebody", "rwb", "rauh", "ruf ",
        "ruf-", " ruf", "gemballa", "techart", "strosek", "emory", "gunther", "theon", "tuthill", "everrati", "electric",
        "safari", "rally", "hillclimb", "kart", "junior", "scale", "model", "wheels", "engine", "transaxle", "gearbox",
        "literature", "owner's manual", "workshop manual", "manuals", "seats", "parts", "tractor", "diesel", "painting", "art car", "children", "pedal",
        "poster", "bicycle", "trailer", "shell", "chassis", "rolling", "salvage", "zagato", "beck ", "chamonix",
        "intermeccanica", "vintage speedster", "apal", "canepa", "sally", "rinspeed", " by ", "style", "look", "kremer",
        "dp ", "koenig", "b&b", "rennsport", "rsr-", "rs-style", "ev ", "engineless", "hot rod", "dragster", "shooting brake",
        "lightweight-", "evocation", "hommage", "homage", "custom", "bespoke", "speedster-", "rothsport", "magnus", "lanzante",
        "nardone", "kaege", "paul stephens", "alfaholics", "cars & coffee", "simulator", "sculpture", "documents", "sign ", "turbocharged", "supercharged", "swapped", "tool kit", "toolkit", "tool roll",
        "body", "frame", "hardtop for", "top for", "fuchs", "bbs", "bumper", "wing", "hood", "door", "steering", "instrument"]
TRACK = ["race car", "racecar", "track car", "race-prepped", "race prepped", "racer", "track-prepped", "vintage race"]
RACE_OK = ["race car", "racecar", "track car", "racer"]

def norm(s):
    s = html.unescape(s).replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip()

def split(title):
    t = norm(title)
    m = re.search(r"\b(19[4-9]\d|20[0-2]\d)\s+Porsche\s+(.*)$", t)
    if not m: return None
    return t[: m.start()].strip(), int(m.group(1)), m.group(2).strip()

def has(s, *ws): return any(w in s for w in ws)

def race(y, s, full):
    """Motorsport catalog (race cars are allowed to carry race keywords)."""
    R = P + "rennsportwagen-"; G = P + "gt-rennwagen-"; C = P + "cup-und-clubsport-"
    if has(full, "replica", "recreation", "continuation", "tribute", "junior", "kart", "children", "scale", "model", "painting", "evocation", "-style", "style ",
           "tool", " kit", "engine", "manual", "experience", "w/ ", "conversion", "gemballa", "rs america", "turbocharged",
           "powered", "modified", "slantnose", "slant nose", "gearbox", "transaxle", "parts", "literature", "wheels", "poster", "sign ", "bodywork", "simulator", "sculpture"):
        return None
    if re.search(r"\b550\s?a\b|\b550a\b", s) and 1955 <= y <= 1958: return R + "550-bis-rs-60-550-a-spyder"
    if re.search(r"\b550\b", s) and "spyder" in s and 1953 <= y <= 1956 and not has(s, "boxster"): return R + "550-bis-rs-60-550-spyder"
    if re.search(r"\brsk\b", s) and 1957 <= y <= 1959: return R + "550-bis-rs-60-718-rsk"
    if re.search(r"\brs\s?60\b", s) and y == 1960: return R + "550-bis-rs-60-718-rs-60"
    if re.search(r"\b904\b", s) and not re.search(r"904/[68]", s) and 1963 <= y <= 1965: return R + "904-bis-917-904-carrera-gts"
    if (re.search(r"\b906\b", s) or "carrera 6" in s) and 1966 <= y <= 1967: return R + "904-bis-917-906-carrera-6"
    if re.search(r"\b910\b", s) and not "910/8" in s and 1967 <= y <= 1968: return R + "904-bis-917-910"
    if "908/02" in s: return R + "904-bis-917-908-02-spyder"
    if "908/03" in s: return R + "904-bis-917-908-03-spyder"
    if "917/10" in s: return R + "904-bis-917-917-10"
    if "917/30" in s: return R + "904-bis-917-917-30"
    if re.search(r"\b917\s?k\b", s) and 1969 <= y <= 1971: return R + "904-bis-917-917-k"
    if re.search(r"\b956\b", s) and 1982 <= y <= 1985: return R + "956-bis-911-gt1-956"
    if re.search(r"\b962c?\b", s) and 1984 <= y <= 1993: return R + "956-bis-911-gt1-962"
    if re.search(r"\bgt1\b", s) and 1996 <= y <= 1998 and not has(s, "strassen", "street", "road"): return R + "956-bis-911-gt1-911-gt1"
    if "rs spyder" in s and 2005 <= y <= 2011: return R + "rs-spyder-und-963-rs-spyder"
    if re.search(r"\b963\b", s) and y >= 2023: return R + "rs-spyder-und-963-963"
    if "abarth" in s and 1960 <= y <= 1962: return G + "356-bis-carrera-rsr-356-b-carrera-gtl-abarth"
    if re.fullmatch(r"911 r", s) and 1967 <= y <= 1969: return G + "356-bis-carrera-rsr-911-r"
    if "rsr" in s and "iroc" not in s and 1973 <= y <= 1975:
        if "2.8" in s or (y == 1973 and "3.0" not in s): return G + "356-bis-carrera-rsr-911-carrera-rsr-2-8"
        if "3.0" in s or y >= 1974: return G + "356-bis-carrera-rsr-911-carrera-rsr-3-0"
    if re.search(r"\b934\b", s) and "½" not in s and "1/2" not in s and 1976 <= y <= 1977: return G + "934-bis-964-rsr-934"
    if re.search(r"\b935\b", s) and 1976 <= y <= 1981 and not has(s, "l1", "baby", "moby", "/78"): return G + "934-bis-964-rsr-935"
    if re.search(r"\b935\b", s) and 2019 <= y <= 2020: return G + "996-bis-992-935-2018"
    if "924 carrera gtr" in s or "924 gtr" in s: return G + "934-bis-964-rsr-924-carrera-gtr"
    if "rsr" in s and 1993 <= y <= 1994: return G + "934-bis-964-rsr-964-carrera-rsr-3-8"
    if "gt3 rsr" in s or "gt3-rsr" in s:
        if 2004 <= y <= 2006: return G + "996-bis-992-911-gt3-rsr-996"
        if 2007 <= y <= 2012: return G + "996-bis-992-911-gt3-rsr-997"
        return None
    if re.search(r"\bgt3 r\b", s) and not re.search(r"gt3 rs", s) and "rennsport" not in s:
        if 2010 <= y <= 2013: return G + "996-bis-992-911-gt3-r-997"
        if 2016 <= y <= 2019: return G + "996-bis-992-911-gt3-r-991"
        if y >= 2023: return G + "996-bis-992-911-gt3-r-992"
        return None
    if "gt2 rs clubsport" in s: return G + "996-bis-992-911-gt2-rs-clubsport"
    if "944 turbo cup" in s: return C + "944-turbo-cup"
    if "gt4 rs clubsport" in s: return C + "718-cayman-gt4-rs-clubsport"
    if "gt4 clubsport" in s:
        if 2016 <= y <= 2017 and "718" not in s: return C + "cayman-gt4-clubsport-981"
        if 2019 <= y <= 2022: return C + "718-cayman-gt4-clubsport"
        return None
    if "gt3 cup" in s or re.search(r"\b99[1-7] cup\b", s) or "cup car" in s and "gt3" in s:
        if 1998 <= y <= 2005: return C + "911-gt3-cup-996"
        if 2006 <= y <= 2012 or (y == 2013 and "997" in s): return C + "911-gt3-cup-997"
        if 2013 <= y <= 2019: return C + "911-gt3-cup-991"
        if y >= 2021: return C + "911-gt3-cup-992"
        return None
    if ("carrera cup" in s or re.search(r"\bcup\b", s)) and 1990 <= y <= 1993 and not has(s, "rs", "gt3"): return C + "911-carrera-cup-964"
    if ("cup" in s) and 1994 <= y <= 1998 and not has(s, "gt3", "carrera rs", "gt2", "rsr"): return C + "911-cup-3-8-993"
    return None

def gearbox(s):
    if has(s, "pdk", "tiptronic", "automatic", "sportomatic"): return "Automatik"
    if re.search(r"\b\d-speed\b", s) or has(s, "manual"): return "Manual"
    return ""

def body(s):
    if "speedster" in s: return "Roadster"
    if "spyder" in s or "roadster" in s: return "Roadster"
    if "cabrio" in s or "convertible" in s: return "Cabriolet"
    if "targa" in s: return "Targa"
    return "Coupé"

def early(y, s, b, full):
    """911 F-Modell (model years 1965-1973) and G-Modell (1974-1989) without the 930 Turbo.
    -> (variant, body), None (rejected) or False (not an early 911: Turbo, 964, later)."""
    if y > 1989 or "turbo" in s or re.search(r"carrera [24](?![.\d])|\bc[24]\b|\b(964|993)\b", s): return False
    if has(s, "anniversary", "jubil", "edition", "commemorative", "weissach", "cup", "safari", "dakar", "iroc", "s/t", "911st", " st ",
           "rsr", "slant", "flat", "m491", "supersport", "wtl", "2.5", "2.8", "3.3", "3.4", "3.6", "901", "911r", "rs america"): return None
    if b == "Cabriolet" and y < 1983 or b == "Roadster" and not ("speedster" in s and y == 1989): return None
    def F(v): return (P + "911-f-modell-" + v, b)
    def G(v): return (P + "911-g-modell-" + v, b)
    m = re.search(r"\b911\s?([tels])\b", s)  # 911T, 911 E, 911S, 911L (not "911 SC", "911 Targa")
    L = m.group(1) if m else ""
    rs = re.search(r"\brs\b", s)
    if y <= 1973:  # F-Modell
        if rs: return F("carrera-rs-2-7") if y == 1973 and has(s, "carrera", "2.7") and b == "Coupé" else None
        if has(s, "carrera", "speedster", " sc "): return None
        if L == "s": return F("s-2-0") if 1967 <= y <= 1969 else F("s-2-2") if 1970 <= y <= 1971 else F("s-2-4") if y >= 1972 else None
        if L == "t": return F("t-2-0") if 1968 <= y <= 1969 else F("t-2-2") if 1970 <= y <= 1971 else F("t-2-4") if y >= 1972 else None
        if L == "e": return F("e-2-0") if y == 1969 else F("e-2-2") if 1970 <= y <= 1971 else F("e-2-4") if y >= 1972 else None
        if L == "l": return F("l-2-0") if y == 1968 else None
        # plain 911 of the O series (model years 1965-1967); 1968 is ambiguous (US 911 or 911 L)
        if re.search(r"\b911\b", s) and 1965 <= y <= 1967 and not re.search(r"\b(r|s|t|e|l)\b", s): return F("2-0")
        return None
    if y <= 1977:  # G-Modell 2.7 and Carrera 3.0
        if rs: return G("carrera-rs-3-0") if y == 1974 and "3.0" in s and b == "Coupé" else None
        if has(s, " sc ", "speedster"): return None
        if "carrera" in s:
            if "3.0" in s or (y >= 1976 and "2.7" not in s): return G("carrera-3-0") if y >= 1976 else None
            # The US Carrera 2.7 (K-Jetronic, 175 PS) is not the 210 PS MFI car: only clearly European / MFI cars count.
            if re.search(r"\b(mfi|euro|european|row|rhd)\b|mechanical fuel", full): return G("carrera-2-7") if y <= 1976 else None
            return None
        if L == "s": return G("s-2-7")
        if L: return None
        # plain 911: model year 1974 only (US cars of 1975-1977 were sold as 911 S)
        if y == 1974 and re.search(r"\b911\b", s): return G("2-7")
        return None
    if y <= 1983:  # 911 SC
        if re.search(r"\bsc\b|911sc", s) and not rs: return G("sc") if y >= 1978 else None
        return None
    if re.search(r"sc[ /-]?rs\b", s): return G("sc-rs") if y == 1984 and b == "Coupé" else None
    if "speedster" in s: return G("speedster") if y == 1989 else None
    if has(s, "clubsport", "club sport") or re.search(r"\bcs\b", s): return G("carrera-3-2-clubsport") if y >= 1987 and b == "Coupé" else None
    if re.search(r"\bsc\b|911sc", s) or rs: return None
    if "carrera" in s or "3.2" in s: return G("carrera-3-2")
    return None

def road(y, s, full=""):
    """Road cars. s = lowercase model text after 'Porsche'; full = whole title (prefix such as "RoW" included)."""
    s = " " + s + " "
    if re.search(r"\b(914|924|928|944|968|cayenne|panamera|macan|taycan|mission)\b", s): return None
    b = body(s)
    four = re.search(r"carrera 4|\b4s\b|targa 4|carrera4|\bc4\b|c4s", s)
    def r(v): return (P + v, b)
    # --- 356
    if re.search(r"\b356", s):
        if has(s, "carrera") and not "carrera 2" in s: return None  # 1500/1600 GS Carrera
        if "carrera 2" in s:
            return r("356-356-carrera-2") if 1961 <= y <= 1965 and b in ("Coupé", "Cabriolet") else None
        if has(s, "convertible d", "roadster", "gläser", "glaser", "america", "continental", "gs/gt", "carrera", "abarth", "outlaw"):
            if "roadster" in s and re.search(r"356\s?b|bt[56]", s) and 1960 <= y <= 1962: return r("356-356-b-coupe")
            return None
        if "speedster" in s:
            return r("356-356-speedster") if 1954 <= y <= 1959 else None
        if re.search(r"356\s?a\b|356a|\ba\b.*(t1|t2)", s) and 1955 <= y <= 1959: return r("356-356-a-coupe")
        if re.search(r"356\s?b|356b|\bbt[56]\b|\bt[56]\b", s) and 1959 <= y <= 1963: return r("356-356-b-coupe")
        if re.search(r"356\s?c\b|356c|356\s?sc|356 1600 sc|\bsc\b", s) and 1963 <= y <= 1965: return r("356-356-c-coupe")
        if (1950 <= y <= 1954 or (y == 1955 and "pre-a" in s)) and b in ("Coupé", "Cabriolet"): return r("356-356-pre-a-coupe")
        return None
    # --- 912
    if re.search(r"\b912", s):
        if re.search(r"912\s?e\b", s) and y == 1976: return r("912-912-e")
        if 1965 <= y <= 1969 and b in ("Coupé", "Targa"): return r("912-912-coupe")
        return None
    # --- supercars
    if "carrera gt" in s and 2004 <= y <= 2006: return (P + "carrera-gt-carrera-gt", "Roadster")
    if re.search(r"\b918\b", s) and 2013 <= y <= 2016:
        return (P + "918-918-spyder-weissach" if "weissach" in s else P + "918-918-spyder", "Roadster")
    if re.search(r"\b959\b", s) and 1986 <= y <= 1993:
        if has(s, "speedster", "cabrio", "targa", "roadster"): return None
        if "sport" in s: return (P + "959-959-sport", "Coupé")
        if has(s, "s ", "sc", "prototype", "vorserie", "pre-series"): return None
        return (P + "959-959-komfort", "Coupé")
    if not re.search(r"\b911|\b930|\b964|\b993|\b996|\b997|\b991|\b992|carrera|turbo|gt[23]|speedster", s): return mid(y, s, b)
    e = early(y, s, b, full)
    if e is not False: return e
    if has(s,"rs america", "america roadster", "anniversary", "jubil", "30 jahre", "edition", "exclusive", "club coupe",
           "sc ", "sc/", "3.2", "carrera 3.0", "2.7", "911t", "911e", "911s", "911l", " l ", " e ", "2.0", "2.2", "2.4",
           "lightweight", "cup", "rsr", "safari", "dakar") and not (("dakar" in s) and y >= 2023) and not re.search(r"50th|50 jahre|50 years", s):
        # Special editions without own variant are not mixed into a base variant
        if not (re.search(r"50th|50 jahre|50 years", s) and 2013 <= y <= 2014):
            if not (("dakar" in s) and y >= 2023): return None
    # 930 (1975-1989)
    if 1975 <= y <= 1989:
        if "turbo" not in s or ("carrera" in s and not (y <= 1977 and "turbo carrera" in s)): return None
        if y <= 1977: return r("930-turbo-3-0") if b == "Coupé" else None
        if has(s, "slant", "flat", "flachbau", "m505", "m506"):
            return r("930-turbo-3-3-flachbau") if b == "Coupé" else None
        if has(s, "turbo s", "930s", "wls", "s/n"): return None
        return r("930-turbo-3-3")
    # 964 / 993 boundary
    if 1989 <= y <= 1994 and not re.search(r"\b993\b", s):
        if "speedster" in s: return r("911-964-speedster") if y in (1992, 1993, 1994) else None
        if "rs 3.8" in s: return r("911-964-carrera-rs-3-8")
        if re.search(r"carrera rs|\brs\b", s): return r("911-964-carrera-rs") if y in (1991, 1992, 1993) and b == "Coupé" else None
        if "turbo" in s:
            if b != "Coupé": return None
            if "leichtbau" in s or "lightweight" in s: return r("911-964-turbo-s-leichtbau") if y in (1992, 1993) else None
            if re.search(r"turbo( 3\.[36])? s\b", s) or has(s, "s2", "x85", "x88", "flachbau", "flat", "slant"): return None
            if "3.6" in s or y == 1994: return r("911-964-turbo-3-6")
            if 1991 <= y <= 1993: return r("911-964-turbo")
            return None
        if y == 1994 and not re.search(r"carrera 2|carrera 4|\b964\b", s): return None
        if re.search(r"carrera 4|\bc4\b", s): return r("911-964-carrera-4")
        if re.search(r"carrera 2|\bc2\b|964 carrera|carrera", s) and 1990 <= y: return r("911-964-carrera-2")
        return None
    if 1994 <= y <= 1998:
        if "gt2" in s: return r("911-993-gt2") if not re.search(r"gt2 r\b|gt2 evo", s) else None
        if re.search(r"carrera rs|\brs\b", s): return r("911-993-carrera-rs") if y in (1995, 1996) else None
        if "turbo s" in s: return r("911-993-turbo-s") if b == "Coupé" else None
        if "turbo" in s: return r("911-993-turbo") if b == "Coupé" else None
        if "speedster" in s: return None
        if "targa" in s: return (P + "911-993-targa", "Targa")
        if re.search(r"carrera 4s|\bc4s\b|4s", s): return r("911-993-carrera-4s") if b == "Coupé" else None
        if re.search(r"carrera 4|\bc4\b", s): return r("911-993-carrera-4")
        if re.search(r"carrera 2s|carrera s\b|\bc2s\b", s): return r("911-993-carrera-s") if b == "Coupé" else None
        if re.search(r"carrera|\b993\b|911 coupe|911 cabriolet", s) and y >= 1995: return r("911-993-carrera")
        return None
    # water-cooled 911
    if re.search(r"gt3 rs 4\.0|rs 4\.0", s): return r("911-997-2-gt3-rs-4-0") if y == 2011 else None
    if "gt2 rs" in s:
        if y in (2010, 2011): return r("911-997-2-gt2-rs")
        if 2017 <= y <= 2019: return r("911-991-2-gt2-rs")
        return None
    if "gt3 rs" in s or "gt3rs" in s:
        if 2003 <= y <= 2005: return r("911-996-2-gt3-rs")
        if 2006 <= y <= 2009: return r("911-997-1-gt3-rs")
        if 2010 <= y <= 2011: return r("911-997-2-gt3-rs")
        if 2015 <= y <= 2016: return r("911-991-1-gt3-rs")
        if 2018 <= y <= 2019: return r("911-991-2-gt3-rs")
        if y >= 2023: return r("911-992-1-gt3-rs")
        return None
    if "gt3" in s:
        if b != "Coupé" or re.search(r"gt3 r\b|gt3 rsr|gt3 cup|gt3 r ", s): return None
        if 1999 <= y <= 2001: return r("911-996-1-gt3")
        if 2003 <= y <= 2005: return r("911-996-2-gt3")
        if 2006 <= y <= 2009: return r("911-997-1-gt3")
        if 2010 <= y <= 2011: return r("911-997-2-gt3")
        if 2013 <= y <= 2016: return r("911-991-1-gt3")
        if 2017 <= y <= 2019: return r("911-991-2-gt3")
        if 2021 <= y <= 2024: return r("911-992-1-gt3")
        if y >= 2025: return r("911-992-2-gt3")
        return None
    if "gt2" in s:
        if 2001 <= y <= 2005: return r("911-996-1-gt2")
        if 2007 <= y <= 2009: return r("911-997-1-gt2")
        return None
    if re.search(r"\br\b", s) and y == 2016 and "911 r" in s: return r("911-991-1-r")
    if "sport classic" in s:
        if y in (2010, 2011): return r("911-997-2-sport-classic")
        if y in (2022, 2023, 2024): return r("911-992-1-sport-classic")
        return None
    if "s/t" in s and y >= 2023: return r("911-992-1-s-t")
    if "dakar" in s and y >= 2023: return r("911-992-1-dakar")
    if "speedster" in s:
        if y == 2011: return r("911-997-2-speedster")
        if y in (2019, 2020): return r("911-991-2-speedster")
        return None
    if re.search(r"50th|50 jahre|50 years", s):
        return r("911-991-1-50-jahre-edition") if y in (2013, 2014) else None
    if "turbo s" in s:
        if b == "Targa": return None
        if 2004 <= y <= 2005: return r("911-996-2-turbo-s")
        if 2011 <= y <= 2013: return r("911-997-2-turbo-s") if b == "Coupé" else None
        if 2014 <= y <= 2016: return r("911-991-1-turbo-s") if b == "Coupé" else None
        if 2017 <= y <= 2019: return r("911-991-2-turbo-s") if b == "Coupé" else None
        if 2021 <= y <= 2025: return r("911-992-1-turbo-s") if b == "Coupé" else None
        if y >= 2026: return r("911-992-2-turbo-s")
        return None
    if "turbo" in s:
        if b == "Targa" or "4s" in s: return None
        if 2000 <= y <= 2005: return r("911-996-1-turbo") if b == "Coupé" else None
        if 2007 <= y <= 2009: return r("911-997-1-turbo")
        if 2010 <= y <= 2013: return r("911-997-2-turbo")
        return None
    if "gts" in s:
        if four or b == "Targa" and y < 2025: return None
        if 2022 <= y <= 2024: return r("911-992-1-carrera-gts") if b == "Coupé" else None
        if y >= 2025 and not four: return r("911-992-2-carrera-gts")
        return None
    if re.search(r"carrera t\b", s):
        return r("911-991-2-carrera-t") if y in (2018, 2019) and b == "Coupé" else None
    if four and re.search(r"carrera 4s|\b4s\b", s) and 2002 <= y <= 2005 and b in ("Coupé", "Cabriolet"): return r("911-996-2-carrera-4s")
    if four: return None
    if "targa" in s:
        return r("911-996-2-targa") if 2002 <= y <= 2005 else None
    if re.search(r"carrera s\b", s):
        if 2005 <= y <= 2008: return r("911-997-1-carrera-s")
        if 2009 <= y <= 2012: return r("911-997-2-carrera-s")
        if 2012 <= y <= 2016: return r("911-991-1-carrera-s")
        if 2017 <= y <= 2019: return r("911-991-2-carrera-s")
        if 2020 <= y <= 2024: return r("911-992-1-carrera-s")
        if y >= 2025: return r("911-992-2-carrera-s") if b != "Targa" else None
        return None
    if re.search(r"carrera\b|911 coupe|911 cabriolet", s):
        if 1999 <= y <= 2001: return r("911-996-1-carrera")
        if 2002 <= y <= 2004: return r("911-996-2-carrera")
        return None
    return None

def mid(y, s, b):
    """Boxster, Cayman, 718."""
    s = " " + s + " "
    if has(s, "edition", "anniversary", "design", "limited", "porsche design", "orange", "special", "chrome") and not has(s, "black edition", "25 years", "25th", "550 spyder", "550 anniversary", "rs 60", "rs60"):
        return None
    def r(v): return (P + v, "Roadster" if "boxster" in s or "spyder" in s else "Coupé")
    is718 = "718" in s or y >= 2017
    if "cayman" in s:
        if "gt4 rs" in s: return r("718-718-cayman-gt4-rs") if y >= 2022 else None
        if "gt4" in s:
            if y in (2015, 2016): return r("cayman-981-cayman-gt4")
            if 2020 <= y <= 2025: return r("718-718-cayman-gt4")
            return None
        if "gts" in s:
            if y in (2015, 2016): return r("cayman-981-cayman-gts")
            if y >= 2020 and ("4.0" in s or y >= 2021): return r("718-718-cayman-gts-4-0")
            return None
        if re.search(r"cayman r\b", s): return r("cayman-987-2-cayman-r") if y in (2011, 2012) else None
        if re.search(r"cayman s\b", s):
            if 2006 <= y <= 2008: return r("cayman-987-1-cayman-s")
            if 2009 <= y <= 2012: return r("cayman-987-2-cayman-s")
            if 2014 <= y <= 2016: return r("cayman-981-cayman-s")
            if 2017 <= y <= 2025: return r("718-718-cayman-s")
            return None
        if re.search(r"cayman(\s|$)", s) and not has(s, "gts", " t ", "style"):
            if 2007 <= y <= 2008: return r("cayman-987-1-cayman")
            if 2009 <= y <= 2012: return r("cayman-987-2-cayman")
            if 2014 <= y <= 2016: return r("cayman-981-cayman")
            if 2017 <= y <= 2025: return r("718-718-cayman")
        return None
    if "spyder rs" in s: return r("718-718-spyder-rs") if y >= 2024 else None
    if "spyder" in s and "boxster" in s and 2010 <= y <= 2012: return r("boxster-987-2-boxster-spyder")
    if "spyder" in s and ("boxster" in s or "718" in s):
        if y == 2016: return r("boxster-981-boxster-spyder")
        if 2020 <= y <= 2024 and "718" in s: return r("718-718-spyder")
    if "spyder" in s and "718" in s and 2020 <= y <= 2024: return r("718-718-spyder")
    if "boxster" in s:
        if "550" in s and y == 2004: return r("boxster-986-boxster-s-50-jahre-550-spyder")
        if has(s, "rs 60", "rs60") and y == 2008: return r("boxster-987-1-boxster-rs-60-spyder")
        if "black edition" in s and y in (2011, 2012): return r("boxster-987-2-boxster-s-black-edition")
        if has(s, "25 years", "25th", "25 jahre") and y in (2021, 2022): return r("718-718-boxster-25-jahre")
        if has(s, "edition", "anniversary", "spyder"): return None
        if "gts" in s:
            if y in (2015, 2016): return r("boxster-981-boxster-gts")
            if y >= 2020 and ("4.0" in s or y >= 2021): return r("718-718-boxster-gts-4-0")
            return None
        if re.search(r"boxster s\b", s):
            if 2000 <= y <= 2004: return r("boxster-986-boxster-s")
            if 2005 <= y <= 2008: return r("boxster-987-1-boxster-s")
            if 2009 <= y <= 2012: return r("boxster-987-2-boxster-s")
            if 2013 <= y <= 2016: return r("boxster-981-boxster-s")
            if 2017 <= y <= 2025: return r("718-718-boxster-s")
            return None
        if re.search(r"boxster(\s|$)", s) and not has(s, " t ", "gts"):
            if 1997 <= y <= 2004: return r("boxster-986-boxster")
            if 2005 <= y <= 2008: return r("boxster-987-1-boxster")
            if 2009 <= y <= 2012: return r("boxster-987-2-boxster")
            if 2013 <= y <= 2016: return r("boxster-981-boxster")
            if 2017 <= y <= 2025: return r("718-718-boxster")
    return None

GEN = {"964": "964", "993": "993", "996": "996", "997": "997", "991": "991", "992": "992", "986": "986", "987": "987", "981": "981", "982": "718"}

def classify(title, note=""):
    """-> (variant_id, body, gearbox, year) or None"""
    sp = split(title)
    if not sp: return None
    pre, y, model = sp
    note = norm(note).lower()
    if note: model = model + " " + note
    full = (pre + " " + model).lower()
    s = model.lower().replace("gt3 carrera rs", "gt3 rs").replace("weissach package", "weissach")
    if re.search(r"exclusive|edition|anniversary|endurance|outlaw|prepared|competition|race|rally|recreation|modified|spec|specification|by ", note) and not re.search(r"50(th)? (years|jahre|anniversary)", note): return None
    v = race(y, s, full)
    if v: return v, ("Roadster" if has(s, "spyder", "rs 60", "rsk", "908/0", "917/") else "Coupé"), gearbox(s), y
    if any(w in full for w in EXCL) or any(w in full for w in TRACK): return None
    # strip noise tokens
    s2 = re.sub(r"\b(euro|european|rhd|row|us-spec|japanese-market|coupe|w/|with)\b", " ", s)
    res = road(y, s2.strip(), full)
    if not res: return None
    for tok, g in GEN.items():
        if re.search(r"\b" + tok + r"\b", s) and g not in res[0]: return None
    return res[0], res[1], gearbox(s), y

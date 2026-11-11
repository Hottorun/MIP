"""Build motrkt/src/data/real/paints.json from the Porsche Classic colour charts read in this session.

Hex values: from the scans (swatch median, corrected for the aged paper) where marked `scan`, otherwise an
approximation of the named colour. Names, codes and model years are as printed in the official charts.
The scans were read by hand in the browser (files.porsche.com blocks scripted downloads); raw/ holds the lists typed
from the overview PDFs, the scan measurements are inline below.

usage: python3 -I scripts/paints/build.py src/data/real/paints.json
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
B = "https://files.porsche.com/f/332100/"


def fix(hexv, paper):
    """Scan swatch -> screen colour: half white-balance against the aged paper, then a light midtone lift."""
    c = [int(hexv[i:i + 2], 16) for i in (0, 2, 4)]
    p = [int(paper[i:i + 2], 16) for i in (0, 2, 4)]
    out = []
    for a, b in zip(c, p):
        x = min(1.0, a / ((b + 255) / 2) * 0.97)
        out.append(round(255 * x ** 0.9))
    return "#" + "".join("%02x" % v for v in out)


# Off-whites sit so close to the yellowed paper that a measurement says nothing; use the named shade.
LIGHT = {"Elfenbein": "#e9dfc0", "Hell-Elfenbein": "#ede6cf", "Hellelfenbein": "#ede6cf", "Gletscherweiß": "#e6e9e2"}


def scan(rows, paper, kind="uni"):
    res = []
    for r in rows:
        code, name, hexv = r[:3]
        k = r[3] if len(r) > 3 else ("metallic" if "metall" in name.lower() else kind)
        h = "#141414" if name.lower().startswith("schwarz") else LIGHT.get(name) or fix(hexv, paper)
        res.append({"code": code, "name": name, "kind": k, "hex": h, "measured": True})
    return res


def approx(rows, kind="uni"):
    res = []
    for r in rows:
        code, name, h = r[:3]
        k = r[3] if len(r) > 3 else kind
        res.append({"code": code, "name": name, "kind": k, "hex": h})
    return res


palettes = []


def pal(**kw):
    palettes.append(kw)


# ---------------------------------------------------------------- 356
pal(id="356-1950", series="356", years=[1950, 1953], title="356, 1950–1953",
    source=B + "f9c0bb8671/356-1950-1953-colour-information-de.pdf",
    note="Die Karte ist für das Cabriolet ausgewiesen; eine eigene Coupé-Karte dieser Jahre liegt nicht vor.",
    colors=scan([("C501", "Schwarz", "010202"), ("C522", "Azurblau", "022c37"), ("C523", "Pascharot", "490203"),
                 ("C524", "Erdbeerrot", "520903"), ("C526", "Palmgrün", "123211"), ("C527", "Sandgrau", "a59366"),
                 ("C531", "Modegrau", "868065")], "e6d8c1"))
pal(id="356-1954", series="356", years=[1954, 1955], title="356, 1954",
    source=B + "dec8dfba59/356-1954-colour-information-de.pdf",
    note="Terrakotta nur für das Cabriolet.",
    colors=scan([("5401", "Schwarz", "000000"), ("5402", "Türkischrot", "490204"),
                 ("5403", "Graphit-Metalleffekt", "4a4a3c", "metallic"), ("5404", "Elfenbein", "d6c38e"),
                 ("5405", "Jadegrün-Metalleffekt", "3e4a39", "metallic"), ("5406", "Silber-Metalleffekt", "8b8775", "metallic"),
                 ("5407", "Perlgrau", "b1a486"), ("5408", "Azurblau", "012339"), ("5409", "Terrakotta", "6b381d"),
                 ("5410", "Adriablau-Metalleffekt", "76848b", "metallic")], "e6d8c1"))
pal(id="356-a", series="356", years=[1956, 1959], title="356 A, 1955–1959",
    source=B + "14ee022bc1/356-1957-colour-information-de-int.pdf",
    alsoSources=[B + "123c144314/356-1955-1956-colour-information-de-int.pdf", B + "5c44205fd8/356-1958-1959-colour-information-de-int.pdf"],
    note="Dieselbe Farbreihe steht in den Karten 1955–56, 1957 und 1958–59. 5710–5713 waren Sonderfarben gegen Aufpreis.",
    colors=scan([("5701", "Schwarz", "000000"), ("5702", "Rubinrot", "802921"), ("5703", "Meißenblau", "82929a"),
                 ("5704", "Elfenbein", "e0d0ad"), ("5705", "Fjordgrün", "40534c"), ("5706", "Silbermetallic", "999d98", "metallic"),
                 ("5707", "Aquamarinblau", "4e535a", "metallic"),
                 ("5710", "Steingrau", "897370", "sonder"), ("5711", "Orange", "824827", "sonder"),
                 ("5712", "Auratiumgrün", "6b755d", "sonder"), ("5713", "Gletscherweiß", "bfc3a7", "sonder")], "d8cec1"))
pal(id="356-b", series="356", years=[1960, 1963], title="356 B, 1960–1963",
    source=B + "de25d313ed/356-1960-1961-colour-information-de-int-fr.pdf",
    alsoSources=[B + "ceb82e5d48/356-1962-colour-information-de-int-fr.pdf"],
    note="Gleiche Farbreihe in den Karten 1960–61 und 1962. Darüber hinaus bot das Werk Sonderlackierungen aus einem eigenen Musterbuch an.",
    colors=scan([("6001", "Schiefergrau", "2e3a36"), ("6002", "Rubinrot", "6e0a0c"), ("6003", "Ätnablau", "45606d"),
                 ("6004", "Elfenbein", "f4e6d0"), ("6005", "Fjordgrün", "0f3738"), ("6006", "Silbermetallic", "abafaf", "metallic"),
                 ("6007", "Reihergrau", "cbc5b9"), ("6010", "Condorgelb", "edd57a"), ("6011", "Signalrot", "8c0305"),
                 ("6012", "Königsblau", "024567"), ("6013", "Schwarz", "000000")], "f2e8da"))
pal(id="356-c", series="356", years=[1964, 1965], title="356 C, 1963–1965",
    source=B + "581607557b/356-1964-1965-colour-information-de-int-fr.pdf",
    alsoSources=[B + "aa4dd72088/356-1963-colour-information-de-int-fr.pdf"],
    note="Gleiche Farbreihe in den Karten 1963 und 1964–65.",
    colors=scan([("6401", "Schiefergrau", "26322e"), ("6402", "Rubinrot", "6e0d10"), ("6410", "Delphingrau", "a2a7a2"),
                 ("6404", "Hell-Elfenbein", "f8eee4"), ("6412", "Baliblau", "011c30"), ("6406", "Irischgrün", "103417"),
                 ("6407", "Signalrot", "890204"),
                 ("6403", "Emailblau", "375d81", "sonder"), ("6411", "Togobraun", "2c2612", "sonder"),
                 ("6405", "Champagnergelb", "c8b571", "sonder"), ("6413", "Schwarz", "000000", "sonder")], "efe2d8"))

# ---------------------------------------------------------------- early 911 / 912
pal(id="911-1965", series="911", years=[1964, 1967], title="911 und 912, Modelljahre 1965–1967",
    source=B + "6afbd622aa/911-f-1965-1966-colour-information-de-int-fr-it.pdf",
    alsoSources=[B + "11a8c04594/911-f-1967-colour-information-de-int-fr-it.pdf"],
    note="Gleiche Farbreihe in den Karten 1965–66 und 1967.",
    colors=scan([("6601", "Schiefergrau", "283430"), ("6602", "Polorot", "75070c"), ("6603", "Golfblau", "0d3e60"),
                 ("6604", "Hell-Elfenbein", "e6e0d4"), ("6605", "Bahamagelb", "a17925"), ("6606", "Irischgrün", "19371f"),
                 ("6607", "Sandbeige", "8f7c50"), ("6608", "Agablau", "092732"), ("6609", "Schwarz", "020404")], "ebddd2"))
pal(id="911-1968", series="911", years=[1968, 1969], title="911 und 912, Modelljahre 1968–1969",
    source=B + "55bac013ce/911-f-1969-colour-information-de-int-fr-it.pdf",
    alsoSources=[B + "564ce085f4/911-f-1968-colour-information-de-int-fr-it.pdf"],
    note="Gleiche Farbreihe in den Karten 1968 und 1969.",
    colors=scan([("6801", "Schiefergrau", "1f302e"), ("6802", "Polorot", "720206"), ("6803", "Ossiblau", "003159"),
                 ("6804", "Hell-Elfenbein", "e4ded2"), ("6805", "Bahamagelb", "9e7619"), ("6806", "Irischgrün", "0c321c"),
                 ("6807", "Sandbeige", "867750"), ("6808", "Burgundrot", "2a100f"), ("6809", "Blutorange", "a72405")], "eee5d6"))
pal(id="911-1970", series="911", years=[1970, 1971], title="911, Modelljahre 1970–1971",
    source=B + "ca9f485397/911-f-1971-colour-information-de-int-fr-it.pdf",
    note="Serienfarben laut Karte 1971 (Code Targa/Coupé). Für 1970 gibt es keine eigene Karte; die Codes gelten seit 1970. "
         "Daneben lange Liste von Sonderfarben gegen Aufpreis (hier nicht einzeln aufgeführt).",
    colors=scan([("1111", "Hellelfenbein", "eae1cf"), ("1414", "Signalorange", "bf6e00"), ("1515", "Irischgrün", "12371c"),
                 ("2323", "Blutorange", "b02501"), ("1313", "Bahiarot", "880203"), ("1818", "Albertblau", "02203b"),
                 ("2020", "Pastellblau", "3880ba"), ("2424", "Burgundrot", "311616"), ("2626", "Condagrün", "3d713d")], "f4ebe2"))

# ---------------------------------------------------------------- 911 from MY1972 (overview list, per model year)
HEX72 = {
    "018": "#d2461e", "022": "#9b1b1e", "025": "#3b1f33", "114": "#f2c500", "117": "#f2d75a", "131": "#ece3c8",
    "225": "#4e9a3a", "325": "#1d2f5c", "415": "#4a2f22", "019": "#e8742a", "024": "#d0577a", "116": "#e8701a",
    "132": "#e4d7b0", "213": "#1f3d2a", "218": "#3e4a2a", "226": "#8fb25a", "227": "#6fbf6a", "326": "#2b5aa0",
    "328": "#8fc1de", "329": "#2f6f9a", "341": "#9a7fb0", "414": "#6b6a3a", "622": "#a59d86", "700": "#151515",
    "133": "#a8894f", "140": "#b39a5e", "224": "#2f5a45", "324": "#2c4a78", "330": "#5d7fa3", "925": "#b5b7b6",
    "936": "#b9bab8", "027": "#c8102e", "042": "#a51e22", "137": "#b5b23a", "156": "#ef6b1c", "336": "#1f5fa8",
    "408": "#3c2a20", "516": "#c9b48a", "908": "#eeeee6", "009": "#9e1520", "139": "#f4cf3a", "253": "#5fa35a",
    "351": "#1d2a48", "354": "#2a6aa0", "036": "#b4806e", "250": "#7f9488", "335": "#5d7fa3", "406": "#7c8790",
    "432": "#6b4130", "249": "#3e7a3a", "334": "#2c4a78", "106": "#e8b52a", "107": "#e2621f", "258": "#2d7a3a",
    "305": "#1c3fa0", "260": "#4f7f4a", "360": "#5a6f9a", "264": "#3e7a3a", "265": "#2f3d2a", "266": "#7f9488",
    "304": "#2a3f6a", "436": "#b9a582", "443": "#6b4130", "944": "#a9aaa6", "273": "#3a5a32", "274": "#4f5a33",
    "451": "#2e2420", "502": "#c9b393", "275": "#6f8a4f", "376": "#24505f", "601": "#9a7fb0", "30T": "#8aa7c4",
    "463": "#b7ad99", "464": "#6a4f36", "708": "#1c1c1e", "182": "#ece9dc", "20A": "#6fb59a", "523": "#cdb98e",
    "524": "#5a3a25", "20C": "#3d4a33", "31G": "#2a4f7a", "474": "#4a3029", "655": "#a8a9a6", "895": "#5e1d29",
    "956": "#8a8c8a", "32Z": "#b9cfe0", "661": "#4a5868", "662": "#5c5550", "810": "#6e1626", "811": "#8a3326",
    "966": "#a58a62", "347": "#1b2440", "536": "#ddcfae", "673": "#9b9b97", "492": "#6a4b35", "822": "#5b1a24",
    "33P": "#3a4f8a", "33X": "#1c2848", "33N": "#4d7d72", "539": "#d6cbb0", "961": "#6e7072", "80F": "#8c1a2b",
    "10W": "#ecdf55", "499": "#cfc2a3", "21M": "#2c9aa0", "80K": "#c8102e", "980": "#b9bbbb", "35Y": "#2f6b6a",
    "699": "#4f5b52", "40B": "#5a4030", "697": "#9fb3c6", "40D": "#3a2a22", "35V": "#1e2a4a", "36P": "#2a5a8a",
    "80D": "#5a1a33", "60M": "#d8cdb4", "548": "#ddb88e", "22C": "#2f6b55", "37B": "#6f8094", "693": "#7a7a76",
    "22D": "#5b5f63", "23F": "#5b5f63", "81L": "#6a1a24", "550": "#c9bea2", "22E": "#26372e", "40L": "#6e4428",
    "81K": "#c2a597", "38B": "#1f3f8f", "22S": "#3aa83a", "22R": "#5fc9a9", "82N": "#c41e63", "22L": "#2f3d2a",
    "37X": "#6f8eae", "37U": "#2b4fa0", "82H": "#a3282e", "92E": "#b4b7ba", "738": "#1a1a1c", "37W": "#1b2238",
    "38A": "#5b3a6b", "37Z": "#1f4a3c", "39A": "#1f4a3c", "83E": "#8a1f3d", "23I": "#2c3d2c", "38W": "#6a6f9a",
    "11V": "#f2b60a", "741": "#151515", "12G": "#f5d100", "39E": "#1f6fd0", "39D": "#6b2a5a", "39G": "#4b2f5f",
    "746": "#1a1a1c", "37E": "#3d3a6e", "39N": "#3a4f8a", "39R": "#23463a",
    # 993 / 996 / 986
    "84R": "#6e1a24", "25C": "#1f6f73", "3AR": "#1f7f8f", "3AT": "#e8e9e4", "12L": "#f0dc8a", "3AY": "#3a5f8f",
    "92T": "#b9bbbc", "3AW": "#2c4a8e", "25H": "#2a7a80", "40W": "#4a4542", "554": "#9fa48a", "747": "#151515",
    "84A": "#c8102e", "9A3": "#ecebe5", "B9A": "#f1f1ec", "1C1": "#e9c96a", "C9Z": "#1e1f22", "2A2": "#2f4030",
    "M6W": "#2f4b4a", "M7Z": "#a9acae", "1A9": "#c4401f", "3C4": "#4a3a6a", "3A9": "#2a3e78", "8A4": "#7a1a1f",
    "M3W": "#6a1520", "6A7": "#8c7f6a", "6B5": "#6e7173", "M7X": "#7d8285",
}

SPECIAL_NAMES = {"grandprixweiß": "Grand-Prix-Weiß", "GT-silber-met.": "GT-Silber-Metallic", "libelltürkis-met.": "Libellentürkis-Metallic"}


def nice(name):
    if name in SPECIAL_NAMES: return SPECIAL_NAMES[name]
    n = name.replace("-met.", "-Metallic").replace("-perlcolor", "-Perlcolor")
    n = n[0].upper() + n[1:]
    n = re.sub(r"diamant$", "diamant", n)
    return n


def overview(fn):
    """Parse a raw list: `code name system = yy,yy,...`; water-based duplicates (W…) merge into the same name."""
    out, seen = [], {}
    for line in open(os.path.join(HERE, "raw", fn), encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"): continue
        left, ys = line.split(" = ")
        code, *name, system = left.split(" ")
        name = " ".join(name)
        years = sorted({(1900 if int(y) > 50 else 2000) + int(y) for y in ys.split(",")})
        kind = "perl" if "P" in system else "metallic" if "M" in system or "diamant" in name else "uni"
        # Same name under a new code is a new paint (Indischrot 027 until 1986, 80K from 1987); only the
        # water-based re-issue of a paint (system W…) is the same colour and joins the existing entry.
        key = (nice(name), kind)
        if system.startswith("W") and key in seen:
            c = seen[key]
            c["years"] = sorted(set(c["years"]) | set(years))
            if code != c["code"]: c.setdefault("alt", []).append(code)
            continue
        c = {"code": code, "name": nice(name), "kind": kind, "hex": HEX72[code], "years": years}
        seen[key] = c
        out.append(c)
    return out


pal(id="911-1972", series="911", years=[1972, 1994], title="911, Modelljahre 1972–1994",
    source=B + "2d19c5bf99/911-g-overview-paint-colours.pdf",
    alsoSources=[B + "f447b1117b/911-f-overview-paint-colours.pdf", B + "9af0f9a8a2/964-overview-paint-colours.pdf"],
    note="Werksübersicht „Lackfarben bei Porsche-Fahrzeugen“ (911 ab 1972), je Farbe mit den Modelljahren, in denen sie angeboten wurde. "
         "Sonderfarben nach Kundenwunsch kamen hinzu.",
    perYear=True, colors=overview("911-1972-1992.txt"))
pal(id="993", series="911", years=[1994, 1998], title="993, Modelljahre 1994–1998",
    source=B + "eb66767c28/993-overview-paint-colours.pdf",
    alsoSources=[B + "0d9f79c935/993-1998-colour-information-de-int-fr-it.pdf"],
    note="Modelljahr 1998 laut Karte 1998 wie 1997.", perYear=True, colors=overview("993.txt"))
for c in palettes[-1]["colors"]:
    if 1997 in c["years"]: c["years"].append(1998)
pal(id="996", series="911", years=[1998, 2005], title="996, Modelljahre 1998–2004",
    source=B + "ec728bf5fa/996-overview-paint-colours.pdf",
    alsoSources=[B + "5b815f1a2f/996-gt2-2005-farbinformation-de.pdf"],
    note="Carrera und Turbo; GT-Modelle hatten zum Teil eine kleinere Auswahl (996 GT2 2005: 4 Uni-, 6 Metallicfarben).",
    perYear=True, colors=overview("996.txt"))
pal(id="986", series="boxster", years=[1997, 2004], title="Boxster 986, Modelljahre 1997–2004",
    source=B + "4dddf1d519/986-overview-paint-colours.pdf", perYear=True, colors=overview("986.txt"))

# ---------------------------------------------------------------- 997 / 987 (per model year, no codes in the charts read)
UNI97 = [("Schwarz", "#151515"), ("Indischrot", "#c8102e"), ("Carraraweiß", "#f1f1ec"), ("Speedgelb", "#f5d100")]
MET = {"Basaltschwarz": "#1e1f22", "Arktissilber": "#b9bbbc", "Nachtblau": "#1b2238", "Carmonarot": "#6a1520",
       "Atlasgrau": "#7d8285", "Sealgrau": "#6e7173", "Lapisblau": "#2a3e78", "Lagogrün": "#2f4b4a", "Schiefer": "#5b5f63",
       "Dunkeloliv": "#3b3f2e", "GT-Silber": "#a9acae", "Cobaltblau": "#2b4fa0", "Tannengrün": "#26372e", "Meteorgrau": "#6e7072",
       "Rubinrot": "#6a1424", "Macadamia": "#8a7a66", "Malachitgrün": "#1f5a4a", "Aquablau": "#3a8aa8", "Racinggreen": "#213a2c",
       "Cremeweiß": "#ece4cf", "Nordischgold": "#9a8456", "Dunkelblau": "#1d2a48", "Platinsilber": "#b5b3ac", "Eisblau": "#9fb7c4",
       "Amethyst": "#4b3355", "Ipanemablau": "#2f5f86"}
Y997 = {
    2005: ("Basaltschwarz Arktissilber Nachtblau Carmonarot Atlasgrau Sealgrau Lapisblau Lagogrün", "Schiefer Dunkeloliv GT-Silber Cobaltblau Tannengrün"),
    2006: ("Basaltschwarz Arktissilber Nachtblau Carmonarot Atlasgrau Sealgrau Lapisblau Tannengrün", "Schiefer Dunkeloliv GT-Silber Cobaltblau Lagogrün"),
    2007: ("Basaltschwarz Arktissilber Nachtblau Carmonarot Atlasgrau Meteorgrau Cobaltblau Tannengrün", "Schiefer Dunkeloliv GT-Silber Lapisblau Lagogrün"),
    2008: ("Basaltschwarz Arktissilber Nachtblau Rubinrot Macadamia Meteorgrau Cobaltblau Tannengrün", "Schiefer Dunkeloliv GT-Silber Atlasgrau Malachitgrün"),
    2009: ("Basaltschwarz Arktissilber Nachtblau Rubinrot Macadamia Meteorgrau Aquablau Racinggreen", "Cremeweiß Nordischgold GT-Silber Atlasgrau Malachitgrün"),
    2010: ("Basaltschwarz Arktissilber Dunkelblau Rubinrot Macadamia Meteorgrau Aquablau Racinggreen", "Cremeweiß Nordischgold GT-Silber Atlasgrau Malachitgrün"),
    2011: ("Basaltschwarz Platinsilber Dunkelblau Macadamia Eisblau Meteorgrau Aquablau Racinggreen", "Cremeweiß Rubinrot GT-Silber Amethyst"),
    2012: ("Basaltschwarz Platinsilber Dunkelblau Aquablau Macadamia Meteorgrau Ipanemablau", "Cremeweiß Racinggreen GT-Silber Amethyst Rubinrot"),
}
REF997 = {2005: "92532909f1/997-2005", 2006: "ed1808be49/997-2006", 2007: "ed95b860d3/997-2007", 2008: "316d1e1c29/997-2008",
          2009: "7f483dfd1a/997-2009", 2010: "7cbb3d06bf/997-2010", 2011: "27d5d92106/997-2011", 2012: "5dd86586ba/997-2012"}


def list997():
    """One entry per colour name; standard metallic in any year beats Sonderfarbe."""
    acc = {}
    for y, (met, sond) in Y997.items():
        for n, h in UNI97:
            acc.setdefault(n, {"name": n, "kind": "uni", "hex": h, "years": []})["years"].append(y)
        for kind, names in (("metallic", met), ("sonder", sond)):
            for n in names.split():
                full = n if n == "Cremeweiß" else n + "metallic"
                c = acc.setdefault(full, {"name": full, "kind": kind, "hex": MET[n], "years": []})
                c["years"].append(y)
                if kind == "metallic": c["kind"] = "metallic"
    return list(acc.values())


pal(id="997", series="911", years=[2005, 2012], title="997, Modelljahre 2005–2012",
    source=B + "92532909f1/997-2005-farbinformation-de.pdf",
    alsoSources=[B + v + "-farbinformation-de.pdf" for y, v in REF997.items() if y > 2005],
    note="Je Modelljahr: vier Uni-Farben, acht Metallic-Farben und Sonderfarben gegen Aufpreis (meist ebenfalls metallic). "
         "GT-Modelle hatten zum Teil eine eigene, kleinere Auswahl. Darüber hinaus Lackierung nach Kundenwunsch.",
    perYear=True, colors=list997())
pal(id="987", series="boxster", years=[2005, 2012], title="Boxster und Cayman 987, Modelljahre 2005–2012",
    source=B + "04bc804f70/cayman-2009-farbinformation-de.pdf",
    alsoSources=[B + "b35d6dc07c/cayman-2011-farbinformation-de.pdf", B + "9f6b6c6e7b/cayman-2005-farbinformation-de.pdf",
                 B + "bce53f87b5/boxster-2009-colour-information-int.pdf"],
    note="Die Cayman-Karten 2009 und 2011 nennen dieselben Farben wie der 911 (997) im selben Modelljahr; für die übrigen Jahre "
         "und den Boxster ist das übernommen, nicht einzeln geprüft. Modelljahr 2011: Arktissilber und Atlasgrau nur bis 07/2010.",
    perYear=True, confidence="medium", colors=list997())

# ---------------------------------------------------------------- 914
pal(id="914-1971", series="914", years=[1970, 1971], title="914, Modelljahre 1970–1971",
    source=B + "4fa4688cde/914-1971-colour-information-de-int-fr-it.pdf",
    note="Serienfarben laut Karte 1971 (Code 914 und 914/6); die Karte 1970 ist hier nicht ausgewertet. Sonderfarben gegen Aufpreis kamen hinzu.",
    colors=approx([("1610", "Adriablau", "#1d4f9a"), ("2910", "Zitronengelb", "#efd52a"), ("1110", "Hellelfenbein", "#f2ecdd"),
                   ("1410", "Signalorange", "#e2861a"), ("1510", "Irischgrün", "#1d4227"), ("2310", "Blutorange", "#cf3a14"),
                   ("1310", "Bahiarot", "#a2141a"), ("4310", "Weidengrün", "#7fa03a")]))
pal(id="914-1972", series="914", years=[1972, 1972], title="914, Modelljahr 1972",
    source=B + "efdd83db3f/914-1972-colour-information-de-int-fr-it.pdf",
    colors=approx([("", "Schwarz", "#151515"), ("1610", "Adriablau", "#1d4f9a"), ("1510", "Irischgrün", "#1d4227"),
                   ("4310", "Weidengrün", "#7fa03a"), ("2910", "Zitronengelb", "#efd52a"), ("1410", "Signalorange", "#e2861a"),
                   ("2310", "Blutorange", "#cf3a14"), ("1310", "Bahiarot", "#a2141a"), ("1110", "Hellelfenbein", "#f2ecdd"),
                   ("", "Silbermetallic", "#b5b7b6", "metallic"), ("", "Geminimetallic", "#5d7fa3", "metallic"),
                   ("", "Goldmetallic", "#a8894f", "metallic")]))
pal(id="914-1973", series="914", years=[1973, 1973], title="914, Modelljahr 1973",
    source=B + "850daa3cc7/914-1973-colour-information-de-int-fr-it.pdf",
    colors=approx([("", "Sonnengelb", "#f2c21a"), ("2810", "Saturngelb", "#e8cf2a"), ("1410", "Signalorange", "#e2861a"),
                   ("1310", "Bahiarot", "#a2141a"), ("", "Phönixrot", "#c42b1f"), ("", "Schwarz", "#151515"),
                   ("", "Olympiablau", "#2a5a9a"), ("", "Sambesigrün", "#3a5a2a"), ("", "Ravennagrün", "#6aa04a"),
                   ("1110", "Hellelfenbein", "#f2ecdd"), ("", "Alaskablau-Metallic", "#4a7aa0", "metallic"),
                   ("", "Silbermetallic", "#b5b7b6", "metallic")]))

# ---------------------------------------------------------------- supercars
pal(id="959", series="959", years=[1986, 1988], title="959, Modelljahr 1988",
    source=B + "f41057d632/959-1988-colour-information-de-int-fr-it.pdf",
    colors=approx([("810", "Rubinrot-Metallic", "#6e1626", "metallic"), ("691", "Graphit-Metallic", "#4a4c4e", "metallic"),
                   ("936", "Silber-Metallic", "#b9bab8", "metallic"), ("947", "Perlglanzweiß-Metallic", "#e6e3da", "metallic")]))
pal(id="carrera-gt", series="carrera-gt", years=[2003, 2006], title="Carrera GT, 2003",
    source=B + "6507a37c7e/carrera-gt-2003-farbinformation-de.pdf",
    colors=approx([("", "Schwarz", "#151515"), ("", "Indischrot", "#c8102e"), ("", "Fayencegelb", "#e9c96a"),
                   ("", "GT-Silbermetallic", "#a9acae", "metallic"), ("", "Basaltschwarzmetallic", "#1e1f22", "metallic"),
                   ("", "Sealgraumetallic", "#6e7173", "metallic")]))
pal(id="918", series="918", years=[2013, 2015], title="918 Spyder",
    source=B + "a38dc1103e/918-spyder-farbinformationen-de.pdf",
    note="Weissach-Paket zusätzlich mit Folierungen: Martini Racing Design, Salzburg Racing Design, komplett schwarz matt.",
    colors=approx([("", "Weiß", "#f2f2ee"), ("", "Schwarz", "#151515"), ("", "Racinggelb", "#f7d417"), ("", "Indischrot", "#c8102e"),
                   ("", "Rhodiumsilbermetallic", "#b9bcbd", "metallic"), ("", "Basaltschwarzmetallic", "#1e1f22", "metallic"),
                   ("", "Saphirblaumetallic", "#1e2f5a", "metallic"), ("", "Dunkelblaumetallic", "#1d2a48", "metallic"),
                   ("", "Meteorgraumetallic", "#6e7072", "metallic"), ("", "GT-Silbermetallic", "#a9acae", "metallic"),
                   ("", "Liquid Metal Silber", "#a3a6a4", "sonder"), ("", "Liquid Metal Chromblau", "#3f5f7f", "sonder")]))

# which palettes a generation (or a single variant) draws from; the variant's build years pick the right ones
SCOPE = {
    "porsche-356": ["356-1950", "356-1954", "356-a", "356-b", "356-c"],
    "porsche-911-f-modell": ["911-1965", "911-1968", "911-1970", "911-1972"],
    "porsche-911-g-modell": ["911-1972"],
    "porsche-911-964": ["911-1972"],
    "porsche-911-993": ["993"],
    "porsche-911-996-1": ["996"], "porsche-911-996-2": ["996"],
    "porsche-911-997-1": ["997"], "porsche-911-997-2": ["997"],
    "porsche-912": ["911-1965", "911-1968", "911-1972"],
    "porsche-930": ["911-1972"],
    "porsche-914": ["914-1971", "914-1972", "914-1973"],
    "porsche-boxster-986": ["986"],
    "porsche-boxster-987-1": ["987"], "porsche-boxster-987-2": ["987"],
    "porsche-cayman-987-1": ["987"], "porsche-cayman-987-2": ["987"],
    "porsche-959-959-komfort": ["959"], "porsche-959-959-sport": [], "porsche-carrera-gt": ["carrera-gt"], "porsche-918": ["918"],
}

# remarks for single variants where the charts do not tell the whole story
NOTES = {
    "porsche-356-356-speedster": "Die Karten gelten für Coupé und Cabriolet. Für den Speedster gab es daneben eigene Farben "
                                 "(laut Sports Car Market u. a. ein Speedster-Blau), die hier fehlen.",
    "porsche-959-959-sport": "Für den 959 Sport (29 Stück) liegt keine Werksfarbkarte vor; laut Stuttcars gab es ihn nur in "
                             "Grand-Prix-Weiß oder Indischrot.",
}

json.dump({"palettes": palettes, "scope": SCOPE, "notes": NOTES}, open(OUT, "w"), ensure_ascii=False, indent=1)
print(len(palettes), "palettes,", sum(len(p["colors"]) for p in palettes), "colours")

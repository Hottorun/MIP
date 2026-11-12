"""Market model: German/European market value per variant from auction results and asking prices.

usage: python3 -I model.py WORK OUT_MODEL_JSON OUT_ASKS_JSON

Evidence, each price converted to EUR at the ECB rate of its day:
  EU_AUC  auction results and documented sales in Europe (RM Sotheby's, Bonhams, Broad Arrow, Artcurial, … sold in
          EUR, GBP or CHF; hand-recorded sales and auction results of European dealers and houses)
  US_AUC  live auction results in North America (RM Sotheby's, Gooding, Broad Arrow, Mecum, … sold in USD; hand-recorded
          sales and auction results from the USA and Canada)
  US_ONL  online auctions in North America (Bring a Trailer, Cars & Bids, PCARMARKET): one platform with most of the
          records, so it is kept apart and gets its own measured offset
  EU_ASK  asking prices in Europe (Classic Trader; hand-recorded listings from mobile.de, Elferspot, Kleinanzeigen and
          dealers in scripts/market/manual/), left-hand drive only
  US_ASK  hand-recorded asking prices of dealers in the USA and Canada

Model (robust: weighted medians, the variant level a weighted interquartile mean):
  log p_i = a_v + f_g(t_i) + δ_c,k + λ_v(t) d_v(t_i) + e_i
  f_g     time index of the market segment g (kernel-weighted medians, as before)
  δ_c,k   offset of channel c against European auction results, measured per family k (classics / modern cars)
          from variants that have prices in both channels: δ(EU_AUC) = 0 by definition; asking-price offsets are
          shared by the families
  a_v     level of variant v on the European auction scale = "Marktwert Deutschland/Europa"
Each channel's observations are weighted with the inverse of its measured scatter, so noisier evidence counts less.
Indirect evidence (US prices, asking prices) is further capped by its measured bias; the US channels share one bias
term of at least US_TAU (the US market as a whole may sit apart from Europe for a given variant), so however many US
records there are, together they cannot outweigh the European evidence beyond that limit.
A value is published only with at least MIN_N observations; otherwise the variant shows its individual records only.
"""
import collections, csv, datetime as dt, glob, json, math, os, re, sys

S, OUT, OUT_ASKS = sys.argv[1], sys.argv[2], sys.argv[3]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from classify import classify  # noqa: E402
from classify import body as body_of  # noqa: E402

AS_OF = dt.date.fromisoformat(os.environ.get("MIP_AS_OF") or dt.date.today().isoformat())  # cut-off day: today unless set
MIN_N = 3          # observations needed for a published value
OWN_MIN = 12       # observations needed for an own price path
RECENCY = 2.0      # e-folding time (years) of the recency weight in the level estimate
OUT_K = 2.0        # a price farther than OUT_K x the scatter of its source from the variant's level is left out ...
OUT_MAX = 0.693    # ... and never more than a factor 2 (log 2) either way,
OUT_WIDE = 1.099   # ... or a factor 3 (log 3) for variants whose own prices scatter widely (cheap and good cars, e.g. 944)
OUT_MIN_N = 5      # below this many records only the factor-2 limit applies
EUROPE = {"DE", "AT", "CH", "NL", "BE", "LU", "FR", "IT", "ES", "PT", "GB", "IE", "DK", "SE", "NO", "FI", "PL", "CZ", "SK", "HU", "SI", "HR", "MC", "LI", "GR", "EE", "LV", "LT", "RO", "BG"}
EU_CUR = {"EUR", "GBP", "CHF", "SEK", "DKK", "NOK"}
NORTH_AMERICA = {"US", "CA"}
US_ONLINE = {"bring a trailer", "cars & bids", "cars and bids", "pcarmarket"}
CHANNELS = ["EU_AUC", "US_AUC", "US_ONL", "EU_ASK", "US_ASK"]
ASK = {"EU_ASK", "US_ASK"}                 # asking prices: offset shared by the families, not used for the time index
US = {"US_AUC", "US_ONL", "US_ASK"}        # North American channels: one shared bias term
US_TAU = 0.12      # at least 12 % (SD, log scale) between a variant's US and European level, whatever the data suggest
TAU_DEFAULT = 0.04 # bias variance (0.2 SD) of a channel with too few comparisons to measure it


def us_channel(house):
    return "US_ONL" if (house or "").strip().lower() in US_ONLINE else "US_AUC"


def tf(d):
    if isinstance(d, str): d = dt.date.fromisoformat(d)
    return d.year + (d.timetuple().tm_yday - 1) / 365.25


T = tf(AS_OF)
GRID_DATES = [dt.date(2015 + k // 12, k % 12 + 1, 1) for k in range((AS_OF.year - 2015) * 12 + AS_OF.month)] + [AS_OF]
GRID = [tf(d) for d in GRID_DATES]
def ms(d): return int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000)


def wmedian(xs, ws):
    pts = sorted(zip(xs, ws)); tot = sum(ws); acc = 0
    if tot <= 0 or not pts: return None
    for x, w in pts:
        acc += w
        if acc >= tot / 2: return x
    return pts[-1][0]


def median(xs): return wmedian(xs, [1.0] * len(xs))


def wiqm(xs, ws, p=0.25):
    """Weighted mean of the middle half (interquartile mean): as robust as the median against single extreme prices,
    but it does not jump to the edge of one cluster when a variant's prices split into cheap and good cars."""
    pts = sorted(zip(xs, ws)); tot = sum(ws)
    if tot <= 0 or not pts: return None
    lo, hi, acc, num, den = p * tot, (1 - p) * tot, 0.0, 0.0, 0.0
    for x, w in pts:
        part = max(0.0, min(acc + w, hi) - max(acc, lo))
        num += part * x; den += part; acc += w
    return num / den if den > 0 else wmedian(xs, ws)


def group(vid):
    if "rennsportwagen" in vid or "gt-rennwagen" in vid or "cup-und-clubsport" in vid: return "G"
    if "-356-" in vid or "-912-" in vid or "-914-" in vid: return "A"
    if any(k in vid for k in ("-924-", "-944-", "-968-", "-928-")): return "T"
    if any(k in vid for k in ("-930-", "-964-", "-993-", "-f-modell-", "-g-modell-")): return "B"
    if "959" in vid or vid.endswith("carrera-gt-carrera-gt") or "918" in vid: return "F"
    gt = any(k in vid for k in ["gt3", "gt2", "-r", "sport-classic", "speedster", "s-t", "dakar", "50-jahre"]) and "-911-" in vid
    if vid.endswith("-r") or gt: return "D"
    if "-911-" in vid: return "C"
    midgt = any(k in vid for k in ["gt4", "spyder", "cayman-r", "rs-60", "550-spyder", "black-edition", "25-jahre"])
    return "E2" if midgt else "E"


PARENT = {"H": "COLLECT", "A": "COLLECT", "T": "COLLECT", "B": "COLLECT", "F": "COLLECT", "G": "COLLECT", "C": "MODERN", "D": "MODERN", "E": "MODERN", "E2": "MODERN"}


# ---------------------------------------------------------------------------------------------------- FX
fx = {}
rows = list(csv.reader(open(S + "/web/fx/eurofxref-hist.csv")))
hdr = rows[0]
for r in rows[1:]:
    for cur in ("USD", "GBP", "CHF", "SEK", "DKK", "NOK", "CAD"):
        if cur in hdr and r[hdr.index(cur)] not in ("N/A", ""): fx.setdefault(cur, {})[r[0]] = float(r[hdr.index(cur)])
fxdates = {c: sorted(v) for c, v in fx.items()}


def to_eur(amount, cur, date):
    if cur == "EUR": return amount
    if cur not in fx: return None
    ds = fxdates[cur]
    import bisect
    i = bisect.bisect_right(ds, date) - 1
    return amount / fx[cur][ds[max(i, 0)]]


# ---------------------------------------------------------------------------------------------------- evidence
obs = []
# auction results (sold only)
for s in json.load(open(S + "/web/sales_all.json")):
    if not (s["sold"] and s["eur"] and s["eur"] > 500 and "2015-01-01" <= s["date"] <= AS_OF.isoformat()): continue
    ch = "EU_AUC" if (s.get("cur") in EU_CUR or (s.get("loc") or "") in EUROPE and s["house"] != "Bring a Trailer") else us_channel(s["house"])
    obs.append(dict(variant=s["variant"], date=s["date"], eur=s["eur"], ch=ch, house=s["house"], lot=s["lot"], body=s.get("body"), src="auction"))

def norm_body(b):
    """Classic Trader body labels ("Cabriolet (Targa)", "Coupé (Rennwagen)") -> Coupé, Cabriolet, Targa or Roadster."""
    if not b: return None
    if "Targa" in b: return "Targa"
    if "Roadster" in b or "Speedster" in b: return "Roadster"
    return "Cabriolet" if b.startswith("Cabrio") else "Coupé" if b.startswith("Coup") else b


# asking prices: keep each listing once (its latest snapshot), dated the last day it was seen
asks_raw = json.load(open(S + "/web/asks.json")) if os.path.exists(S + "/web/asks.json") else []
latest = {}
for a in asks_raw:
    if a["id"] not in latest or a["day"] > latest[a["id"]]["day"]: latest[a["id"]] = a
asks = []
for a in latest.values():
    if not a.get("variant") or a.get("rhd") or (a.get("country") or "") not in EUROPE: continue
    eur = to_eur(a["price"], a["cur"] or "EUR", a["day"])
    if not eur: continue
    asks.append(dict(id=a["id"], variant=a["variant"], date=a["day"], eur=round(eur), price=a["price"], cur=a["cur"], km=a.get("km"), year=a["year"],
                     title="Porsche %s" % a["model"], seller=a["seller"], sellerName=a.get("sellerName"), country=a["country"], body=norm_body(a.get("body")),
                     url=a["url"], source="Classic Trader", excluded=a.get("flag"), note=a.get("flagText"), img=a.get("img") or None, ch="EU_ASK"))

# hand-recorded listings, sales and auction results (mobile.de, Elferspot, Kleinanzeigen, dealers and auction houses in
# Europe and North America): scripts/market/manual/*.csv. Routed by country (land) and kind (art):
#   Europe:        Verkauf / Auktion -> EU_AUC,   Angebot -> EU_ASK
#   USA / Canada:  Verkauf / Auktion -> US_AUC (US_ONL for Bring a Trailer, Cars & Bids, PCARMARKET),   Angebot -> US_ASK
# Other countries are listed in the console and not used (no reference for their price level yet).
other_land = collections.Counter()
# the dealers' own photos of these cars (dealerphotos.py): {listing url: [image url, ...]}
dealer_photos = json.load(open(S + "/web/dealerphotos.json")) if os.path.exists(S + "/web/dealerphotos.json") else {}
for fn in sorted(glob.glob(os.path.join(HERE, "manual", "*.csv"))):
    for i, r in enumerate(csv.DictReader(open(fn, encoding="utf-8"), delimiter=";")):
        if not r.get("datum") or not r.get("preis"): continue
        vid = (r.get("variant_id") or "").strip()
        if not vid:
            c = classify("%s Porsche %s" % (r["baujahr"], r["fahrzeug"]))
            if not c: continue
            vid = c[0]
        eur = to_eur(float(r["preis"]), (r.get("waehrung") or "EUR").strip(), r["datum"])
        if not eur:
            other_land["Währung " + (r.get("waehrung") or "").strip()] += 1; continue
        row = dict(id="M-%s-%d" % (os.path.basename(fn).split(".")[0], i), variant=vid, date=r["datum"], eur=round(eur), price=float(r["preis"]),
                   cur=r.get("waehrung") or "EUR", km=int(r["km"]) if (r.get("km") or "").isdigit() else None, year=int(r["baujahr"]),
                   title="Porsche %s" % r["fahrzeug"], seller=r.get("anbieter") or "", sellerName=None, country=(r.get("land") or "DE").upper(),
                   body=body_of(("%s %s" % (r["fahrzeug"], r.get("url") or "")).lower()), url=r.get("url") or "", source=r.get("quelle") or "manuell", excluded=None, note=None,
                   img=dealer_photos.get((r.get("url") or "").strip()) or None)
        land = row["country"]
        if land not in EUROPE and land not in NORTH_AMERICA:
            other_land[land] += 1; continue
        art = (r.get("art") or "Angebot").strip().lower()
        if art.startswith("verkauf") or art.startswith("auktion"):
            ch = "EU_AUC" if land in EUROPE else us_channel(row["source"])
            obs.append(dict(variant=vid, date=r["datum"], eur=row["eur"], ch=ch, house=row["source"], lot=row["id"], body=None, src="manual"))
        else:
            asks.append(dict(row, ch="EU_ASK" if land in EUROPE else "US_ASK"))
if other_land: print("manual rows not used (outside Europe and North America, or currency without ECB rate):", dict(other_land))

# one car listed twice (re-listed after a price cut, or by two dealers): same variant, build year, country and
# mileage. Keep the newest listing (highest id within a source = listed last), i.e. the current asking price.
seen, uniq = {}, []
for a in sorted(asks, key=lambda a: (a["date"], str(a["id"]).zfill(12)), reverse=True):
    key = (a["variant"], a["year"], a["country"], a["km"]) if a["km"] else ("id", a["id"])
    if key in seen: continue
    seen[key] = True
    uniq.append(a)
print("asks", len(asks), "after removing duplicate cars", len(uniq))
asks = uniq

# listings that are no genuine complete car of the variant (replica, conversion, project, accident damage; see
# ctparse.py) are shown in the app but do not enter the value
for a in asks:
    if a.get("excluded"): continue
    obs.append(dict(variant=a["variant"], date=a["date"], eur=a["eur"], ch=a["ch"], house=a["source"], lot=a["id"], body=a.get("body"), src="ask"))

# de-duplicate auction results reported twice (same variant, price within 0.5 %, within 10 days)
obs.sort(key=lambda s: (s["variant"], s["date"]))
ded = []
for s in obs:
    dup = s["src"] == "auction" and next((o for o in reversed(ded[-6:]) if o["src"] == "auction" and o["variant"] == s["variant"]
                                          and abs(tf(o["date"]) - tf(s["date"])) < 10 / 365 and abs(o["eur"] / s["eur"] - 1) < 0.005), None)
    if not dup: ded.append(s)
obs = ded
for s in obs:
    s["t"] = tf(s["date"]); s["y"] = math.log(s["eur"])

# High-priced 356 / air-cooled 911 variants move like the top of the market: own index "H"
_m = collections.defaultdict(list)
for s in obs:
    if s["ch"] not in US: _m[s["variant"]].append(s["eur"])
for s in obs:
    if s["variant"] not in _m: _m[s["variant"]].append(s["eur"])
HIGH = {v for v, x in _m.items() if group(v) in ("A", "B") and median(x) > 250000}
def tier(v): return "H" if v in HIGH else group(v)
def family(v): return PARENT[tier(v)]
for s in obs: s["g"] = tier(s["variant"]); s["k"] = family(s["variant"])
byv = collections.defaultdict(list)
for s in obs: byv[s["variant"]].append(s)


# ---------------------------------------------------------------------------------------------------- time index
def smooth(pts, grid, h0, min_w):
    out = []
    for m in grid:
        h = h0
        while True:
            ks = [(r, w * math.exp(-0.5 * ((t - m) / h) ** 2)) for t, r, w in pts if abs(t - m) < 3 * h]
            if sum(k for _, k in ks) >= min_w or h > 3: break
            h *= 1.4
        out.append(wmedian([r for r, _ in ks], [k for _, k in ks]) if ks else None)
    last = None
    for i, x in enumerate(out):
        if x is None: out[i] = last
        else: last = x
    first = next((x for x in out if x is not None), 0.0)
    return [first if x is None else x for x in out]


def interp(grid, vals, t):
    if t <= grid[0]: return vals[0]
    if t >= grid[-1]: return vals[-1]
    lo, hi = 0, len(grid) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if grid[mid] <= t: lo = mid
        else: hi = mid
    a = (t - grid[lo]) / (grid[hi] - grid[lo])
    return vals[lo] * (1 - a) + vals[hi] * a


def fit_index(ss, adj, iters=8, h=0.25):
    """ss: auction observations; adj(s): channel offset removed from log price."""
    f = [0.0] * len(GRID); a = {}
    keep = list(ss)
    for it in range(iters):
        vs = collections.defaultdict(list)
        for s in keep: vs[s["variant"]].append(s)
        for v, l in vs.items():
            a[v] = median([s["y"] - adj(s) - interp(GRID, f, s["t"]) for s in l])
        f = smooth([(s["t"], s["y"] - adj(s) - a[s["variant"]], 1.0) for s in keep], GRID, h, 15)
        f = [x - f[-1] for x in f]
        if it >= 1:
            keep = [s for s in ss if s["variant"] in a and abs(s["y"] - adj(s) - a[s["variant"]] - interp(GRID, f, s["t"])) < 1.0]
    return f


MIN_IDX = {"F": 150, "G": 150, "H": 300}; BW = {"F": 0.5, "G": 1.0, "H": 0.5}


def fit_all(delta):
    adj = lambda s: delta[s["k"]][s["ch"]]
    auc = [s for s in obs if s["ch"] not in ASK]
    idx = {}
    for name, members in [("COLLECT", {"A", "T", "B", "H", "F", "G"}), ("MODERN", {"C", "D", "E", "E2"})] + [(g, {g}) for g in ["A", "T", "B", "H", "C", "D", "E", "E2", "F", "G"]]:
        ss = [s for s in auc if s["g"] in members]
        if len(ss) >= MIN_IDX.get(name, 400) or name in ("COLLECT", "MODERN"):
            idx[name] = fit_index(ss, adj, h=BW.get(name, 0.25))
    return idx


def index_of(g, idx): return idx[g] if g in idx else idx[PARENT[g]]


# ---------------------------------------------------------------------------------------------------- channel offsets
def channel_offsets(idx, delta):
    """Within-variant comparison of channels: median residual per variant and channel, pairwise differences pooled
    over variants (weighted median), then δ solved by weighted least squares with δ(EU_AUC) = 0."""
    stats = collections.defaultdict(dict)   # variant -> ch -> (median residual, n)
    for v, l in byv.items():
        f = index_of(l[0]["g"], idx)
        res = [(s["ch"], s["y"] - interp(GRID, f, s["t"])) for s in l if s["t"] >= T - 5]
        if not res: continue
        center = median([r for _, r in res])
        res = [(c, r) for c, r in res if abs(r - center) < 1.0]
        for c in CHANNELS:
            xs = [r for cc, r in res if cc == c]
            if len(xs) >= 2: stats[v][c] = (median(xs), len(xs))

    PAIRS = [(c1, c2) for i, c2 in enumerate(CHANNELS) for c1 in CHANNELS[i + 1:]]
    FREE = [c for c in CHANNELS if c != "EU_AUC"]
    PER_FAMILY = [c for c in FREE if c not in ASK]   # auction offsets per family, asking-price offsets shared

    def pairs(k):
        out = {}
        for c1, c2 in PAIRS:
            ds, ws = [], []
            for v, st in stats.items():
                if (k and family(v) != k) or c1 not in st or c2 not in st: continue
                (m1, n1), (m2, n2) = st[c1], st[c2]
                ds.append(m1 - m2); ws.append(1 / (1 / n1 + 1 / n2))
            if len(ds) >= 4: out[(c1, c2)] = (wmedian(ds, ws), sum(ws), len(ds))
        return out

    def solve(fam_pairs):
        """Joint weighted least squares over the families: auction offsets per family (the US market runs hotter for
        modern collector cars than for classics), asking-price offsets shared (the gap between asking and achieved
        price belongs to the way of selling, not to the model line). One equation per measured pair and family:
        δ(c1) - δ(c2) ≈ P(c1 - c2), with δ(EU_AUC) = 0."""
        ks = list(fam_pairs)
        col = {}
        for k in ks:
            for c in PER_FAMILY: col[(k, c)] = len(col)
        for c in FREE:
            if c in ASK: col[c] = len(col)
        nu = len(col)
        def ix(k, c): return None if c == "EU_AUC" else col[c] if c in ASK else col[(k, c)]
        A = [[0.0] * nu for _ in range(nu)]; b = [0.0] * nu
        for k in ks:
            for (c1, c2), (d, w, _) in fam_pairs[k].items():
                x = [0.0] * nu
                if ix(k, c1) is not None: x[ix(k, c1)] += 1
                if ix(k, c2) is not None: x[ix(k, c2)] -= 1
                for r in range(nu):
                    b[r] += w * x[r] * d
                    for c in range(nu): A[r][c] += w * x[r] * x[c]
        for r in range(nu):                    # tiny ridge: a channel without comparisons gets δ = 0 instead of a singular system
            A[r][r] += 1e-6
        # Gaussian elimination
        M = [row[:] + [b[r]] for r, row in enumerate(A)]
        for c in range(nu):
            piv = max(range(c, nu), key=lambda r: abs(M[r][c]))
            M[c], M[piv] = M[piv], M[c]
            for r in range(nu):
                if r != c and M[c][c]:
                    f = M[r][c] / M[c][c]
                    M[r] = [a - f * bb for a, bb in zip(M[r], M[c])]
        sol = [M[r][-1] / M[r][r] for r in range(nu)]
        return {k: {c: 0.0 if c == "EU_AUC" else sol[ix(k, c)] for c in CHANNELS} for k in ks}

    fam = {}
    pooled = pairs(None)
    for k in ("COLLECT", "MODERN"):
        p = pairs(k)
        # a family-specific channel without any comparison in this family borrows the comparisons of all variants
        for c in PER_FAMILY:
            if not any(c in key for key in p):
                p.update({key: x for key, x in pooled.items() if c in key and key not in p})
        fam[k] = p
    out = solve(fam)
    info = {k: {"pairs": {"%s-%s" % key: [round(d, 4), n] for key, (d, _, n) in fam[k].items()}, "own": True} for k in fam}
    return out, info, stats


def channel_bias(stats, delta, sd):
    """Between-variant spread of each channel's offset (tau^2): how far a single variant's US or asking-price level may
    sit from its European auction level beyond sampling noise. Measured from the pairwise differences; this caps how
    much indirect evidence can move a variant's value, however many such prices there are."""
    pv = {}
    for i, c2 in enumerate(CHANNELS):
        for c1 in CHANNELS[i + 1:]:
            dev, noise = [], []
            for v, st in stats.items():
                if c1 not in st or c2 not in st or st[c1][1] < 3 or st[c2][1] < 3: continue
                k = family(v)
                dev.append(st[c1][0] - st[c2][0] - (delta[k][c1] - delta[k][c2]))
                noise.append(math.pi / 2 * (sd[c1] ** 2 / st[c1][1] + sd[c2] ** 2 / st[c2][1]))
            if len(dev) >= 6:
                mad = 1.4826 * median([abs(x - median(dev)) for x in dev])
                pv[(c1, c2)] = (max(0.0, mad ** 2 - sum(noise) / len(noise)), len(dev))
    # each channel's bias against European auction results: measured directly where possible, otherwise through a
    # channel whose bias is already known (the pair variance is the sum of both), otherwise TAU_DEFAULT
    tau = {"EU_AUC": 0.0}
    tau.update({c1: x for (c1, c2), (x, _) in pv.items() if c2 == "EU_AUC"})
    for _ in range(len(CHANNELS)):
        for c in CHANNELS:
            if c in tau: continue
            via = [(max(0.0, pv[key][0] - tau[o]), pv[key][1]) for o in tau for key in ((c, o), (o, c)) if key in pv]
            if via: tau[c] = max(via, key=lambda x: x[1])[0]
    for c in CHANNELS:
        tau.setdefault(c, TAU_DEFAULT)
        if c in US: tau[c] = max(tau[c], US_TAU ** 2)
    return tau, {"%s-%s" % k: [round(v, 4), n] for k, (v, n) in pv.items()}


delta = {k: {c: 0.0 for c in CHANNELS} for k in ("COLLECT", "MODERN")}
for it in range(3):
    idx = fit_all(delta)
    delta, dinfo, cstats = channel_offsets(idx, delta)
    print("iteration", it, {k: {c: round(v, 3) for c, v in d.items()} for k, d in delta.items()}, flush=True)

# measured scatter per channel (robust SD of residuals around the variant's median) -> evidence weights
scat = collections.defaultdict(list)
for v, l in byv.items():
    f = index_of(l[0]["g"], idx)
    r = [(s["ch"], s["y"] - interp(GRID, f, s["t"]) - delta[s["k"]][s["ch"]]) for s in l]
    if len(r) < 4: continue
    c0 = median([x for _, x in r])
    for c, x in r:
        if abs(x - c0) < 1.0: scat[c].append(abs(x - c0))
SD = {c: max(0.05, 1.4826 * median(xs)) for c, xs in scat.items() if xs}
for c in CHANNELS: SD.setdefault(c, 0.3)
WCH = {c: (SD["EU_AUC"] / SD[c]) ** 2 for c in CHANNELS}
print("scatter", {c: round(x, 3) for c, x in SD.items()}, "weights", {c: round(x, 2) for c, x in WCH.items()})
TAU2, tauinfo = channel_bias(cstats, delta, SD)
print("bias variance", {c: round(x, 4) for c, x in TAU2.items()}, tauinfo)

# ---------------------------------------------------------------------------------------------------- variants
result = {"asOf": AS_OF.isoformat(), "grid": [ms(d) for d in GRID_DATES], "variants": {}, "index": {k: [round(x, 4) for x in v] for k, v in idx.items()},
          "total": len(obs), "channels": dict(collections.Counter(s["ch"] for s in obs)),
          "sources": dict(collections.Counter(s["house"] for s in obs).most_common()),
          "offsets": {k: {c: round(v, 4) for c, v in d.items()} for k, d in delta.items()}, "offsetPairs": dinfo,
          "scatter": {c: round(x, 4) for c, x in SD.items()}, "bias": {c: round(math.sqrt(x), 4) for c, x in TAU2.items()}, "biasPairs": tauinfo, "minN": MIN_N}
excluded_all = []
for v, l in byv.items():
    g = l[0]["g"]; gi = g if g in idx else PARENT[g]; f = idx[gi]; k = l[0]["k"]
    base = [s["y"] - interp(GRID, f, s["t"]) - delta[k][s["ch"]] for s in l]
    # Implausible prices, too high or too low: farther from the variant's level (time-adjusted, channel gap removed)
    # than OUT_K times the measured scatter of their source, or of the variant itself when its prices scatter more
    # (a market of cheap and good cars: judged by the source alone, the good cars would be cut and the level pulled
    # down). Two passes, so that one extreme price does not move the level the others are judged by. With few
    # records only the hard limit applies (factor 2 either way).
    keep = list(zip(l, base))
    c0 = median(base)
    sdv = 1.4826 * median([abs(b - c0) for b in base]) if len(l) >= OWN_MIN else 0.0
    for _ in range(2):
        a = median([b for _, b in keep])
        lim = lambda s: min(OUT_K * max(SD[s["ch"]], sdv), max(OUT_MAX, min(OUT_WIDE, OUT_K * sdv))) if len(keep) >= OUT_MIN_N else OUT_MAX
        keep = [(s, b) for s, b in zip(l, base) if abs(b - a) <= lim(s)]
        if not keep: keep = list(zip(l, base)); break
    kept_ids = {id(s) for s, _ in keep}
    out_v = [{"id": s["lot"], "eur": s["eur"], "dev": round(math.exp(b - a) - 1, 3), "ch": s["ch"]} for s, b in zip(l, base) if id(s) not in kept_ids]
    excluded_all.extend(dict(x, variant=v) for x in out_v)
    n = len(keep)
    # level per channel (recency-weighted only for large samples), then combined by precision
    mc, prec = {}, {}
    for c in CHANNELS:
        xs = [(s, b) for s, b in keep if s["ch"] == c]
        if not xs: continue
        # recent prices count most (weight halves about every 1.4 years); older ones still help via the time index
        mc[c] = wiqm([b for _, b in xs], [math.exp(-(T - s["t"]) / RECENCY) for s, _ in xs])
        prec[c] = 1 / (math.pi / 2 * SD[c] ** 2 / len(xs) + TAU2[c] - (US_TAU ** 2 if c in US else 0.0))
    # the US channels share one bias term (US_TAU^2): their combined precision is S / (1 + US_TAU^2 S), so all US
    # evidence together never counts more than 1 / US_TAU^2, however many US records there are
    S_us = sum(p for c, p in prec.items() if c in US)
    for c in prec:
        if c in US: prec[c] /= 1 + US_TAU ** 2 * S_us
    a = sum(mc[c] * prec[c] for c in mc) / sum(prec.values())
    share = {c: round(prec[c] / sum(prec.values()), 3) for c in mc}
    keep = [(s, b - mc[s["ch"]] + a) for s, b in keep]   # each channel centred on the combined level
    d = [0.0] * len(GRID); lam = [0.0] * len(GRID)
    if n >= OWN_MIN:
        pts = [(s["t"], b - a, WCH[s["ch"]]) for s, b in keep]
        d = smooth(pts, GRID, 0.6, 8)
        for i, m in enumerate(GRID):
            ws = [w * math.exp(-0.5 * ((t - m) / 0.6) ** 2) for t, _, w in pts]
            neff = (sum(ws) ** 2 / sum(x * x for x in ws)) if sum(ws) > 0 else 0
            lam[i] = neff / (neff + 10)
    adjv = [a + lam[i] * d[i] for i in range(len(GRID))]
    series = [math.exp(f[i] + adjv[i]) for i in range(len(GRID))]
    dd = [lam[i] * d[i] for i in range(len(GRID))]
    tadj = sorted(math.exp(b - interp(GRID, dd, s["t"]) + adjv[-1] - a + f[-1]) for s, b in keep if s["t"] >= T - 3)
    q = lambda p: tadj[min(len(tadj) - 1, int(p * len(tadj)))] if tadj else None
    res = {s["lot"]: b - interp(GRID, dd, s["t"]) - a for s, b in keep}
    def eff(key):
        lv = collections.defaultdict(list)
        for s, _ in keep:
            if s.get(key): lv[s[key]].append(res[s["lot"]])
        allr = [r for xs in lv.values() for r in xs]
        if len(lv) < 2: return {}
        med_all = median(allr)
        return {kk: [round(math.exp(median(xs) - med_all) - 1, 3), len(xs)] for kk, xs in lv.items() if len(xs) >= 6}
    chn = collections.Counter(s["ch"] for s, _ in keep)
    ok = n >= MIN_N
    result["variants"][v] = {
        "value": round(series[-1]) if ok else None, "n": n, "n12": sum(1 for s, _ in keep if s["t"] >= T - 1), "n24": sum(1 for s, _ in keep if s["t"] >= T - 2),
        "ch": {c: chn.get(c, 0) for c in CHANNELS}, "share": share,
        "chLevel": {c: round(math.exp(mc[c] + delta[k][c] + f[-1] + dd[-1])) for c in mc},
        "lo": round(q(0.25)) if ok and len(tadj) >= 6 else None, "hi": round(q(0.75)) if ok and len(tadj) >= 6 else None,
        "first": min(s["date"] for s, _ in keep), "last": max(s["date"] for s, _ in keep), "index": gi, "family": k,
        "own": n >= OWN_MIN, "houses": dict(collections.Counter(s["house"] for s, _ in keep).most_common()),
        "gearbox": {}, "body": eff("body") if ok else {},
        "series": [round(x) for x in series] if ok else None,
        "out": out_v,
    }
for v, _ in json.load(open(os.path.join(HERE, "variant_ids.json"))):
    if v not in result["variants"]:
        g = tier(v); result["variants"][v] = {"value": None, "n": 0, "index": g if g in idx else PARENT[g], "family": family(v), "ch": {c: 0 for c in CHANNELS}}
result["variants"] = dict(sorted(result["variants"].items()))
json.dump(result, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))

# asks used, for the evidence list in the app (newest first)
known = {v for v, _ in json.load(open(os.path.join(HERE, "variant_ids.json")))}
price_out = {x["id"]: x for x in excluded_all if x["ch"] in ASK}
for a in asks:
    if not a.get("excluded") and a["id"] in price_out:
        d = price_out[a["id"]]["dev"]
        a["excluded"] = "Preis %d %% %s dem Niveau vergleichbarer Fahrzeuge" % (round(abs(d) * 100), "über" if d > 0 else "unter")
asks = sorted((a for a in asks if a["variant"] in known), key=lambda a: (a["variant"], -a["eur"]))
json.dump([{k: a.get(k) for k in ("id", "variant", "date", "eur", "price", "cur", "km", "year", "title", "body", "seller", "sellerName", "country", "url", "source", "excluded", "note", "img")} for a in asks],
          open(OUT_ASKS, "w"), ensure_ascii=False, separators=(",", ":"))
print("price outliers left out:", collections.Counter(x["ch"] for x in excluded_all), "listings flagged by text:", sum(1 for a in asks if a.get("excluded") and not a["id"] in price_out))
print(sum(1 for x in result["variants"].values() if x["value"]), "variants with a value;", len(obs), "observations;", result["channels"])

"""Market model: German/European market value per variant from auction results and asking prices.

usage: python3 -I model.py WORK OUT_MODEL_JSON OUT_ASKS_JSON

Evidence, each price converted to EUR at the ECB rate of its day:
  EU_AUC  auction results in Europe (RM Sotheby's, Bonhams, Broad Arrow, Artcurial, … sold in EUR, GBP or CHF)
  US_AUC  auction results in North America (Bring a Trailer, RM Sotheby's, Gooding, … sold in USD)
  EU_ASK  asking prices in Europe (Classic Trader; hand-recorded listings from mobile.de, Elferspot, Kleinanzeigen
          in scripts/market/manual/), left-hand drive only

Model (robust, all steps are weighted medians):
  log p_i = a_v + f_g(t_i) + δ_c,k + λ_v(t) d_v(t_i) + e_i
  f_g     time index of the market segment g (kernel-weighted medians, as before)
  δ_c,k   offset of channel c against European auction results, measured per family k (classics / modern cars)
          from variants that have prices in both channels: δ(EU_AUC) = 0 by definition
  a_v     level of variant v on the European auction scale = "Marktwert Deutschland/Europa"
Each channel's observations are weighted with the inverse of its measured scatter, so noisier evidence counts less.
A value is published only with at least MIN_N observations; otherwise the variant shows its individual records only.
"""
import collections, csv, datetime as dt, glob, json, math, os, re, sys

S, OUT, OUT_ASKS = sys.argv[1], sys.argv[2], sys.argv[3]
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from classify import classify  # noqa: E402

AS_OF = dt.date(2026, 11, 9)
MIN_N = 3          # observations needed for a published value
OWN_MIN = 12       # observations needed for an own price path
RECENCY = 2.0      # e-folding time (years) of the recency weight in the level estimate
OUT_K = 2.0        # a price farther than OUT_K x the scatter of its source from the variant's level is left out ...
OUT_MAX = 0.693    # ... and never more than a factor 2 (log 2) either way
OUT_MIN_N = 5      # below this many records only the factor-2 limit applies
EUROPE = {"DE", "AT", "CH", "NL", "BE", "LU", "FR", "IT", "ES", "PT", "GB", "IE", "DK", "SE", "NO", "FI", "PL", "CZ", "SK", "HU", "SI", "HR", "MC", "LI", "GR", "EE", "LV", "LT", "RO", "BG"}
EU_CUR = {"EUR", "GBP", "CHF", "SEK", "DKK", "NOK"}
CHANNELS = ["EU_AUC", "US_AUC", "EU_ASK"]


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


def group(vid):
    if "rennsportwagen" in vid or "gt-rennwagen" in vid or "cup-und-clubsport" in vid: return "G"
    if "-356-" in vid or "-912-" in vid or "-914-" in vid: return "A"
    if any(k in vid for k in ("-930-", "-964-", "-993-", "-f-modell-", "-g-modell-")): return "B"
    if "959" in vid or vid.endswith("carrera-gt-carrera-gt") or "918" in vid: return "F"
    gt = any(k in vid for k in ["gt3", "gt2", "-r", "sport-classic", "speedster", "s-t", "dakar", "50-jahre"]) and "-911-" in vid
    if vid.endswith("-r") or gt: return "D"
    if "-911-" in vid: return "C"
    midgt = any(k in vid for k in ["gt4", "spyder", "cayman-r", "rs-60", "550-spyder", "black-edition", "25-jahre"])
    return "E2" if midgt else "E"


PARENT = {"H": "COLLECT", "A": "COLLECT", "B": "COLLECT", "F": "COLLECT", "G": "COLLECT", "C": "MODERN", "D": "MODERN", "E": "MODERN", "E2": "MODERN"}


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
    ch = "EU_AUC" if (s.get("cur") in EU_CUR or (s.get("loc") or "") in EUROPE and s["house"] != "Bring a Trailer") else "US_AUC"
    obs.append(dict(variant=s["variant"], date=s["date"], eur=s["eur"], ch=ch, house=s["house"], lot=s["lot"], body=s.get("body"), src="auction"))

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
                     title="Porsche %s" % a["model"], seller=a["seller"], sellerName=a.get("sellerName"), country=a["country"], body=a.get("body"),
                     url=a["url"], source="Classic Trader", excluded=a.get("flag"), note=a.get("flagText")))

# hand-recorded listings and sales (mobile.de, Elferspot, Kleinanzeigen, dealers): scripts/market/manual/*.csv
for fn in sorted(glob.glob(os.path.join(HERE, "manual", "*.csv"))):
    for i, r in enumerate(csv.DictReader(open(fn, encoding="utf-8"), delimiter=";")):
        if not r.get("datum") or not r.get("preis"): continue
        vid = (r.get("variant_id") or "").strip()
        if not vid:
            c = classify("%s Porsche %s" % (r["baujahr"], r["fahrzeug"]))
            if not c: continue
            vid = c[0]
        eur = to_eur(float(r["preis"]), (r.get("waehrung") or "EUR").strip(), r["datum"])
        if not eur: continue
        row = dict(id="M-%s-%d" % (os.path.basename(fn).split(".")[0], i), variant=vid, date=r["datum"], eur=round(eur), price=float(r["preis"]),
                   cur=r.get("waehrung") or "EUR", km=int(r["km"]) if (r.get("km") or "").isdigit() else None, year=int(r["baujahr"]),
                   title="Porsche %s" % r["fahrzeug"], seller=r.get("anbieter") or "", sellerName=None, country=(r.get("land") or "DE").upper(),
                   body=None, url=r.get("url") or "", source=r.get("quelle") or "manuell", excluded=None, note=None)
        if (r.get("art") or "Angebot").lower().startswith("verkauf"):
            obs.append(dict(variant=vid, date=r["datum"], eur=row["eur"], ch="EU_AUC", house=row["source"], lot=row["id"], body=None, src="manual"))
        else:
            asks.append(row)

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
    obs.append(dict(variant=a["variant"], date=a["date"], eur=a["eur"], ch="EU_ASK", house=a["source"], lot=a["id"], body=a.get("body"), src="ask"))

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
    if s["ch"] != "US_AUC": _m[s["variant"]].append(s["eur"])
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
    auc = [s for s in obs if s["ch"] != "EU_ASK"]
    idx = {}
    for name, members in [("COLLECT", {"A", "B", "H", "F", "G"}), ("MODERN", {"C", "D", "E", "E2"})] + [(g, {g}) for g in ["A", "B", "H", "C", "D", "E", "E2", "F", "G"]]:
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

    def pairs(k):
        out = {}
        for c1, c2 in [("US_AUC", "EU_AUC"), ("EU_ASK", "EU_AUC"), ("EU_ASK", "US_AUC")]:
            ds, ws = [], []
            for v, st in stats.items():
                if (k and family(v) != k) or c1 not in st or c2 not in st: continue
                (m1, n1), (m2, n2) = st[c1], st[c2]
                ds.append(m1 - m2); ws.append(1 / (1 / n1 + 1 / n2))
            if len(ds) >= 4: out[(c1, c2)] = (wmedian(ds, ws), sum(ws), len(ds))
        return out

    def solve(fam_pairs):
        """Joint weighted least squares over the families: δ(US_AUC) per family (the US market runs hotter for modern
        collector cars than for classics), δ(EU_ASK) shared (the gap between asking and achieved price belongs to the
        way of selling, not to the model line). Equations per family k: u_k ≈ P(US-EU), e ≈ P(ASK-EU), e - u_k ≈ P(ASK-US)."""
        ks = list(fam_pairs)
        nu = len(ks) + 1                       # unknowns: u_k for each family, then e
        A = [[0.0] * nu for _ in range(nu)]; b = [0.0] * nu
        for i, k in enumerate(ks):
            for key, (d, w, _) in fam_pairs[k].items():
                x = [0.0] * nu
                if key == ("US_AUC", "EU_AUC"): x[i] = 1
                elif key == ("EU_ASK", "EU_AUC"): x[-1] = 1
                else: x[i], x[-1] = -1, 1
                for r in range(nu):
                    b[r] += w * x[r] * d
                    for c in range(nu): A[r][c] += w * x[r] * x[c]
        for r in range(nu):                    # tiny ridge: a family without US pairs gets u = 0 instead of a singular system
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
        return {k: {"EU_AUC": 0.0, "US_AUC": sol[i], "EU_ASK": sol[-1]} for i, k in enumerate(ks)}

    fam = {}
    for k in ("COLLECT", "MODERN"):
        p = pairs(k)
        fam[k] = p if ("US_AUC", "EU_AUC") in p or ("EU_ASK", "US_AUC") in p else pairs(None)
    out = solve(fam)
    info = {k: {"pairs": {"%s-%s" % key: [round(d, 4), n] for key, (d, _, n) in fam[k].items()}, "own": fam[k] is not None} for k in fam}
    return out, info, stats


def channel_bias(stats, delta, sd):
    """Between-variant spread of each channel's offset (tau^2): how far a single variant's US or asking-price level may
    sit from its European auction level beyond sampling noise. Measured from the pairwise differences; this caps how
    much indirect evidence can move a variant's value, however many such prices there are."""
    pv = {}
    for c1, c2 in [("US_AUC", "EU_AUC"), ("EU_ASK", "EU_AUC"), ("EU_ASK", "US_AUC")]:
        dev, noise = [], []
        for v, st in stats.items():
            if c1 not in st or c2 not in st or st[c1][1] < 3 or st[c2][1] < 3: continue
            k = family(v)
            dev.append(st[c1][0] - st[c2][0] - (delta[k][c1] - delta[k][c2]))
            noise.append(math.pi / 2 * (sd[c1] ** 2 / st[c1][1] + sd[c2] ** 2 / st[c2][1]))
        if len(dev) >= 6:
            mad = 1.4826 * median([abs(x - median(dev)) for x in dev])
            pv[(c1, c2)] = (max(0.0, mad ** 2 - sum(noise) / len(noise)), len(dev))
    tau = {"EU_AUC": 0.0}
    us = pv.get(("US_AUC", "EU_AUC")); ask = pv.get(("EU_ASK", "EU_AUC")); both = pv.get(("EU_ASK", "US_AUC"))
    tau["US_AUC"] = us[0] if us else (both[0] / 2 if both else 0.04)
    tau["EU_ASK"] = ask[0] if ask else (max(0.0, both[0] - tau["US_AUC"]) if both else 0.04)
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
    # than OUT_K times the measured scatter of their source. Two passes, so that one extreme price does not move the
    # level the others are judged by. With few records only the hard limit applies (factor 2 either way).
    keep = list(zip(l, base))
    for _ in range(2):
        a = median([b for _, b in keep])
        lim = lambda s: min(OUT_K * SD[s["ch"]], OUT_MAX) if len(keep) >= OUT_MIN_N else OUT_MAX
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
        mc[c] = wmedian([b for _, b in xs], [math.exp(-(T - s["t"]) / RECENCY) for s, _ in xs])
        prec[c] = 1 / (math.pi / 2 * SD[c] ** 2 / len(xs) + TAU2[c])
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
price_out = {x["id"]: x for x in excluded_all if x["ch"] == "EU_ASK"}
for a in asks:
    if not a.get("excluded") and a["id"] in price_out:
        d = price_out[a["id"]]["dev"]
        a["excluded"] = "Preis %d %% %s dem Niveau vergleichbarer Fahrzeuge" % (round(abs(d) * 100), "über" if d > 0 else "unter")
asks = sorted((a for a in asks if a["variant"] in known), key=lambda a: (a["variant"], -a["eur"]))
json.dump([{k: a.get(k) for k in ("id", "variant", "date", "eur", "price", "cur", "km", "year", "title", "seller", "sellerName", "country", "url", "source", "excluded", "note")} for a in asks],
          open(OUT_ASKS, "w"), ensure_ascii=False, separators=(",", ":"))
print("price outliers left out:", collections.Counter(x["ch"] for x in excluded_all), "listings flagged by text:", sum(1 for a in asks if a.get("excluded") and not a["id"] in price_out))
print(sum(1 for x in result["variants"].values() if x["value"]), "variants with a value;", len(obs), "observations;", result["channels"])

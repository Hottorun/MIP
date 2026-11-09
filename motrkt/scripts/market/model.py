"""Market model: robust hedonic time index per segment + variant level (+ variant-specific drift for large samples).
log p_i = a_v + f_g(t_i) + λ_v(t) d_v(t_i) + e_i, estimated by alternating weighted medians with Gaussian kernels."""
import json, math, os, sys, collections, datetime as dt
S = sys.argv[1]; OUT = sys.argv[2]
AS_OF = dt.date(2026, 11, 9)
def tf(d):  # date -> decimal year
    if isinstance(d, str): d = dt.date.fromisoformat(d)
    return d.year + (d.timetuple().tm_yday - 1) / 365.25
T = tf(AS_OF)
GRID_DATES = [dt.date(2015 + k // 12, k % 12 + 1, 1) for k in range((AS_OF.year - 2015) * 12 + AS_OF.month)] + [AS_OF]
GRID = [tf(d) for d in GRID_DATES]
def ms(d): return int(dt.datetime(d.year, d.month, d.day, tzinfo=dt.timezone.utc).timestamp() * 1000)

def wmedian(xs, ws):
    pts = sorted(zip(xs, ws)); tot = sum(ws); acc = 0
    if tot <= 0: return None
    for x, w in pts:
        acc += w
        if acc >= tot / 2: return x
    return pts[-1][0]

def group(v):
    vid = v
    if "rennsportwagen" in vid or "gt-rennwagen" in vid or "cup-und-clubsport" in vid: return "G"
    if "-356-" in vid or "-912-" in vid: return "A"
    if "-930-" in vid or "-964-" in vid or "-993-" in vid or "-f-modell-" in vid or "-g-modell-" in vid: return "B"
    if "959" in vid or vid.endswith("carrera-gt-carrera-gt") or "918" in vid: return "F"
    gt = any(k in vid for k in ["gt3", "gt2", "-r", "sport-classic", "speedster", "s-t", "dakar", "50-jahre"]) and "-911-" in vid
    if vid.endswith("-r") or gt: return "D"
    if "-911-" in vid: return "C"
    midgt = any(k in vid for k in ["gt4", "spyder", "cayman-r", "rs-60", "550-spyder", "black-edition", "25-jahre"])
    return "E2" if midgt else "E"
PARENT = {"H": "COLLECT", "A": "COLLECT", "B": "COLLECT", "F": "COLLECT", "G": "COLLECT", "C": "MODERN", "D": "MODERN", "E": "MODERN", "E2": "MODERN"}

sales = [s for s in json.load(open(S + "/web/sales_all.json")) if s["sold"] and s["eur"] and s["eur"] > 500 and s["date"] <= AS_OF.isoformat() and s["date"] >= "2015-01-01"]
# de-duplicate (same variant, same price within 0.5 %, within 10 days) – e.g. a car reported twice
sales.sort(key=lambda s: (s["variant"], s["date"]))
ded = []
for s in sales:
    dup = next((o for o in reversed(ded[-6:]) if o["variant"] == s["variant"] and abs(tf(o["date"]) - tf(s["date"])) < 10 / 365 and abs(o["eur"] / s["eur"] - 1) < 0.005), None)
    if not dup: ded.append(s)
sales = ded
# High-priced 356 / air-cooled 911 variants (median above 250,000 EUR) move like the top of the market, not like the
# volume cars of their family: they get a common index of their own ("H").
_med = collections.defaultdict(list)
for s in sales: _med[s["variant"]].append(s["eur"])
HIGH = {v for v, x in _med.items() if group(v) in ("A", "B") and sorted(x)[len(x) // 2] > 250000}
def tier(v):
    g = group(v)
    return "H" if v in HIGH else g
for s in sales: s["t"] = tf(s["date"]); s["y"] = math.log(s["eur"]); s["g"] = tier(s["variant"])
byv = collections.defaultdict(list)
for s in sales: byv[s["variant"]].append(s)

def smooth(pts, grid, h0, min_w):
    """pts: [(t, r, w)] -> weighted kernel median at each grid point (adaptive bandwidth)."""
    out = []
    for m in grid:
        h = h0
        while True:
            ks = [(r, w * math.exp(-0.5 * ((t - m) / h) ** 2)) for t, r, w in pts if abs(t - m) < 3 * h]
            sw = sum(k for _, k in ks)
            if sw >= min_w or h > 3: break
            h *= 1.4
        out.append(wmedian([r for r, _ in ks], [k for _, k in ks]) if ks else None)
    # fill gaps
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

def fit_index(ss, iters=8, h=0.25):
    f = [0.0] * len(GRID); a = {}
    keep = list(ss)
    for it in range(iters):
        vs = collections.defaultdict(list)
        for s in keep: vs[s["variant"]].append(s)
        for v, l in vs.items():
            a[v] = wmedian([s["y"] - interp(GRID, f, s["t"]) for s in l], [1.0] * len(l))
        pts = [(s["t"], s["y"] - a[s["variant"]], 1.0) for s in keep]
        f = smooth(pts, GRID, h, 15)
        f = [x - f[-1] for x in f]
        if it >= 1:  # robustness: drop gross outliers (beyond ×/÷ 2.7 of the model)
            keep = [s for s in ss if s["variant"] in a and abs(s["y"] - a[s["variant"]] - interp(GRID, f, s["t"])) < 1.0]
    return f

idx = {}
# Thin markets (supercars, race cars) get their own, more strongly smoothed index: their prices move differently
# from the broad classic market, and a few hundred sales still identify the slow trend.
MIN_N = {"F": 150, "G": 150, "H": 300}; BW = {"F": 0.5, "G": 1.0, "H": 0.5}
for name, members in [("COLLECT", {"A", "B", "H", "F", "G"}), ("MODERN", {"C", "D", "E", "E2"})] + [(g, {g}) for g in ["A", "B", "H", "C", "D", "E", "E2", "F", "G"]]:
    ss = [s for s in sales if s["g"] in members]
    if len(ss) >= MIN_N.get(name, 400) or name in ("COLLECT", "MODERN"):
        idx[name] = fit_index(ss, h=BW.get(name, 0.25)); print(name, len(ss), "f(T-5y)=%.3f f(T-1y)=%.3f" % (interp(GRID, idx[name], T - 5), interp(GRID, idx[name], T - 1)), flush=True)

result = {"total": len(sales), "sources": dict(collections.Counter(s["house"] for s in sales).most_common()), "asOf": AS_OF.isoformat(), "grid": [ms(d) for d in GRID_DATES], "variants": {}, "index": {k: [round(x, 4) for x in v] for k, v in idx.items()}}
print("H:", sorted(HIGH))
# Variants with at least OWN_MIN sales get their own drift around the segment index (shrunk towards it where sales are thin)
OWN_MIN = 12
for v, l in byv.items():
    g = l[0]["g"]; gi = g if g in idx else PARENT[g]; f = idx[gi]
    base = [s["y"] - interp(GRID, f, s["t"]) for s in l]
    # outlier screen around the plain (time-adjusted) median, then the level: recency-weighted only for large samples,
    # otherwise the newest sale of a small sample would dominate
    a = wmedian(base, [1.0] * len(base))
    keep = [(s, b) for s, b in zip(l, base) if abs(b - a) < 1.0]
    rec = len(keep) >= 25
    a = wmedian([b for _, b in keep], [math.exp(-(T - s["t"]) / 3) if rec else 1.0 for s, _ in keep])
    n = len(keep)
    d = [0.0] * len(GRID); lam = [0.0] * len(GRID)
    if n >= OWN_MIN:
        pts = [(s["t"], b - a, 1.0) for s, b in keep]
        d = smooth(pts, GRID, 0.6, 8)
        for i, m in enumerate(GRID):
            ws = [math.exp(-0.5 * ((t - m) / 0.6) ** 2) for t, _, _ in pts]
            neff = (sum(ws) ** 2 / sum(x * x for x in ws)) if sum(ws) > 0 else 0
            lam[i] = neff / (neff + 10)
    adj = [a + lam[i] * d[i] for i in range(len(GRID))]
    series = [math.exp(f[i] + adj[i]) for i in range(len(GRID))]
    value = series[-1]
    tadj = [math.exp(s["y"] - interp(GRID, f, s["t"]) - interp(GRID, [lam[i] * d[i] for i in range(len(GRID))], s["t"]) + adj[-1] - a) for s, _ in keep if s["t"] >= T - 3]
    tadj.sort()
    q = lambda p: tadj[min(len(tadj) - 1, int(p * len(tadj)))] if tadj else None
    # gearbox / body effects (time-adjusted residuals), only with enough cars on both sides
    res = {s["lot"]: s["y"] - interp(GRID, f, s["t"]) - interp(GRID, adj, s["t"]) for s, _ in keep}
    def eff(key):
        lv = collections.defaultdict(list)
        for s, _ in keep:
            if s.get(key): lv[s[key]].append(res[s["lot"]])
        allr = [r for xs in lv.values() for r in xs]
        if len(lv) < 2: return {}
        med_all = sorted(allr)[len(allr) // 2]
        return {k: [round(math.exp(sorted(xs)[len(xs) // 2] - med_all) - 1, 3), len(xs)] for k, xs in lv.items() if len(xs) >= 6}
    first = min(s["t"] for s, _ in keep)
    last_ = max(s["t"] for s, _ in keep)
    houses = collections.Counter(s["house"] for s, _ in keep)
    result["variants"][v] = {
        "value": round(value), "n": n, "n12": sum(1 for s, _ in keep if s["t"] >= T - 1), "n24": sum(1 for s, _ in keep if s["t"] >= T - 2),
        "lo": round(q(0.25)) if len(tadj) >= 6 else None, "hi": round(q(0.75)) if len(tadj) >= 6 else None,
        "first": min(s["date"] for s, _ in keep), "last": max(s["date"] for s, _ in keep), "index": gi,
        "own": n >= OWN_MIN, "houses": dict(houses.most_common()),
        "gearbox": {}, "body": eff("body"),
        "series": [round(x) for x in series],
    }
for v, _ in json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "variant_ids.json"))):
    if v not in result["variants"]:
        g = tier(v); result["variants"][v] = {"value": None, "n": 0, "index": g if g in idx else PARENT[g]}
result["variants"] = dict(sorted(result["variants"].items()))
json.dump(result, open(OUT, "w"), ensure_ascii=False, separators=(",", ":"))
print(len(result["variants"]), "variants with data;", len(sales), "sales")

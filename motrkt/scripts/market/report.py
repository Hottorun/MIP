import json, sys, random, math, collections
S = sys.argv[1]; M = json.load(open(sys.argv[2])); old = {l.split("|")[0]: l.split("|") for l in open(S + "/web/old_values.txt").read().split("\n") if l}
sales = json.load(open(S + "/web/sales_all.json"))
byv = collections.defaultdict(list)
for s in sales:
    if s["sold"] and s["eur"]: byv[s["variant"]].append(s)
g = M["grid"]
def at(series, k): return series[k]
for v, e in M["variants"].items():
    o = old.get(v)
    ov = int(o[3]) if o else 0
    if not e["n"]:
        print(f"{v[8:]:58s} n=0  OLD {ov:>10,}"); continue
    s = e["series"]; val = e["value"]
    c12 = val / s[-13] - 1; c5 = (val / s[-61]) ** (1 / 5) - 1 if len(s) > 61 else float("nan")
    print(f"{v[8:]:58s} n={e['n']:<4d} n12={e['n12']:<3d} {val:>10,} [{e['lo'] or 0:>10,}-{e['hi'] or 0:>10,}] OLD {ov:>10,} x{val/ov:4.2f} 12m {c12:+.0%} 5y/a {c5:+.1%} {'own' if e['own'] else e['index']}")

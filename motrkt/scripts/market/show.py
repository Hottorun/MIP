import json, sys
S = sys.argv[1]; vs = sys.argv[2].split(","); n = int(sys.argv[3]) if len(sys.argv) > 3 else 400
sales = json.load(open(S + "/web/sales_all.json"))
for v in vs:
    rows = sorted([s for s in sales if v in s["variant"] and s["sold"]], key=lambda s: s["eur"])
    print("==", v, len(rows))
    for s in rows[:n] if n > 0 else rows[n:]:
        print(f"  {s['date']} {s['eur']:>10,} {s['orig']:>10,} {s['cur']} {s['house'][:14]:14s} {s['title'][:95]}")

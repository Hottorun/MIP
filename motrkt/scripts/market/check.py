"""Safety check before new market data is committed: compares the files the update just wrote (src/data/real) with
the last committed version and stops if a source looks broken (a fetch blocked, a raw data folder that was lost).

usage: python3 -I check.py
       python3 -I check.py --shrunk OLD.json NEW.json   (exit 0 if NEW has fewer than 90 % of OLD's entries or is
                                                         missing/broken; update.sh then keeps OLD)

Exit code 1 if
- sales.csv has fewer than 95 % of the rows it had (results only accumulate; reclassification moves a few),
- an auction house with at least 100 sales has fewer than 85 % of them (one source failing, e.g. an empty list),
- asks.json has fewer than 60 % of the listings it had (Classic Trader changes daily, but not by half),
- market-model.json has a value for fewer than 90 % of the variants that had one.
Nothing to compare (first run, files not committed yet) passes.
"""
import collections, csv, io, json, os, subprocess, sys

if sys.argv[1:2] == ["--shrunk"]:
    def entries(p):
        try:
            return len(json.load(open(p, encoding="utf-8")))
        except (OSError, ValueError):
            return 0
    sys.exit(0 if entries(sys.argv[3]) < entries(sys.argv[2]) * 0.9 else 1)

REAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "src", "data", "real")


def committed(name):
    r = subprocess.run(["git", "show", "HEAD:./" + name], cwd=REAL, capture_output=True, text=True)
    return r.stdout if r.returncode == 0 else None


def current(name):
    return open(os.path.join(REAL, name), encoding="utf-8").read()


def sales(text):
    return sum(1 for _ in csv.reader(io.StringIO(text), delimiter=";")) - 1


def asks(text):
    return len(json.loads(text))


def valued(text):
    return sum(1 for v in json.loads(text)["variants"].values() if v.get("value"))


ok = True
for name, count, minimum in [("sales.csv", sales, 0.95), ("asks.json", asks, 0.60), ("market-model.json", valued, 0.90)]:
    old_text = committed(name)
    new = count(current(name))
    if old_text is None:
        print(f"{name}: {new} (nothing committed to compare)")
        continue
    old = count(old_text)
    good = new >= old * minimum
    ok &= good
    print(f"{name}: {old} -> {new}" + ("" if good else f"  ZU WENIG (mindestens {minimum:.0%} von {old})"))
# per auction house (column "haus"): one failing source must not slip through under the total
old_text = committed("sales.csv")
if old_text is not None:
    def houses(text):
        return collections.Counter(r["haus"] for r in csv.DictReader(io.StringIO(text), delimiter=";"))
    old, new = houses(old_text), houses(current("sales.csv"))
    for house, n in old.most_common():
        if n >= 100 and new[house] < n * 0.85:
            ok = False
            print(f"{house}: {n} -> {new[house]}  ZU WENIG (mindestens 85% von {n})")
sys.exit(0 if ok else 1)

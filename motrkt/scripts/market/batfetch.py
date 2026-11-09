import json, sys, time, urllib.request, os
out = sys.argv[1]; cutoff = 1420070400  # 2015-01-01
# --until-known: incremental update, stop at the first page whose results are all in the file already
known = set()
if "--until-known" in sys.argv and os.path.exists(out):
    known = {json.loads(l)["id"] for l in open(out)}
sys.argv = [a for a in sys.argv if a != "--until-known"]
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
base = "https://bringatrailer.com/wp-json/bringatrailer/1.0/data/listings-filter?page={}&per_page=60&get_items=1&get_stats=0&sort=td&base_filter%5Bkeyword_s%5D=Porsche&base_filter%5Bitems_type%5D=make"
keep = ["id","title","url","current_bid","currency","sold_text","timestamp_end","country_code","noreserve","excerpt"]
with open(out, "a") as f:
    page = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    while True:
        for attempt in range(5):
            try:
                req = urllib.request.Request(base.format(page), headers={"User-Agent": UA, "Accept": "application/json"})
                d = json.load(urllib.request.urlopen(req, timeout=30)); break
            except Exception as e:
                print("retry", page, e, flush=True); time.sleep(5 * (attempt + 1))
        else:
            sys.exit("failed page %d" % page)
        items = d.get("items", [])
        for it in items: f.write(json.dumps({k: it.get(k) for k in keep}) + "\n")
        f.flush()
        oldest = min((it["timestamp_end"] or 0) for it in items) if items else 0
        print(page, len(items), time.strftime("%Y-%m-%d", time.gmtime(oldest)), flush=True)
        if not items:
            print("empty page", page, flush=True); time.sleep(30); empty = locals().get("empty", 0) + 1
            if empty > 3: break
            continue
        empty = 0
        if oldest < cutoff or page >= d["pages_total"]: break
        if known and all(it["id"] in known for it in items): break
        page += 1; time.sleep(1.0)

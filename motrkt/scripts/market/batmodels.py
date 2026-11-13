import json, sys, time, urllib.request, urllib.parse, re, os
S = sys.argv[1]; out = S + "/web/bat_models.jsonl"; cutoff = 1420070400  # 2015-01-01
UA = "MIP-Marktdaten/1.0 (Marktbeobachtung klassischer Porsche)"
MODELS = (sys.argv[2:] or """356-carrera 356-pre-a 356-speedster 356a 356b 356c 912 912e 918-spyder 930-turbo 934-935 956-962 959 964 964-911-carrera-4 964-911-race-car 964-911-speedster 964-911-turbo-33 964-911-turbo-36 964-carrera-rs 981-boxster 981-cayman 982-718-boxster 982-718-cayman 986-boxster 987-boxster 987-cayman 991-911 991-911-50th-anniversary 991-911-carrera-t 991-911-r 991-911-speedster 991-911-turbo-s 991-gt2 991-gt3 992-911 992-911-carrera-gts 992-911-dakar 992-911-sport-classic 992-911-st 992-gt3 992-turbo 993 993-911-carrera-4 993-911-carrera-4s 993-911-carrera-rs 993-911-carrera-s 993-911-race-car 993-911-turbo-s 993-gt2 993-turbo 996-911 996-911-carrera-4s 996-911-carrera-targa 996-911-turbo-s 996-gt2 996-gt3 996-turbo 997-911 997-911-carrera 997-911-speedster 997-911-sport-classic 997-911-turbo-s 997-gt2 997-gt3 997-turbo carrera-gt cayman-gt4 sports-prototypes-1960s-1970s 944-turbo""".split()
          # water-cooled all-wheel-drive 911 (own variants since 12.11.2026): Carrera 4 / 4S, Targa 4 / 4S, 4 GTS
          + """996-911-carrera-4 996-911-carrera-4-millennium-edition 997-911-carrera-4 997-911-carrera-4s 997-911-targa-4 997-911-targa-4s 991-911-carrera-4 991-911-carrera-4s 991-911-targa-4 991-911-targa-4s 992-911-carrera-4 992-911-carrera-4s 992-911-carrera-4-gts 992-911-targa-4 992-911-targa-4s 992-911-targa-4-gts""".split())
keep = ["id","title","url","current_bid","currency","sold_text","timestamp_end","country_code","noreserve"]
done = set()
if os.path.exists(S + "/web/bat_models.done"): done = set(open(S + "/web/bat_models.done").read().split())
def get(url, js=True):
    for attempt in range(8):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json" if js else "text/html"})
            r = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "ignore")
            return json.loads(r) if js else r
        except Exception as e:
            print("retry", url[-80:], e, flush=True); time.sleep(10 * (attempt + 1))
    raise SystemExit("failed " + url)
with open(out, "a") as f:
    for m in MODELS:
        if m in done: continue
        h = get("https://bringatrailer.com/porsche/%s/" % m, js=False)
        mm = re.search(r'auctionsCompletedInitialData = (\{.*?\});\s*\n', h, re.S)
        if not mm: print("no data", m, flush=True); continue
        d0 = json.loads(mm.group(1)); bf = d0["base_filter"]
        q = [("base_filter[%s][]" % k, str(x)) if isinstance(v, list) else ("base_filter[%s]" % k, str(v)) for k, v in bf.items() for x in (v if isinstance(v, list) else [v])]
        page = 1; n = 0
        while True:
            params = [("page", page), ("per_page", 60), ("get_items", 1), ("get_stats", 0), ("sort", "td")] + q
            d = get("https://bringatrailer.com/wp-json/bringatrailer/1.0/data/listings-filter?" + urllib.parse.urlencode(params))
            items = d.get("items", [])
            for it in items: f.write(json.dumps(dict({k: it.get(k) for k in keep}, model_page=m)) + "\n")
            f.flush(); n += len(items)
            oldest = min((it["timestamp_end"] or 0) for it in items) if items else 0
            if not items or oldest < cutoff or page >= d.get("pages_total", 0): break
            page += 1; time.sleep(1.2)
        print(m, d0["items_total"], n, flush=True)
        open(S + "/web/bat_models.done", "a").write(m + "\n")
        time.sleep(1.2)

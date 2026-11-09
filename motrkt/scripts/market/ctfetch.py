"""Classic Trader: download all current Porsche listings (asking prices, Germany/Europe).

usage: python3 -I ctfetch.py WORK [--max N]

Reads the public listing sitemaps (allowed by robots.txt), keeps the Porsche listing URLs and stores each listing page
once per day under WORK/web/ct/pages/<YYYY-MM-DD>/<id>.html.gz. One request every 1.5 s. Pages already stored for
today are skipped, so an interrupted run can simply be restarted.
"""
import datetime as dt, gzip, os, re, sys, time, urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
SITEMAPS = ["https://cdn.classic-trader.com/I/sitemap/sitemap.de.car.listing%s.xml" % s for s in ["", "_0", "_1", "_2", "_3", "_4", "_5"]]
DELAY = 1.5


def get(url, tries=3):
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "de-DE,de;q=0.9", "Accept-Encoding": "gzip"})
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read()
                if r.headers.get("Content-Encoding") == "gzip":
                    body = gzip.decompress(body)
                return r.status, body
        except urllib.error.HTTPError as e:
            if e.code in (404, 410):
                return e.code, b""
            time.sleep(5 * (k + 1))
        except Exception as e:
            print("retry", url, e, flush=True)
            time.sleep(5 * (k + 1))
    return None, b""


def main():
    work = sys.argv[1]
    limit = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else None
    day = dt.date.today().isoformat()
    out = os.path.join(work, "web", "ct", "pages", day)
    os.makedirs(out, exist_ok=True)
    urls = set()
    for sm in SITEMAPS:
        code, body = get(sm)
        if code != 200:
            continue
        urls.update(re.findall(r"<loc>(https://www\.classic-trader\.com/de/automobile/inserat/porsche/[^<]+)</loc>", body.decode("utf-8", "replace")))
        time.sleep(DELAY)
    urls = sorted(urls)
    with open(os.path.join(work, "web", "ct", "urls-%s.txt" % day), "w") as f:
        f.write("\n".join(urls))
    print(len(urls), "Porsche listings in sitemap", flush=True)
    done = 0
    for u in urls[:limit]:
        lid = u.rstrip("/").rsplit("/", 1)[-1]
        p = os.path.join(out, lid + ".html.gz")
        if os.path.exists(p):
            continue
        code, body = get(u)
        if code == 200 and body:
            with gzip.open(p, "wb") as f:
                f.write(body)
        done += 1
        if done % 100 == 0:
            print(done, "fetched", flush=True)
        time.sleep(DELAY)
    print("done", done, flush=True)


if __name__ == "__main__":
    main()

"""Photos of the hand-recorded dealer listings (manual/haendler.csv): the photos each dealer publishes for the car.

usage: python3 -I dealerphotos.py WORK

Every listing URL in manual/haendler.csv is opened once; the image URLs on the page are cached in
WORK/web/dealerphotos-pages.json and the chosen photos are written to WORK/web/dealerphotos.json ({url: [image, ...]}).

- early911s.de builds its gallery in the browser from its own gallery service (bridge.early911s.de), which is read
  directly: the photos in the dealer's order.
- All other dealers: the images on the listing page in page order. Images that appear on more than one listing page
  of the same dealer (logo, banners, team photos, "more cars" teasers) are not the car and are dropped; thumbnails
  (up to 300 px) and PNG graphics (overlays) too. The first remaining image is the car's main photo.

Pages that robots.txt closes to us are skipped. curl does the requests (it speaks the TLS versions some dealer servers
require). One request every 1.5 s; a rerun only opens new URLs.
"""
import collections, csv, html, json, os, re, subprocess, sys, time, urllib.parse, urllib.robotparser

UA = "MIP-Marktdaten/1.0 (Marktbeobachtung klassischer Porsche)"
DELAY = 1.5
KEEP = 8
HERE = os.path.dirname(os.path.abspath(__file__))
W = sys.argv[1]
PAGES = os.path.join(W, "web", "dealerphotos-pages.json")
OUT = os.path.join(W, "web", "dealerphotos.json")
IMG = re.compile(r'(?:src|href|data-src|data-lazy-src|data-full|content|srcset)\s*=\s*["\']([^"\']+)["\']|url\(\s*["\']?([^"\')]+)', re.I)
EXT = re.compile(r"\.(?:jpe?g|webp|png|avif)(?:[?#]|$)|[?&]rule=mo-\d+\.jpg", re.I)
NOT_CAR = re.compile(r"logo|icon|favicon|flag|sprite|placeholder|avatar|portrait|banner|background|footer|overlay|\.png(?:[?#]|$)", re.I)


def get(url):
    r = subprocess.run(["curl", "-s", "-L", "--compressed", "--max-time", "40", "-A", UA, "-H", "Accept-Language: de-DE,de;q=0.9",
                        "-w", "\n%{http_code}", url], capture_output=True)
    body, _, code = r.stdout.rpartition(b"\n")
    return int(code or 0), body.decode("utf-8", "replace")


def images(page, base):
    out = []
    for a, b in IMG.findall(page):
        for part in (a or b).split(","):            # srcset: "url 640w, url 1280w"
            u = html.unescape(part.strip().split(" ")[0])
            if not u or u.startswith("data:") or not EXT.search(u) or NOT_CAR.search(u):
                continue
            if re.search(r"-(\d{2,3})x(\d{2,3})\.\w+$", u) and max(map(int, re.search(r"-(\d+)x(\d+)\.\w+$", u).groups())) <= 300:
                continue                              # WordPress thumbnail
            u = urllib.parse.urljoin(base, u)
            if u not in out:
                out.append(u)
    return out


def early911s(url):
    rid = urllib.parse.parse_qs(urllib.parse.urlparse(url).query).get("id", [""])[0]
    code, body = get("https://bridge.early911s.de/fm-galerie.php/gallery/%s" % urllib.parse.quote(rid))
    if code != 200:
        return None
    items = json.loads(body).get("items") or []
    hrefs = [it if isinstance(it, str) else it.get("href") for it in items]
    return ["https://bridge.early911s.de/fm-galerie.php" + h if h.startswith("/") else h for h in hrefs if h]


def allowed(robots, url):
    p = urllib.parse.urlparse(url)
    root = "%s://%s" % (p.scheme, p.netloc)
    if root not in robots:
        code, body = get(root + "/robots.txt")
        rp = urllib.robotparser.RobotFileParser()
        rp.parse(body.splitlines() if code == 200 else [])
        robots[root] = rp
    return robots[root].can_fetch(UA, url)


def main():
    pages = json.load(open(PAGES)) if os.path.exists(PAGES) else {}
    urls = []
    with open(os.path.join(HERE, "manual", "haendler.csv"), encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter=";"):
            u = (row.get("url") or "").strip()
            if u.startswith("http") and u not in urls:
                urls.append(u)
    robots = {}
    for u in urls:
        if u in pages:
            continue
        if not allowed(robots, u):
            print("robots.txt excludes", u, flush=True)
            pages[u] = {"robots": True, "imgs": []}
            continue
        if "early911s.de" in u:
            imgs = early911s(u)
            if imgs is None:
                print("failed", u, flush=True)
            else:
                pages[u] = {"direct": True, "imgs": imgs}
        else:
            code, body = get(u)
            if code == 200:
                pages[u] = {"imgs": images(body, u)}
            elif code in (404, 410):
                pages[u] = {"gone": True, "imgs": []}
            else:
                print("failed", code, u, flush=True)   # not cached: tried again next run
        time.sleep(DELAY)
    json.dump(pages, open(PAGES, "w"), ensure_ascii=False)

    # images on several listing pages of one dealer belong to the site, not to a car
    count = collections.Counter()
    for u, p in pages.items():
        if not p.get("direct"):
            for i in set(p["imgs"]):
                count[(urllib.parse.urlparse(u).netloc, i)] += 1
    out = {}
    for u in urls:
        p = pages.get(u)
        if not p:
            continue
        host = urllib.parse.urlparse(u).netloc
        imgs = p["imgs"] if p.get("direct") else [i for i in p["imgs"] if count[(host, i)] == 1]
        # one entry per photo: drop resized copies ("…-640x427.jpg", "…-jpg.webp") of a photo already listed
        seen, keep = set(), []
        for i in imgs:
            name = i.split("?")[0].rsplit("/", 1)[-1]
            cam = re.match(r"((?:IMG|DSC|DSCF|_MG|_DSC)_?\d{3,})", name)   # camera file number: the same photo in two sizes
            key = i if p.get("direct") else cam.group(1) if cam else re.sub(r"(-\d+x\d+)?(-jpg)?\.(jpe?g|webp|png)$", "", name)
            if key not in seen:
                seen.add(key)
                keep.append(i)
        if keep:
            out[u] = keep[:KEEP]
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=0)
    by = collections.Counter(urllib.parse.urlparse(u).netloc for u in urls)
    got = collections.Counter(urllib.parse.urlparse(u).netloc for u in out)
    for h in by:
        print("%-24s %3d listings, %3d with photos" % (h, by[h], got[h]))


if __name__ == "__main__":
    main()

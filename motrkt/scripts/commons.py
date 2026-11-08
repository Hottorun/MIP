#!/usr/bin/env python3
"""Wikimedia Commons helper: search freely licensed car photos and download thumbnails with attribution.

  python3 scripts/commons.py search "Porsche 964 Carrera RS" [--limit 15]
  python3 scripts/commons.py category "Porsche 964 Carrera RS" [--limit 40]
  python3 scripts/commons.py fetch "File:Porsche 964 RS.jpg" --out public/cars/<variant-id>-1.jpg

`fetch` prints the attribution metadata as JSON (source page, author, license, license URL).
Be polite: one request per second, descriptive User-Agent, thumbnails only (max 1280 px).
"""
import argparse, html, json, re, sys, time, urllib.parse, urllib.request

API = "https://commons.wikimedia.org/w/api.php"
UA = "MOTRKT-demo/0.1 (local research tool; Wikimedia Commons attribution-respecting)"
FREE = re.compile(r"^(cc0|cc[- ]by(-sa)?([- ]\d(\.\d)?)?|public domain|pd|attribution|fal|gfdl)", re.I)


def get(params):
    time.sleep(1.0)
    url = API + "?" + urllib.parse.urlencode({**params, "format": "json"})
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def strip(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def info(titles, width=1280):
    data = get({
        "action": "query", "titles": "|".join(titles), "prop": "imageinfo",
        "iiprop": "url|size|extmetadata|mime", "iiurlwidth": width,
    })
    out = []
    for p in data.get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [None])[0]
        if not ii:
            continue
        md = ii.get("extmetadata", {})
        lic = strip(md.get("LicenseShortName", {}).get("value"))
        out.append({
            "title": p["title"],
            "page": ii.get("descriptionurl"),
            "thumb": ii.get("thumburl"),
            "width": ii.get("width"), "height": ii.get("height"),
            "mime": ii.get("mime"),
            "author": strip(md.get("Artist", {}).get("value"))[:120],
            "license": lic,
            "licenseUrl": md.get("LicenseUrl", {}).get("value"),
            "free": bool(FREE.match(lic)) and md.get("NonFree", {}).get("value") != "true",
            "description": strip(md.get("ImageDescription", {}).get("value"))[:200],
        })
    return out


def search(q, limit):
    data = get({"action": "query", "list": "search", "srsearch": q, "srnamespace": 6, "srlimit": limit})
    titles = [h["title"] for h in data.get("query", {}).get("search", [])]
    results = []
    for i in range(0, len(titles), 20):
        results += info(titles[i:i + 20], width=640)
    for r in results:
        if r["mime"] not in ("image/jpeg", "image/png", "image/webp"):
            continue
        flag = "" if r["free"] else "  [NOT FREE – skip]"
        print(f'{r["title"]}\n   {r["width"]}x{r["height"]} · {r["license"]} · {r["author"][:60]}{flag}\n   preview: {r["thumb"]}\n   {r["description"][:140]}')


def category(name, limit):
    cat = name if name.startswith("Category:") else f"Category:{name}"
    data = get({"action": "query", "list": "categorymembers", "cmtitle": cat, "cmlimit": 200, "cmtype": "file|subcat"})
    members = data.get("query", {}).get("categorymembers", [])
    for m in members:
        if m["ns"] == 14:
            print(f'[subcategory] {m["title"]}')
    files = [m["title"] for m in members if m["ns"] == 6][:limit]
    results = []
    for i in range(0, len(files), 20):
        results += info(files[i:i + 20], width=640)
    for r in results:
        if r["mime"] not in ("image/jpeg", "image/png", "image/webp"):
            continue
        flag = "" if r["free"] else "  [NOT FREE – skip]"
        print(f'{r["title"]}\n   {r["width"]}x{r["height"]} · {r["license"]} · {r["author"][:60]}{flag}\n   preview: {r["thumb"]}')


def fetch(title, out):
    r = info([title])[0]
    if not r["free"]:
        sys.exit(f"Refusing: license '{r['license']}' is not a free license")
    time.sleep(1.0)
    req = urllib.request.Request(r["thumb"], headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp, open(out, "wb") as f:
        f.write(resp.read())
    # Keep the repo small: max 960 px, JPEG quality ~65 (macOS `sips`).
    import shutil, subprocess
    if shutil.which("sips"):
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "65", "-Z", "960", out, "--out", out],
                       check=False, capture_output=True)
    print(json.dumps({k: r[k] for k in ("title", "page", "author", "license", "licenseUrl")}, ensure_ascii=False))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("search"); s.add_argument("query"); s.add_argument("--limit", type=int, default=15)
    c = sub.add_parser("category"); c.add_argument("name"); c.add_argument("--limit", type=int, default=40)
    f = sub.add_parser("fetch"); f.add_argument("title"); f.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.cmd == "search":
        search(a.query, a.limit)
    elif a.cmd == "category":
        category(a.name, a.limit)
    else:
        fetch(a.title, a.out)

import re, html, json, sys, glob, os
out = []
for f in sorted(glob.glob(sys.argv[1] + "/*.html"), key=lambda p: int(os.path.basename(p)[:-5])):
    h = open(f, errors="ignore").read()
    aid = int(os.path.basename(f)[:-5])
    t = re.search(r"<title>(.*?) - Ultimatecarpage", h)
    title = html.unescape(t.group(1)) if t else ""
    # auction date
    dm = re.search(r"Sale date:\s*(?:</b>)?</td>\s*<td[^>]*>([^<]*)<", h)
    loc = re.search(r"Location:\s*(?:</b>)?</td>\s*<td[^>]*>([^<]*)<", h)
    sale_date = dm.group(1).strip() if dm else ""
    rows = re.findall(r'<td class="greybg" id="event_specsleft" style="font-weight:bold;text-align:right">([^<]*)</td>(.*?)</tr>\s*</table></td>\s*<td class="lightbg" id="event_specsleft">(.*?)</td>\s*<td class="lightbg" id="event_specsright">(.*?)</td>', h, re.S)
    for lot, car, price, note in rows:
        name = re.sub(r"<[^>]+>", " ", car.split("Chassis:")[0])
        name = re.sub(r"\s+", " ", html.unescape(re.sub(r"onmouseover=\"Tip\(.*?\)\"", "", name))).strip()
        # Tip() contains html; strip by taking the <b> text
        bs = re.findall(r"<b>([^<]+)</b>", car)
        ch = re.search(r"Chassis:\s*(?:<a[^>]*>)?([^<]+)", car)
        out.append({"auction": aid, "event": title, "date": sale_date, "loc": html.unescape(loc.group(1)) if loc else "", "lot": lot.strip(), "b": [html.unescape(b) for b in bs],
                    "chassis": html.unescape(ch.group(1)).strip() if ch else "",
                    "price": re.sub(r"<[^>]+>", "", html.unescape(price)).strip(), "note": re.sub(r"<[^>]+>", "", html.unescape(note)).replace("\xa0", " ").strip()})
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False)
print(len(out))

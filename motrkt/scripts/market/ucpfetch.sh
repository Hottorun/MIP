S=$1; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
# Bot-Abfragen (Cloudflare "Just a moment...", z. B. von Rechenzentren wie GitHub Actions) werden nicht umgangen: die
# Seite wird nicht gespeichert und der Abruf endet; ucpparse.py nimmt dann den Stand aus ucp-snapshot.json.
for f in $(grep -l '<title>Just a moment' "$S"/web/ucp/*.html 2>/dev/null); do rm -f "$f"; done
for id in $(seq ${2:-275} ${3:-475}); do
  f=$S/web/ucp/$id.html; [ -s $f ] && continue
  curl -sL -A "$UA" -o $f "https://www.ultimatecarpage.com/auction/$id/x.html"
  if grep -q '<title>Just a moment' $f; then rm -f $f; echo "$id Bot-Abfrage von ultimatecarpage, Abruf beendet"; break; fi
  echo "$id $(grep -o '<title>[^<]*' $f)"; sleep 1.2
done

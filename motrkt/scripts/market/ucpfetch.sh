S=$1; UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"
for id in $(seq ${2:-275} ${3:-475}); do
  f=$S/web/ucp/$id.html; [ -s $f ] && continue
  curl -sL -A "$UA" -o $f "https://www.ultimatecarpage.com/auction/$id/x.html"; echo "$id $(grep -o '<title>[^<]*' $f)"; sleep 1.2
done

#!/usr/bin/env bash
# Assemble the public site into hermon-lenticular/ (deploy root). Run from LENTICULAR/.
set -e
OUT=hermon-lenticular
rm -rf "$OUT"; mkdir -p "$OUT/js" "$OUT/data" "$OUT/renders"
cp site/index.html site/site.css "$OUT/"
for f in web/js/*.js; do case "$(basename "$f")" in main.js|ui.js) ;; *) cp "$f" "$OUT/js/";; esac; done
cp site/js/*.js "$OUT/js/"
cp web/data/wide_height_1024.png web/data/wide_normal_2048.webp web/data/wide_sat_2048.webp web/data/wide_sat_4096.webp web/data/core_sat_4096.webp web/data/wide_landcover_4096.webp web/data/places.json "$OUT/data/"
cp web/renders/*.jpg "$OUT/renders/"
cat > "$OUT/_headers" <<'H'
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
/data/*
  Cache-Control: public, max-age=604800
/js/*
  Cache-Control: no-cache
/site.css
  Cache-Control: no-cache
/
  Cache-Control: no-cache
H
# version stamp on the entry assets so a new deploy never mixes with a cached stylesheet
STAMP=$(date +%s)
sed -i "s|href=\"site.css\"|href=\"site.css?v=$STAMP\"|; s|src=\"js/site.js\"|src=\"js/site.js?v=$STAMP\"|" "$OUT/index.html"
# and on every module import, so no browser mixes a new module with a cached one
sed -i -E "s#(from '\./[a-z0-9_]+\.js)'#\1?v=$STAMP'#g; s#(import\('\./[a-z0-9_]+\.js)'#\1?v=$STAMP'#g; s#(new URL\('\./[a-z0-9_]+\.js)'#\1?v=$STAMP'#g" "$OUT"/js/*.js
echo "built $OUT: $(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1)"

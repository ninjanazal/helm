#!/bin/sh
# check.sh <workdir>: exit 0 when ANSWER.md names the right functions, file and value and no code changed.
W=$1; A=$W/ANSWER.md
[ -f "$A" ] || { echo 'no ANSWER.md'; exit 1; }
for want in coupons_eligible coupons_min_order rules.sh 5000; do
  grep -q "$want" "$A" || { echo "ANSWER.md misses $want"; exit 1; }
done
[ "$(wc -l < "$A")" -le 12 ] || { echo 'ANSWER.md too long'; exit 1; }
(cd "$W" && git diff --quiet HEAD -- src tests test.sh)

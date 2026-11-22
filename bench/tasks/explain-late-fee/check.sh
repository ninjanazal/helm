#!/bin/sh
# check.sh <workdir>: exit 0 when ANSWER.md names the right functions, files and values and no code changed.
W=$1; A=$W/ANSWER.md
[ -f "$A" ] || { echo 'no ANSWER.md'; exit 1; }
for want in late_fee billing.sh fee_rate config.sh LATE_FEE_PCT GRACE_DAYS; do
  grep -q "$want" "$A" || { echo "ANSWER.md misses $want"; exit 1; }
done
grep -q '7' "$A" && grep -q '5' "$A" || { echo 'ANSWER.md misses the 7% rate or 5 grace days'; exit 1; }
[ "$(wc -l < "$A")" -le 12 ] || { echo 'ANSWER.md too long'; exit 1; }
(cd "$W" && git diff --quiet HEAD -- src tests test.sh)

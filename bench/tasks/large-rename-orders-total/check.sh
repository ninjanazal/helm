#!/bin/sh
# check.sh <workdir>: exit 0 when orders_total is gone everywhere, orders_sum works, and the suite passes.
W=$1; cd "$W" || exit 1
! grep -rq orders_total src tests || { echo 'orders_total still present'; exit 1; }
[ "$(grep -rl orders_sum src tests | wc -l)" -ge 5 ] || { echo 'orders_sum not used in 5 files'; exit 1; }
. tests/lib.sh; . src/load.sh
assert_eq sum 400 "$(orders_sum 100 250 50)"
finish && sh test.sh >/dev/null 2>&1

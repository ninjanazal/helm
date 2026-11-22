#!/bin/sh
# check.sh <workdir>: exit 0 when payments_refund_fee behaves, is tested, and the suite passes.
W=$1; cd "$W" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq normal 320 "$(payments_refund_fee 10000)"
assert_eq cap 1000 "$(payments_refund_fee 1000000)"
assert_eq small 0 "$(payments_refund_fee 99)"
assert_eq edge 32 "$(payments_refund_fee 100)"
finish && sh test.sh >/dev/null 2>&1 && grep -q payments_refund_fee tests/payments_test.sh

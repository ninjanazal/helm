#!/bin/sh
# check.sh <workdir>: exit 0 when shipping_quote charges per started extra kg and the suite passes.
W=$1; cd "$W" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq base 500 "$(shipping_quote 20000)"
assert_eq started 530 "$(shipping_quote 20001)"
assert_eq half 530 "$(shipping_quote 20500)"
assert_eq full 530 "$(shipping_quote 21000)"
assert_eq next 560 "$(shipping_quote 21001)"
finish && sh test.sh >/dev/null 2>&1

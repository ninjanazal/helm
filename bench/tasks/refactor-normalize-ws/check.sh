#!/bin/sh
# check.sh <workdir>: exit 0 when normalize_ws exists, people.sh uses it, the sed is not duplicated, and the suite passes.
W=$1; . "$W/tests/lib.sh"; . "$W/src/strutil.sh"; . "$W/src/people.sh"
assert_eq nws 'a b c' "$(normalize_ws '  a   b  c ')"
assert_eq name 'Ada Lovelace' "$(fmt_name '  ada   LOVELACE ')"
assert_eq street '12 Main St' "$(fmt_street ' 12   Main St ')"
finish || exit 1
[ "$(cat "$W"/src/*.sh | grep -c '\[\[:space:\]\]\[\[:space:\]\]\*/ /g')" -eq 1 ] || { echo 'sed expression not unique under src/'; exit 1; }
[ "$(grep -c normalize_ws "$W/src/people.sh")" -ge 3 ] || { echo 'people.sh does not use normalize_ws 3 times'; exit 1; }
(cd "$W" && sh test.sh >/dev/null 2>&1)

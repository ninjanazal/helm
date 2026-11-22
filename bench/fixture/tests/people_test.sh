D=$(cd "$(dirname "$0")/.." && pwd); . "$D/tests/lib.sh"; . "$D/src/strutil.sh"; . "$D/src/people.sh"
assert_eq name 'Ada Lovelace' "$(fmt_name '  ada   LOVELACE ')"
assert_eq city 'New York' "$(fmt_city 'new  york')"
assert_eq street '12 Main St' "$(fmt_street ' 12   Main St ')"
finish

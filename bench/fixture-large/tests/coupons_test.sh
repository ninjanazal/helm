D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(coupons_create_run AB)" | sed 's/^coupons/x/')"
assert_eq check-empty 1 "$(coupons_validate_check '' && echo 0 || echo 1)"
assert_eq label 'coupons export' "$(coupons_export_label)"
assert_eq disc 600 "$(coupons_discount SAVE10 6000)"
finish

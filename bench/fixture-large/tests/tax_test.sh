D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(tax_create_run AB)" | sed 's/^tax/x/')"
assert_eq check-empty 1 "$(tax_validate_check '' && echo 0 || echo 1)"
assert_eq label 'tax export' "$(tax_export_label)"
finish

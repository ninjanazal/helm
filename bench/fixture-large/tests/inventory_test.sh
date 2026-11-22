D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(inventory_create_run AB)" | sed 's/^inventory/x/')"
assert_eq check-empty 1 "$(inventory_validate_check '' && echo 0 || echo 1)"
assert_eq label 'inventory export' "$(inventory_export_label)"
finish

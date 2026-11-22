D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(invoices_create_run AB)" | sed 's/^invoices/x/')"
assert_eq check-empty 1 "$(invoices_validate_check '' && echo 0 || echo 1)"
assert_eq label 'invoices export' "$(invoices_export_label)"
finish

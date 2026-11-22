D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(orders_create_run AB)" | sed 's/^orders/x/')"
assert_eq check-empty 1 "$(orders_validate_check '' && echo 0 || echo 1)"
assert_eq label 'orders export' "$(orders_export_label)"
assert_eq total 400 "$(orders_total 100 250 50)"
assert_eq grand 430 "$(invoices_grand_total 30 100 250 50)"
assert_eq daily 'mon: 400' "$(reports_daily_line mon 100 250 50)"
assert_eq balance 300 "$(customers_balance 100 100 250 50)"
finish

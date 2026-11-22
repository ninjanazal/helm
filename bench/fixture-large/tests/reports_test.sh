D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(reports_create_run AB)" | sed 's/^reports/x/')"
assert_eq check-empty 1 "$(reports_validate_check '' && echo 0 || echo 1)"
assert_eq label 'reports export' "$(reports_export_label)"
finish

D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(audit_create_run AB)" | sed 's/^audit/x/')"
assert_eq check-empty 1 "$(audit_validate_check '' && echo 0 || echo 1)"
assert_eq label 'audit export' "$(audit_export_label)"
finish

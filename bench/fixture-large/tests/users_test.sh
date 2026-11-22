D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(users_create_run AB)" | sed 's/^users/x/')"
assert_eq check-empty 1 "$(users_validate_check '' && echo 0 || echo 1)"
assert_eq label 'users export' "$(users_export_label)"
finish

D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(payments_create_run AB)" | sed 's/^payments/x/')"
assert_eq check-empty 1 "$(payments_validate_check '' && echo 0 || echo 1)"
assert_eq label 'payments export' "$(payments_export_label)"
assert_eq fee 320 "$(payments_fee 10000)"
finish

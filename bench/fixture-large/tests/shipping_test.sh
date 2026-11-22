D=$(cd "$(dirname "$0")/.." && pwd); cd "$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "$(printf '%s' "$(shipping_create_run AB)" | sed 's/^shipping/x/')"
assert_eq check-empty 1 "$(shipping_validate_check '' && echo 0 || echo 1)"
assert_eq label 'shipping export' "$(shipping_export_label)"
assert_eq quote-base 500 "$(shipping_quote 12000)"
assert_eq quote-heavy 530 "$(shipping_quote 21000)"
finish

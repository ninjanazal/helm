D=$(cd "$(dirname "$0")/.." && pwd); . "$D/tests/lib.sh"; . "$D/src/config.sh"; . "$D/src/billing.sh"
assert_eq grace 0 "$(late_fee 10000 5)"
assert_eq fee 700 "$(late_fee 10000 6)"
assert_eq total 10700 "$(invoice_total 10000 6)"
finish

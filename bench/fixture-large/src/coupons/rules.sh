# Coupon rules: one line per code, "<code> <percent off> <minimum order in cents>".
COUPON_RULES='
SAVE10 10 5000
WELCOME 15 0
BULK20 20 20000
'

# coupons_rule <code> <field>: field 1 = percent, 2 = minimum order; prints nothing for an unknown code.
coupons_rule() {
  printf '%s\n' "$COUPON_RULES" | awk -v c="$1" -v f="$2" '$1 == c { print $(f + 1) }'
}

# coupons_min_order <code>: the smallest order, in cents, the coupon applies to.
coupons_min_order() { coupons_rule "$1" 2; }

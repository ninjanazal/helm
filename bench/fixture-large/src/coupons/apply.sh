# coupons_discount <code> <order_cents>: cents taken off; 0 when the coupon is not eligible.
coupons_discount() {
  coupons_eligible "$1" "$2" || { printf 0; return 0; }
  printf '%s' $(( $2 * $(coupons_rule "$1" 1) / 100 ))
}

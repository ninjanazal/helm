# coupons_eligible <code> <order_cents>: succeeds when the code exists and the order reaches its minimum.
coupons_eligible() {
  min=$(coupons_min_order "$1")
  [ -n "$min" ] && [ "$2" -ge "$min" ]
}

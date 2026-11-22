# orders_total <cents...>: sum of the line amounts of an order.
orders_total() {
  t=0
  for a in "$@"; do t=$((t + a)); done
  printf '%s' "$t"
}

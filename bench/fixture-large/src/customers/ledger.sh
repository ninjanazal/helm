# customers_balance <paid_cents> <line_cents...>: what the customer still owes (orders_total minus paid).
customers_balance() {
  paid=$1; shift
  printf '%s' $(( $(orders_total "$@") - paid ))
}

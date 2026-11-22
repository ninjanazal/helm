# invoices_grand_total <tax_cents> <line_cents...>: order total (see orders_total) plus tax.
invoices_grand_total() {
  tax=$1; shift
  printf '%s' $(( $(orders_total "$@") + tax ))
}

# orders/format: the format step for orders records.

# orders_format_label: display label of the step.
orders_format_label() { printf '%s' "orders format"; }

# orders_format_check <value>: a orders value must be non-empty and at most 64 characters.
orders_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_format_run <value>: run the format step on a orders value; prints it normalised, fails when the check does.
orders_format_run() {
  orders_format_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

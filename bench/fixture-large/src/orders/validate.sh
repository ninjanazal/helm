# orders/validate: the validate step for orders records.

# orders_validate_label: display label of the step.
orders_validate_label() { printf '%s' "orders validate"; }

# orders_validate_check <value>: a orders value must be non-empty and at most 64 characters.
orders_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_validate_run <value>: run the validate step on a orders value; prints it normalised, fails when the check does.
orders_validate_run() {
  orders_validate_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

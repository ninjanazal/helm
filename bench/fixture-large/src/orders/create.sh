# orders/create: the create step for orders records.

# orders_create_label: display label of the step.
orders_create_label() { printf '%s' "orders create"; }

# orders_create_check <value>: a orders value must be non-empty and at most 64 characters.
orders_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_create_run <value>: run the create step on a orders value; prints it normalised, fails when the check does.
orders_create_run() {
  orders_create_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

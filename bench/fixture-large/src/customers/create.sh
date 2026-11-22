# customers/create: the create step for customers records.

# customers_create_label: display label of the step.
customers_create_label() { printf '%s' "customers create"; }

# customers_create_check <value>: a customers value must be non-empty and at most 64 characters.
customers_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_create_run <value>: run the create step on a customers value; prints it normalised, fails when the check does.
customers_create_run() {
  customers_create_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

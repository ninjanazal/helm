# shipping/create: the create step for shipping records.

# shipping_create_label: display label of the step.
shipping_create_label() { printf '%s' "shipping create"; }

# shipping_create_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_create_run <value>: run the create step on a shipping value; prints it normalised, fails when the check does.
shipping_create_run() {
  shipping_create_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

# shipping/validate: the validate step for shipping records.

# shipping_validate_label: display label of the step.
shipping_validate_label() { printf '%s' "shipping validate"; }

# shipping_validate_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_validate_run <value>: run the validate step on a shipping value; prints it normalised, fails when the check does.
shipping_validate_run() {
  shipping_validate_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

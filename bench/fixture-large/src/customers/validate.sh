# customers/validate: the validate step for customers records.

# customers_validate_label: display label of the step.
customers_validate_label() { printf '%s' "customers validate"; }

# customers_validate_check <value>: a customers value must be non-empty and at most 64 characters.
customers_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_validate_run <value>: run the validate step on a customers value; prints it normalised, fails when the check does.
customers_validate_run() {
  customers_validate_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

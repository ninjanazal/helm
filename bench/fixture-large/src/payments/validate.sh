# payments/validate: the validate step for payments records.

# payments_validate_label: display label of the step.
payments_validate_label() { printf '%s' "payments validate"; }

# payments_validate_check <value>: a payments value must be non-empty and at most 64 characters.
payments_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_validate_run <value>: run the validate step on a payments value; prints it normalised, fails when the check does.
payments_validate_run() {
  payments_validate_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

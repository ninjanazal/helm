# tax/validate: the validate step for tax records.

# tax_validate_label: display label of the step.
tax_validate_label() { printf '%s' "tax validate"; }

# tax_validate_check <value>: a tax value must be non-empty and at most 64 characters.
tax_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_validate_run <value>: run the validate step on a tax value; prints it normalised, fails when the check does.
tax_validate_run() {
  tax_validate_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

# tax/create: the create step for tax records.

# tax_create_label: display label of the step.
tax_create_label() { printf '%s' "tax create"; }

# tax_create_check <value>: a tax value must be non-empty and at most 64 characters.
tax_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_create_run <value>: run the create step on a tax value; prints it normalised, fails when the check does.
tax_create_run() {
  tax_create_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

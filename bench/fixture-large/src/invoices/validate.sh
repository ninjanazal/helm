# invoices/validate: the validate step for invoices records.

# invoices_validate_label: display label of the step.
invoices_validate_label() { printf '%s' "invoices validate"; }

# invoices_validate_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_validate_run <value>: run the validate step on a invoices value; prints it normalised, fails when the check does.
invoices_validate_run() {
  invoices_validate_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

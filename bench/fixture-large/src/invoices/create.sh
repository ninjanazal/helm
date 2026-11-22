# invoices/create: the create step for invoices records.

# invoices_create_label: display label of the step.
invoices_create_label() { printf '%s' "invoices create"; }

# invoices_create_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_create_run <value>: run the create step on a invoices value; prints it normalised, fails when the check does.
invoices_create_run() {
  invoices_create_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

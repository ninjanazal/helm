# invoices/import: the import step for invoices records.

# invoices_import_label: display label of the step.
invoices_import_label() { printf '%s' "invoices import"; }

# invoices_import_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_import_run <value>: run the import step on a invoices value; prints it normalised, fails when the check does.
invoices_import_run() {
  invoices_import_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

# invoices/export: the export step for invoices records.

# invoices_export_label: display label of the step.
invoices_export_label() { printf '%s' "invoices export"; }

# invoices_export_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_export_run <value>: run the export step on a invoices value; prints it normalised, fails when the check does.
invoices_export_run() {
  invoices_export_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

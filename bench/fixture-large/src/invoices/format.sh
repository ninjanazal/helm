# invoices/format: the format step for invoices records.

# invoices_format_label: display label of the step.
invoices_format_label() { printf '%s' "invoices format"; }

# invoices_format_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_format_run <value>: run the format step on a invoices value; prints it normalised, fails when the check does.
invoices_format_run() {
  invoices_format_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

# invoices/summary: the summary step for invoices records.

# invoices_summary_label: display label of the step.
invoices_summary_label() { printf '%s' "invoices summary"; }

# invoices_summary_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_summary_run <value>: run the summary step on a invoices value; prints it normalised, fails when the check does.
invoices_summary_run() {
  invoices_summary_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

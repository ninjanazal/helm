# invoices/notify: the notify step for invoices records.

# invoices_notify_label: display label of the step.
invoices_notify_label() { printf '%s' "invoices notify"; }

# invoices_notify_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_notify_run <value>: run the notify step on a invoices value; prints it normalised, fails when the check does.
invoices_notify_run() {
  invoices_notify_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

# tax/notify: the notify step for tax records.

# tax_notify_label: display label of the step.
tax_notify_label() { printf '%s' "tax notify"; }

# tax_notify_check <value>: a tax value must be non-empty and at most 64 characters.
tax_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_notify_run <value>: run the notify step on a tax value; prints it normalised, fails when the check does.
tax_notify_run() {
  tax_notify_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

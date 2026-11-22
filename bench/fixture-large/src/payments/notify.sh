# payments/notify: the notify step for payments records.

# payments_notify_label: display label of the step.
payments_notify_label() { printf '%s' "payments notify"; }

# payments_notify_check <value>: a payments value must be non-empty and at most 64 characters.
payments_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_notify_run <value>: run the notify step on a payments value; prints it normalised, fails when the check does.
payments_notify_run() {
  payments_notify_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

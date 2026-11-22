# customers/notify: the notify step for customers records.

# customers_notify_label: display label of the step.
customers_notify_label() { printf '%s' "customers notify"; }

# customers_notify_check <value>: a customers value must be non-empty and at most 64 characters.
customers_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_notify_run <value>: run the notify step on a customers value; prints it normalised, fails when the check does.
customers_notify_run() {
  customers_notify_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

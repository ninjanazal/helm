# shipping/notify: the notify step for shipping records.

# shipping_notify_label: display label of the step.
shipping_notify_label() { printf '%s' "shipping notify"; }

# shipping_notify_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_notify_run <value>: run the notify step on a shipping value; prints it normalised, fails when the check does.
shipping_notify_run() {
  shipping_notify_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

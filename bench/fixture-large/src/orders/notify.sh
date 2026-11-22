# orders/notify: the notify step for orders records.

# orders_notify_label: display label of the step.
orders_notify_label() { printf '%s' "orders notify"; }

# orders_notify_check <value>: a orders value must be non-empty and at most 64 characters.
orders_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_notify_run <value>: run the notify step on a orders value; prints it normalised, fails when the check does.
orders_notify_run() {
  orders_notify_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

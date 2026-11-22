# inventory/notify: the notify step for inventory records.

# inventory_notify_label: display label of the step.
inventory_notify_label() { printf '%s' "inventory notify"; }

# inventory_notify_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_notify_run <value>: run the notify step on a inventory value; prints it normalised, fails when the check does.
inventory_notify_run() {
  inventory_notify_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

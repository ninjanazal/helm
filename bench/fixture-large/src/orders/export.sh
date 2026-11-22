# orders/export: the export step for orders records.

# orders_export_label: display label of the step.
orders_export_label() { printf '%s' "orders export"; }

# orders_export_check <value>: a orders value must be non-empty and at most 64 characters.
orders_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_export_run <value>: run the export step on a orders value; prints it normalised, fails when the check does.
orders_export_run() {
  orders_export_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

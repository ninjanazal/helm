# orders/import: the import step for orders records.

# orders_import_label: display label of the step.
orders_import_label() { printf '%s' "orders import"; }

# orders_import_check <value>: a orders value must be non-empty and at most 64 characters.
orders_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_import_run <value>: run the import step on a orders value; prints it normalised, fails when the check does.
orders_import_run() {
  orders_import_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

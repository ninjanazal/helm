# inventory/import: the import step for inventory records.

# inventory_import_label: display label of the step.
inventory_import_label() { printf '%s' "inventory import"; }

# inventory_import_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_import_run <value>: run the import step on a inventory value; prints it normalised, fails when the check does.
inventory_import_run() {
  inventory_import_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

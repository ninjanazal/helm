# inventory/export: the export step for inventory records.

# inventory_export_label: display label of the step.
inventory_export_label() { printf '%s' "inventory export"; }

# inventory_export_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_export_run <value>: run the export step on a inventory value; prints it normalised, fails when the check does.
inventory_export_run() {
  inventory_export_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

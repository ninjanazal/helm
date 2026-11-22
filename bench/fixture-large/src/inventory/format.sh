# inventory/format: the format step for inventory records.

# inventory_format_label: display label of the step.
inventory_format_label() { printf '%s' "inventory format"; }

# inventory_format_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_format_run <value>: run the format step on a inventory value; prints it normalised, fails when the check does.
inventory_format_run() {
  inventory_format_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

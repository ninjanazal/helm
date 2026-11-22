# inventory/validate: the validate step for inventory records.

# inventory_validate_label: display label of the step.
inventory_validate_label() { printf '%s' "inventory validate"; }

# inventory_validate_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_validate_run <value>: run the validate step on a inventory value; prints it normalised, fails when the check does.
inventory_validate_run() {
  inventory_validate_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

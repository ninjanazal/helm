# inventory/create: the create step for inventory records.

# inventory_create_label: display label of the step.
inventory_create_label() { printf '%s' "inventory create"; }

# inventory_create_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_create_run <value>: run the create step on a inventory value; prints it normalised, fails when the check does.
inventory_create_run() {
  inventory_create_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

# inventory/summary: the summary step for inventory records.

# inventory_summary_label: display label of the step.
inventory_summary_label() { printf '%s' "inventory summary"; }

# inventory_summary_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_summary_run <value>: run the summary step on a inventory value; prints it normalised, fails when the check does.
inventory_summary_run() {
  inventory_summary_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

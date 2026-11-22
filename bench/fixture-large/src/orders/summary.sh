# orders/summary: the summary step for orders records.

# orders_summary_label: display label of the step.
orders_summary_label() { printf '%s' "orders summary"; }

# orders_summary_check <value>: a orders value must be non-empty and at most 64 characters.
orders_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_summary_run <value>: run the summary step on a orders value; prints it normalised, fails when the check does.
orders_summary_run() {
  orders_summary_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

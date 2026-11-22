# customers/summary: the summary step for customers records.

# customers_summary_label: display label of the step.
customers_summary_label() { printf '%s' "customers summary"; }

# customers_summary_check <value>: a customers value must be non-empty and at most 64 characters.
customers_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_summary_run <value>: run the summary step on a customers value; prints it normalised, fails when the check does.
customers_summary_run() {
  customers_summary_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

# shipping/summary: the summary step for shipping records.

# shipping_summary_label: display label of the step.
shipping_summary_label() { printf '%s' "shipping summary"; }

# shipping_summary_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_summary_run <value>: run the summary step on a shipping value; prints it normalised, fails when the check does.
shipping_summary_run() {
  shipping_summary_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

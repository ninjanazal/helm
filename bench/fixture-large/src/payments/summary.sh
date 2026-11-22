# payments/summary: the summary step for payments records.

# payments_summary_label: display label of the step.
payments_summary_label() { printf '%s' "payments summary"; }

# payments_summary_check <value>: a payments value must be non-empty and at most 64 characters.
payments_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_summary_run <value>: run the summary step on a payments value; prints it normalised, fails when the check does.
payments_summary_run() {
  payments_summary_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

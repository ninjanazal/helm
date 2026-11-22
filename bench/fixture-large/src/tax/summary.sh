# tax/summary: the summary step for tax records.

# tax_summary_label: display label of the step.
tax_summary_label() { printf '%s' "tax summary"; }

# tax_summary_check <value>: a tax value must be non-empty and at most 64 characters.
tax_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_summary_run <value>: run the summary step on a tax value; prints it normalised, fails when the check does.
tax_summary_run() {
  tax_summary_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

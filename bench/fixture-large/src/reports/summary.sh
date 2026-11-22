# reports/summary: the summary step for reports records.

# reports_summary_label: display label of the step.
reports_summary_label() { printf '%s' "reports summary"; }

# reports_summary_check <value>: a reports value must be non-empty and at most 64 characters.
reports_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_summary_run <value>: run the summary step on a reports value; prints it normalised, fails when the check does.
reports_summary_run() {
  reports_summary_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

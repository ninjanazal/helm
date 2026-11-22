# reports/format: the format step for reports records.

# reports_format_label: display label of the step.
reports_format_label() { printf '%s' "reports format"; }

# reports_format_check <value>: a reports value must be non-empty and at most 64 characters.
reports_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_format_run <value>: run the format step on a reports value; prints it normalised, fails when the check does.
reports_format_run() {
  reports_format_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

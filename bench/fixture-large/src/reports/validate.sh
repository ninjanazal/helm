# reports/validate: the validate step for reports records.

# reports_validate_label: display label of the step.
reports_validate_label() { printf '%s' "reports validate"; }

# reports_validate_check <value>: a reports value must be non-empty and at most 64 characters.
reports_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_validate_run <value>: run the validate step on a reports value; prints it normalised, fails when the check does.
reports_validate_run() {
  reports_validate_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

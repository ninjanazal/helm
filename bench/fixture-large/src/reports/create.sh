# reports/create: the create step for reports records.

# reports_create_label: display label of the step.
reports_create_label() { printf '%s' "reports create"; }

# reports_create_check <value>: a reports value must be non-empty and at most 64 characters.
reports_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_create_run <value>: run the create step on a reports value; prints it normalised, fails when the check does.
reports_create_run() {
  reports_create_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

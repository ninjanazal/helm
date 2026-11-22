# reports/export: the export step for reports records.

# reports_export_label: display label of the step.
reports_export_label() { printf '%s' "reports export"; }

# reports_export_check <value>: a reports value must be non-empty and at most 64 characters.
reports_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_export_run <value>: run the export step on a reports value; prints it normalised, fails when the check does.
reports_export_run() {
  reports_export_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

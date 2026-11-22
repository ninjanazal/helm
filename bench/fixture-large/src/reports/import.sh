# reports/import: the import step for reports records.

# reports_import_label: display label of the step.
reports_import_label() { printf '%s' "reports import"; }

# reports_import_check <value>: a reports value must be non-empty and at most 64 characters.
reports_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_import_run <value>: run the import step on a reports value; prints it normalised, fails when the check does.
reports_import_run() {
  reports_import_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

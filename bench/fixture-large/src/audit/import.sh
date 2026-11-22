# audit/import: the import step for audit records.

# audit_import_label: display label of the step.
audit_import_label() { printf '%s' "audit import"; }

# audit_import_check <value>: a audit value must be non-empty and at most 64 characters.
audit_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_import_run <value>: run the import step on a audit value; prints it normalised, fails when the check does.
audit_import_run() {
  audit_import_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

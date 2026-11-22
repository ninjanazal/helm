# audit/export: the export step for audit records.

# audit_export_label: display label of the step.
audit_export_label() { printf '%s' "audit export"; }

# audit_export_check <value>: a audit value must be non-empty and at most 64 characters.
audit_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_export_run <value>: run the export step on a audit value; prints it normalised, fails when the check does.
audit_export_run() {
  audit_export_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

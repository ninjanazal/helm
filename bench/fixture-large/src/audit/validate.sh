# audit/validate: the validate step for audit records.

# audit_validate_label: display label of the step.
audit_validate_label() { printf '%s' "audit validate"; }

# audit_validate_check <value>: a audit value must be non-empty and at most 64 characters.
audit_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_validate_run <value>: run the validate step on a audit value; prints it normalised, fails when the check does.
audit_validate_run() {
  audit_validate_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

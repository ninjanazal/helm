# audit/format: the format step for audit records.

# audit_format_label: display label of the step.
audit_format_label() { printf '%s' "audit format"; }

# audit_format_check <value>: a audit value must be non-empty and at most 64 characters.
audit_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_format_run <value>: run the format step on a audit value; prints it normalised, fails when the check does.
audit_format_run() {
  audit_format_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

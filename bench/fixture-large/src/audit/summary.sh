# audit/summary: the summary step for audit records.

# audit_summary_label: display label of the step.
audit_summary_label() { printf '%s' "audit summary"; }

# audit_summary_check <value>: a audit value must be non-empty and at most 64 characters.
audit_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_summary_run <value>: run the summary step on a audit value; prints it normalised, fails when the check does.
audit_summary_run() {
  audit_summary_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

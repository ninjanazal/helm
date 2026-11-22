# audit/notify: the notify step for audit records.

# audit_notify_label: display label of the step.
audit_notify_label() { printf '%s' "audit notify"; }

# audit_notify_check <value>: a audit value must be non-empty and at most 64 characters.
audit_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_notify_run <value>: run the notify step on a audit value; prints it normalised, fails when the check does.
audit_notify_run() {
  audit_notify_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

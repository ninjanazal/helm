# audit/create: the create step for audit records.

# audit_create_label: display label of the step.
audit_create_label() { printf '%s' "audit create"; }

# audit_create_check <value>: a audit value must be non-empty and at most 64 characters.
audit_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_create_run <value>: run the create step on a audit value; prints it normalised, fails when the check does.
audit_create_run() {
  audit_create_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

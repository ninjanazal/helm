# audit/archive: the archive step for audit records.

# audit_archive_label: display label of the step.
audit_archive_label() { printf '%s' "audit archive"; }

# audit_archive_check <value>: a audit value must be non-empty and at most 64 characters.
audit_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# audit_archive_run <value>: run the archive step on a audit value; prints it normalised, fails when the check does.
audit_archive_run() {
  audit_archive_check "$1" || return 1
  printf '%s:%s' "audit" "$1" | tr 'A-Z' 'a-z'
}

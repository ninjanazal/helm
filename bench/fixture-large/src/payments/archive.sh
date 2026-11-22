# payments/archive: the archive step for payments records.

# payments_archive_label: display label of the step.
payments_archive_label() { printf '%s' "payments archive"; }

# payments_archive_check <value>: a payments value must be non-empty and at most 64 characters.
payments_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_archive_run <value>: run the archive step on a payments value; prints it normalised, fails when the check does.
payments_archive_run() {
  payments_archive_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

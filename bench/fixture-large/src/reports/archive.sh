# reports/archive: the archive step for reports records.

# reports_archive_label: display label of the step.
reports_archive_label() { printf '%s' "reports archive"; }

# reports_archive_check <value>: a reports value must be non-empty and at most 64 characters.
reports_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_archive_run <value>: run the archive step on a reports value; prints it normalised, fails when the check does.
reports_archive_run() {
  reports_archive_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

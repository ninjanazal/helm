# customers/archive: the archive step for customers records.

# customers_archive_label: display label of the step.
customers_archive_label() { printf '%s' "customers archive"; }

# customers_archive_check <value>: a customers value must be non-empty and at most 64 characters.
customers_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_archive_run <value>: run the archive step on a customers value; prints it normalised, fails when the check does.
customers_archive_run() {
  customers_archive_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

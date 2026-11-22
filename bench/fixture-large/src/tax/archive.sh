# tax/archive: the archive step for tax records.

# tax_archive_label: display label of the step.
tax_archive_label() { printf '%s' "tax archive"; }

# tax_archive_check <value>: a tax value must be non-empty and at most 64 characters.
tax_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_archive_run <value>: run the archive step on a tax value; prints it normalised, fails when the check does.
tax_archive_run() {
  tax_archive_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

# invoices/archive: the archive step for invoices records.

# invoices_archive_label: display label of the step.
invoices_archive_label() { printf '%s' "invoices archive"; }

# invoices_archive_check <value>: a invoices value must be non-empty and at most 64 characters.
invoices_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# invoices_archive_run <value>: run the archive step on a invoices value; prints it normalised, fails when the check does.
invoices_archive_run() {
  invoices_archive_check "$1" || return 1
  printf '%s:%s' "invoices" "$1" | tr 'A-Z' 'a-z'
}

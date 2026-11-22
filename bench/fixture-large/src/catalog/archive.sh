# catalog/archive: the archive step for catalog records.

# catalog_archive_label: display label of the step.
catalog_archive_label() { printf '%s' "catalog archive"; }

# catalog_archive_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_archive_run <value>: run the archive step on a catalog value; prints it normalised, fails when the check does.
catalog_archive_run() {
  catalog_archive_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

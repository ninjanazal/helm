# catalog/import: the import step for catalog records.

# catalog_import_label: display label of the step.
catalog_import_label() { printf '%s' "catalog import"; }

# catalog_import_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_import_run <value>: run the import step on a catalog value; prints it normalised, fails when the check does.
catalog_import_run() {
  catalog_import_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

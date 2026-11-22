# catalog/export: the export step for catalog records.

# catalog_export_label: display label of the step.
catalog_export_label() { printf '%s' "catalog export"; }

# catalog_export_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_export_run <value>: run the export step on a catalog value; prints it normalised, fails when the check does.
catalog_export_run() {
  catalog_export_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

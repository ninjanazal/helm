# catalog/format: the format step for catalog records.

# catalog_format_label: display label of the step.
catalog_format_label() { printf '%s' "catalog format"; }

# catalog_format_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_format_run <value>: run the format step on a catalog value; prints it normalised, fails when the check does.
catalog_format_run() {
  catalog_format_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

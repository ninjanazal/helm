# catalog/validate: the validate step for catalog records.

# catalog_validate_label: display label of the step.
catalog_validate_label() { printf '%s' "catalog validate"; }

# catalog_validate_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_validate_run <value>: run the validate step on a catalog value; prints it normalised, fails when the check does.
catalog_validate_run() {
  catalog_validate_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

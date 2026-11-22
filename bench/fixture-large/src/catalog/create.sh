# catalog/create: the create step for catalog records.

# catalog_create_label: display label of the step.
catalog_create_label() { printf '%s' "catalog create"; }

# catalog_create_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_create_run <value>: run the create step on a catalog value; prints it normalised, fails when the check does.
catalog_create_run() {
  catalog_create_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

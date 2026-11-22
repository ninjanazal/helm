# customers/import: the import step for customers records.

# customers_import_label: display label of the step.
customers_import_label() { printf '%s' "customers import"; }

# customers_import_check <value>: a customers value must be non-empty and at most 64 characters.
customers_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_import_run <value>: run the import step on a customers value; prints it normalised, fails when the check does.
customers_import_run() {
  customers_import_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

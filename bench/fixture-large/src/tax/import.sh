# tax/import: the import step for tax records.

# tax_import_label: display label of the step.
tax_import_label() { printf '%s' "tax import"; }

# tax_import_check <value>: a tax value must be non-empty and at most 64 characters.
tax_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_import_run <value>: run the import step on a tax value; prints it normalised, fails when the check does.
tax_import_run() {
  tax_import_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

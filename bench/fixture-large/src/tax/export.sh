# tax/export: the export step for tax records.

# tax_export_label: display label of the step.
tax_export_label() { printf '%s' "tax export"; }

# tax_export_check <value>: a tax value must be non-empty and at most 64 characters.
tax_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_export_run <value>: run the export step on a tax value; prints it normalised, fails when the check does.
tax_export_run() {
  tax_export_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

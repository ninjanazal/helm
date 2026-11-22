# customers/export: the export step for customers records.

# customers_export_label: display label of the step.
customers_export_label() { printf '%s' "customers export"; }

# customers_export_check <value>: a customers value must be non-empty and at most 64 characters.
customers_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_export_run <value>: run the export step on a customers value; prints it normalised, fails when the check does.
customers_export_run() {
  customers_export_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

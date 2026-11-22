# payments/export: the export step for payments records.

# payments_export_label: display label of the step.
payments_export_label() { printf '%s' "payments export"; }

# payments_export_check <value>: a payments value must be non-empty and at most 64 characters.
payments_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_export_run <value>: run the export step on a payments value; prints it normalised, fails when the check does.
payments_export_run() {
  payments_export_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

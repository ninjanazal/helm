# payments/import: the import step for payments records.

# payments_import_label: display label of the step.
payments_import_label() { printf '%s' "payments import"; }

# payments_import_check <value>: a payments value must be non-empty and at most 64 characters.
payments_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_import_run <value>: run the import step on a payments value; prints it normalised, fails when the check does.
payments_import_run() {
  payments_import_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

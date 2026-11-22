# coupons/import: the import step for coupons records.

# coupons_import_label: display label of the step.
coupons_import_label() { printf '%s' "coupons import"; }

# coupons_import_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_import_run <value>: run the import step on a coupons value; prints it normalised, fails when the check does.
coupons_import_run() {
  coupons_import_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

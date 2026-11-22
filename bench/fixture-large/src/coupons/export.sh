# coupons/export: the export step for coupons records.

# coupons_export_label: display label of the step.
coupons_export_label() { printf '%s' "coupons export"; }

# coupons_export_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_export_run <value>: run the export step on a coupons value; prints it normalised, fails when the check does.
coupons_export_run() {
  coupons_export_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

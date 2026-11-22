# coupons/validate: the validate step for coupons records.

# coupons_validate_label: display label of the step.
coupons_validate_label() { printf '%s' "coupons validate"; }

# coupons_validate_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_validate_run <value>: run the validate step on a coupons value; prints it normalised, fails when the check does.
coupons_validate_run() {
  coupons_validate_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

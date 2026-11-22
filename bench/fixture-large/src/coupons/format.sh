# coupons/format: the format step for coupons records.

# coupons_format_label: display label of the step.
coupons_format_label() { printf '%s' "coupons format"; }

# coupons_format_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_format_run <value>: run the format step on a coupons value; prints it normalised, fails when the check does.
coupons_format_run() {
  coupons_format_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

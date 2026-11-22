# coupons/create: the create step for coupons records.

# coupons_create_label: display label of the step.
coupons_create_label() { printf '%s' "coupons create"; }

# coupons_create_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_create_run <value>: run the create step on a coupons value; prints it normalised, fails when the check does.
coupons_create_run() {
  coupons_create_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

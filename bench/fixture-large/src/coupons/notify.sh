# coupons/notify: the notify step for coupons records.

# coupons_notify_label: display label of the step.
coupons_notify_label() { printf '%s' "coupons notify"; }

# coupons_notify_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_notify_run <value>: run the notify step on a coupons value; prints it normalised, fails when the check does.
coupons_notify_run() {
  coupons_notify_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

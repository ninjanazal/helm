# coupons/summary: the summary step for coupons records.

# coupons_summary_label: display label of the step.
coupons_summary_label() { printf '%s' "coupons summary"; }

# coupons_summary_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_summary_run <value>: run the summary step on a coupons value; prints it normalised, fails when the check does.
coupons_summary_run() {
  coupons_summary_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

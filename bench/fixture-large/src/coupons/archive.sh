# coupons/archive: the archive step for coupons records.

# coupons_archive_label: display label of the step.
coupons_archive_label() { printf '%s' "coupons archive"; }

# coupons_archive_check <value>: a coupons value must be non-empty and at most 64 characters.
coupons_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# coupons_archive_run <value>: run the archive step on a coupons value; prints it normalised, fails when the check does.
coupons_archive_run() {
  coupons_archive_check "$1" || return 1
  printf '%s:%s' "coupons" "$1" | tr 'A-Z' 'a-z'
}

# shipping/archive: the archive step for shipping records.

# shipping_archive_label: display label of the step.
shipping_archive_label() { printf '%s' "shipping archive"; }

# shipping_archive_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_archive_run <value>: run the archive step on a shipping value; prints it normalised, fails when the check does.
shipping_archive_run() {
  shipping_archive_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

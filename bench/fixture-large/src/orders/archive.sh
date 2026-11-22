# orders/archive: the archive step for orders records.

# orders_archive_label: display label of the step.
orders_archive_label() { printf '%s' "orders archive"; }

# orders_archive_check <value>: a orders value must be non-empty and at most 64 characters.
orders_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# orders_archive_run <value>: run the archive step on a orders value; prints it normalised, fails when the check does.
orders_archive_run() {
  orders_archive_check "$1" || return 1
  printf '%s:%s' "orders" "$1" | tr 'A-Z' 'a-z'
}

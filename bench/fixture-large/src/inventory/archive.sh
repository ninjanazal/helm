# inventory/archive: the archive step for inventory records.

# inventory_archive_label: display label of the step.
inventory_archive_label() { printf '%s' "inventory archive"; }

# inventory_archive_check <value>: a inventory value must be non-empty and at most 64 characters.
inventory_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# inventory_archive_run <value>: run the archive step on a inventory value; prints it normalised, fails when the check does.
inventory_archive_run() {
  inventory_archive_check "$1" || return 1
  printf '%s:%s' "inventory" "$1" | tr 'A-Z' 'a-z'
}

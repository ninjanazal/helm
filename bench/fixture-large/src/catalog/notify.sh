# catalog/notify: the notify step for catalog records.

# catalog_notify_label: display label of the step.
catalog_notify_label() { printf '%s' "catalog notify"; }

# catalog_notify_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_notify_run <value>: run the notify step on a catalog value; prints it normalised, fails when the check does.
catalog_notify_run() {
  catalog_notify_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

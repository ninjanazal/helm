# shipping/import: the import step for shipping records.

# shipping_import_label: display label of the step.
shipping_import_label() { printf '%s' "shipping import"; }

# shipping_import_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_import_run <value>: run the import step on a shipping value; prints it normalised, fails when the check does.
shipping_import_run() {
  shipping_import_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

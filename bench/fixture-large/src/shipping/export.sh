# shipping/export: the export step for shipping records.

# shipping_export_label: display label of the step.
shipping_export_label() { printf '%s' "shipping export"; }

# shipping_export_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_export_run <value>: run the export step on a shipping value; prints it normalised, fails when the check does.
shipping_export_run() {
  shipping_export_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

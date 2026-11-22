# shipping/format: the format step for shipping records.

# shipping_format_label: display label of the step.
shipping_format_label() { printf '%s' "shipping format"; }

# shipping_format_check <value>: a shipping value must be non-empty and at most 64 characters.
shipping_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# shipping_format_run <value>: run the format step on a shipping value; prints it normalised, fails when the check does.
shipping_format_run() {
  shipping_format_check "$1" || return 1
  printf '%s:%s' "shipping" "$1" | tr 'A-Z' 'a-z'
}

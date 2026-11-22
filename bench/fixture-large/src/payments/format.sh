# payments/format: the format step for payments records.

# payments_format_label: display label of the step.
payments_format_label() { printf '%s' "payments format"; }

# payments_format_check <value>: a payments value must be non-empty and at most 64 characters.
payments_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_format_run <value>: run the format step on a payments value; prints it normalised, fails when the check does.
payments_format_run() {
  payments_format_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

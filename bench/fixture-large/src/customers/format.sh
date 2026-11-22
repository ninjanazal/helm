# customers/format: the format step for customers records.

# customers_format_label: display label of the step.
customers_format_label() { printf '%s' "customers format"; }

# customers_format_check <value>: a customers value must be non-empty and at most 64 characters.
customers_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# customers_format_run <value>: run the format step on a customers value; prints it normalised, fails when the check does.
customers_format_run() {
  customers_format_check "$1" || return 1
  printf '%s:%s' "customers" "$1" | tr 'A-Z' 'a-z'
}

# tax/format: the format step for tax records.

# tax_format_label: display label of the step.
tax_format_label() { printf '%s' "tax format"; }

# tax_format_check <value>: a tax value must be non-empty and at most 64 characters.
tax_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# tax_format_run <value>: run the format step on a tax value; prints it normalised, fails when the check does.
tax_format_run() {
  tax_format_check "$1" || return 1
  printf '%s:%s' "tax" "$1" | tr 'A-Z' 'a-z'
}

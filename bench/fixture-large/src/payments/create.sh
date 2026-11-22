# payments/create: the create step for payments records.

# payments_create_label: display label of the step.
payments_create_label() { printf '%s' "payments create"; }

# payments_create_check <value>: a payments value must be non-empty and at most 64 characters.
payments_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# payments_create_run <value>: run the create step on a payments value; prints it normalised, fails when the check does.
payments_create_run() {
  payments_create_check "$1" || return 1
  printf '%s:%s' "payments" "$1" | tr 'A-Z' 'a-z'
}

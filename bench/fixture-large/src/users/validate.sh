# users/validate: the validate step for users records.

# users_validate_label: display label of the step.
users_validate_label() { printf '%s' "users validate"; }

# users_validate_check <value>: a users value must be non-empty and at most 64 characters.
users_validate_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_validate_run <value>: run the validate step on a users value; prints it normalised, fails when the check does.
users_validate_run() {
  users_validate_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

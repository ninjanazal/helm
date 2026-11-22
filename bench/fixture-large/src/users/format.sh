# users/format: the format step for users records.

# users_format_label: display label of the step.
users_format_label() { printf '%s' "users format"; }

# users_format_check <value>: a users value must be non-empty and at most 64 characters.
users_format_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_format_run <value>: run the format step on a users value; prints it normalised, fails when the check does.
users_format_run() {
  users_format_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

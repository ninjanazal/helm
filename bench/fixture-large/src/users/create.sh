# users/create: the create step for users records.

# users_create_label: display label of the step.
users_create_label() { printf '%s' "users create"; }

# users_create_check <value>: a users value must be non-empty and at most 64 characters.
users_create_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_create_run <value>: run the create step on a users value; prints it normalised, fails when the check does.
users_create_run() {
  users_create_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

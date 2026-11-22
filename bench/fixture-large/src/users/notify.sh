# users/notify: the notify step for users records.

# users_notify_label: display label of the step.
users_notify_label() { printf '%s' "users notify"; }

# users_notify_check <value>: a users value must be non-empty and at most 64 characters.
users_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_notify_run <value>: run the notify step on a users value; prints it normalised, fails when the check does.
users_notify_run() {
  users_notify_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

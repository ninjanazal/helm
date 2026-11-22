# users/summary: the summary step for users records.

# users_summary_label: display label of the step.
users_summary_label() { printf '%s' "users summary"; }

# users_summary_check <value>: a users value must be non-empty and at most 64 characters.
users_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_summary_run <value>: run the summary step on a users value; prints it normalised, fails when the check does.
users_summary_run() {
  users_summary_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

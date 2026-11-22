# users/export: the export step for users records.

# users_export_label: display label of the step.
users_export_label() { printf '%s' "users export"; }

# users_export_check <value>: a users value must be non-empty and at most 64 characters.
users_export_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_export_run <value>: run the export step on a users value; prints it normalised, fails when the check does.
users_export_run() {
  users_export_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

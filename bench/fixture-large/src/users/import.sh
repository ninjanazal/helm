# users/import: the import step for users records.

# users_import_label: display label of the step.
users_import_label() { printf '%s' "users import"; }

# users_import_check <value>: a users value must be non-empty and at most 64 characters.
users_import_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_import_run <value>: run the import step on a users value; prints it normalised, fails when the check does.
users_import_run() {
  users_import_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

# users/archive: the archive step for users records.

# users_archive_label: display label of the step.
users_archive_label() { printf '%s' "users archive"; }

# users_archive_check <value>: a users value must be non-empty and at most 64 characters.
users_archive_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# users_archive_run <value>: run the archive step on a users value; prints it normalised, fails when the check does.
users_archive_run() {
  users_archive_check "$1" || return 1
  printf '%s:%s' "users" "$1" | tr 'A-Z' 'a-z'
}

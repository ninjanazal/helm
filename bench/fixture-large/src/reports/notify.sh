# reports/notify: the notify step for reports records.

# reports_notify_label: display label of the step.
reports_notify_label() { printf '%s' "reports notify"; }

# reports_notify_check <value>: a reports value must be non-empty and at most 64 characters.
reports_notify_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# reports_notify_run <value>: run the notify step on a reports value; prints it normalised, fails when the check does.
reports_notify_run() {
  reports_notify_check "$1" || return 1
  printf '%s:%s' "reports" "$1" | tr 'A-Z' 'a-z'
}

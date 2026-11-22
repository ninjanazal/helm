# catalog/summary: the summary step for catalog records.

# catalog_summary_label: display label of the step.
catalog_summary_label() { printf '%s' "catalog summary"; }

# catalog_summary_check <value>: a catalog value must be non-empty and at most 64 characters.
catalog_summary_check() { [ -n "$1" ] && [ "${#1}" -le 64 ]; }

# catalog_summary_run <value>: run the summary step on a catalog value; prints it normalised, fails when the check does.
catalog_summary_run() {
  catalog_summary_check "$1" || return 1
  printf '%s:%s' "catalog" "$1" | tr 'A-Z' 'a-z'
}

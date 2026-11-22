# Formatting for people records. Needs strutil.sh sourced first.

# fmt_name <text>: trimmed, single-spaced, Title Case.
fmt_name() {
  title_case "$(printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]][[:space:]]*/ /g')"
}

# fmt_city <text>: trimmed, single-spaced, Title Case.
fmt_city() {
  title_case "$(printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]][[:space:]]*/ /g')"
}

# fmt_street <text>: trimmed and single-spaced; case is kept.
fmt_street() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/[[:space:]][[:space:]]*/ /g'
}

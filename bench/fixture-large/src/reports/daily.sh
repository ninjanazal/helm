# reports_daily_line <label> <line_cents...>: one report line with the orders_total of the day.
reports_daily_line() {
  label=$1; shift
  printf '%s: %s' "$label" "$(orders_total "$@")"
}

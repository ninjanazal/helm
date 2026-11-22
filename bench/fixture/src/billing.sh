# Invoice maths, in whole cents. Needs config.sh sourced first.

# late_fee <cents> <days_overdue>: 0 inside the grace period, else the fee rate of the amount.
late_fee() {
  if [ "$2" -le "$GRACE_DAYS" ]; then
    printf 0
  else
    printf '%s' $(( $1 * $(fee_rate) / 100 ))
  fi
}

# invoice_total <cents> <days_overdue>
invoice_total() {
  printf '%s' $(( $1 + $(late_fee "$1" "$2") ))
}

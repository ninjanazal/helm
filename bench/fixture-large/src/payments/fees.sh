# Payment fees, in cents: 2.9% of the amount plus a fixed 30.

# payments_fee <cents>
payments_fee() {
  printf '%s' $(( $1 * 29 / 1000 + 30 ))
}

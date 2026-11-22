# Shipping rates, in cents. Parcels up to 20 kg cost the base price; above that, 30 cents per started extra kg.
SHIP_BASE_CENTS=500
SHIP_BASE_GRAMS=20000
SHIP_EXTRA_CENTS=30

# shipping_quote <grams>: price of one parcel.
shipping_quote() {
  if [ "$1" -le "$SHIP_BASE_GRAMS" ]; then
    printf '%s' "$SHIP_BASE_CENTS"
  else
    extra_kg=$(( ($1 - SHIP_BASE_GRAMS) / 1000 ))
    printf '%s' $(( SHIP_BASE_CENTS + extra_kg * SHIP_EXTRA_CENTS ))
  fi
}

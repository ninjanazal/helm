#!/bin/sh
# bench/gen-large.sh: regenerate bench/fixture-large (deterministic; the output is committed, so you rarely need this).
# A ~110 file POSIX sh "shop" codebase: 12 domains x 8 look-alike filler files (so names and words repeat) plus a few
# hand-written files the large tasks have to find. Run: sh bench/gen-large.sh
B=$(cd "$(dirname "$0")" && pwd); F=$B/fixture-large
rm -rf "$F"; mkdir -p "$F/src" "$F/tests"
DOMAINS="orders customers inventory shipping invoices payments tax coupons reports audit users catalog"
OPS="create validate format export import notify archive summary"

cat > "$F/README.md" <<'EOF'
# fixture-large

A POSIX sh shop codebase: src/<domain>/<step>.sh, one tests/<domain>_test.sh per domain.
Run the tests with `sh test.sh`. src/load.sh sources every module.
EOF
cat > "$F/test.sh" <<'EOF'
#!/bin/sh
# Run every tests/*_test.sh; exit 1 if any fails.
cd "$(dirname "$0")" || exit 1
rc=0
for t in tests/*_test.sh; do sh "$t" > /dev/null 2>&1 || { printf 'FAIL %s\n' "$t"; sh "$t"; rc=1; }; done
exit $rc
EOF
cat > "$F/src/load.sh" <<'EOF'
# Source every module. Usage: . src/load.sh  (from the repo root)
for _f in src/*/*.sh; do . "./$_f"; done
EOF
cat > "$F/tests/lib.sh" <<'EOF'
# Tiny assert helpers: assert_eq <name> <want> <got>, then finish.
fails=0; n=0
assert_eq() {
  n=$((n+1))
  [ "$2" = "$3" ] && return 0
  fails=$((fails+1)); printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"
}
finish() { printf '%s checks, %s failed\n' "$n" "$fails"; [ "$fails" -eq 0 ]; }
EOF

for d in $DOMAINS; do
  mkdir -p "$F/src/$d"
  for o in $OPS; do
    cat > "$F/src/$d/$o.sh" <<EOF
# $d/$o: the $o step for $d records.

# ${d}_${o}_label: display label of the step.
${d}_${o}_label() { printf '%s' "$d $o"; }

# ${d}_${o}_check <value>: a $d value must be non-empty and at most 64 characters.
${d}_${o}_check() { [ -n "\$1" ] && [ "\${#1}" -le 64 ]; }

# ${d}_${o}_run <value>: run the $o step on a $d value; prints it normalised, fails when the check does.
${d}_${o}_run() {
  ${d}_${o}_check "\$1" || return 1
  printf '%s:%s' "$d" "\$1" | tr 'A-Z' 'a-z'
}
EOF
  done
  cat > "$F/tests/${d}_test.sh" <<EOF
D=\$(cd "\$(dirname "\$0")/.." && pwd); cd "\$D" || exit 1; . tests/lib.sh; . src/load.sh
assert_eq run 'x:ab' "\$(printf '%s' "\$(${d}_create_run AB)" | sed 's/^$d/x/')"
assert_eq check-empty 1 "\$(${d}_validate_check '' && echo 0 || echo 1)"
assert_eq label '$d export' "\$(${d}_export_label)"
EOF
done

# --- hand-written files (the needles) ---
cat > "$F/src/shipping/rates.sh" <<'EOF'
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
EOF
cat >> "$F/tests/shipping_test.sh" <<'EOF'
assert_eq quote-base 500 "$(shipping_quote 12000)"
assert_eq quote-heavy 530 "$(shipping_quote 21000)"
finish
EOF
cat > "$F/src/payments/fees.sh" <<'EOF'
# Payment fees, in cents: 2.9% of the amount plus a fixed 30.

# payments_fee <cents>
payments_fee() {
  printf '%s' $(( $1 * 29 / 1000 + 30 ))
}
EOF
cat >> "$F/tests/payments_test.sh" <<'EOF'
assert_eq fee 320 "$(payments_fee 10000)"
finish
EOF
cat > "$F/src/coupons/rules.sh" <<'EOF'
# Coupon rules: one line per code, "<code> <percent off> <minimum order in cents>".
COUPON_RULES='
SAVE10 10 5000
WELCOME 15 0
BULK20 20 20000
'

# coupons_rule <code> <field>: field 1 = percent, 2 = minimum order; prints nothing for an unknown code.
coupons_rule() {
  printf '%s\n' "$COUPON_RULES" | awk -v c="$1" -v f="$2" '$1 == c { print $(f + 1) }'
}

# coupons_min_order <code>: the smallest order, in cents, the coupon applies to.
coupons_min_order() { coupons_rule "$1" 2; }
EOF
cat > "$F/src/coupons/eligible.sh" <<'EOF'
# coupons_eligible <code> <order_cents>: succeeds when the code exists and the order reaches its minimum.
coupons_eligible() {
  min=$(coupons_min_order "$1")
  [ -n "$min" ] && [ "$2" -ge "$min" ]
}
EOF
cat > "$F/src/coupons/apply.sh" <<'EOF'
# coupons_discount <code> <order_cents>: cents taken off; 0 when the coupon is not eligible.
coupons_discount() {
  coupons_eligible "$1" "$2" || { printf 0; return 0; }
  printf '%s' $(( $2 * $(coupons_rule "$1" 1) / 100 ))
}
EOF
cat >> "$F/tests/coupons_test.sh" <<'EOF'
assert_eq disc 600 "$(coupons_discount SAVE10 6000)"
finish
EOF
# orders_total is used across modules: the rename task has to find every caller
cat > "$F/src/orders/total.sh" <<'EOF'
# orders_total <cents...>: sum of the line amounts of an order.
orders_total() {
  t=0
  for a in "$@"; do t=$((t + a)); done
  printf '%s' "$t"
}
EOF
cat > "$F/src/invoices/totals.sh" <<'EOF'
# invoices_grand_total <tax_cents> <line_cents...>: order total (see orders_total) plus tax.
invoices_grand_total() {
  tax=$1; shift
  printf '%s' $(( $(orders_total "$@") + tax ))
}
EOF
cat > "$F/src/reports/daily.sh" <<'EOF'
# reports_daily_line <label> <line_cents...>: one report line with the orders_total of the day.
reports_daily_line() {
  label=$1; shift
  printf '%s: %s' "$label" "$(orders_total "$@")"
}
EOF
cat > "$F/src/customers/ledger.sh" <<'EOF'
# customers_balance <paid_cents> <line_cents...>: what the customer still owes (orders_total minus paid).
customers_balance() {
  paid=$1; shift
  printf '%s' $(( $(orders_total "$@") - paid ))
}
EOF
cat >> "$F/tests/orders_test.sh" <<'EOF'
assert_eq total 400 "$(orders_total 100 250 50)"
assert_eq grand 430 "$(invoices_grand_total 30 100 250 50)"
assert_eq daily 'mon: 400' "$(reports_daily_line mon 100 250 50)"
assert_eq balance 300 "$(customers_balance 100 100 250 50)"
finish
EOF
# every test file ends with finish
for t in "$F"/tests/*_test.sh; do grep -q '^finish$' "$t" || echo finish >> "$t"; done
echo "generated $(find "$F" -type f | wc -l) files in $F"

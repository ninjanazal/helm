# Settings, overridable from the environment.
LATE_FEE_PCT=${LATE_FEE_PCT:-7}
GRACE_DAYS=${GRACE_DAYS:-5}

# fee_rate: the late-fee percentage.
fee_rate() { printf '%s' "$LATE_FEE_PCT"; }

#!/bin/sh
# Run every tests/*_test.sh; exit 1 if any fails.
cd "$(dirname "$0")" || exit 1
rc=0
for t in tests/*_test.sh; do sh "$t" > /dev/null 2>&1 || { printf 'FAIL %s\n' "$t"; sh "$t"; rc=1; }; done
exit $rc

#!/bin/sh
# check.sh <workdir>: exit 0 when truncate_str respects its limit and the suite passes.
W=$1; . "$W/tests/lib.sh"; . "$W/src/strutil.sh"
assert_eq cut 'hello...' "$(truncate_str 'hello world' 8)"
assert_eq exact 'hello' "$(truncate_str 'hello' 5)"
assert_eq short 'hi' "$(truncate_str 'hi' 10)"
assert_eq len 5 "$(truncate_str 'abcdefghij' 5 | wc -c | tr -d ' ')"
finish && (cd "$W" && sh test.sh >/dev/null 2>&1)

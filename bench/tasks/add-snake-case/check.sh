#!/bin/sh
# check.sh <workdir>: exit 0 when snake_case behaves and the suite passes.
W=$1; . "$W/tests/lib.sh"; . "$W/src/strutil.sh"
assert_eq basic 'hello_world_foo' "$(snake_case 'Hello, World-Foo')"
assert_eq edges 'a_b' "$(snake_case '  --A  b!! ')"
assert_eq digits 'v2_beta' "$(snake_case 'V2 Beta')"
finish && (cd "$W" && sh test.sh >/dev/null 2>&1) && grep -q snake_case "$W/tests/strutil_test.sh"

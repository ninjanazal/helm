D=$(cd "$(dirname "$0")/.." && pwd); . "$D/tests/lib.sh"; . "$D/src/strutil.sh"
assert_eq slugify 'hello-world' "$(slugify 'Hello, World!')"
assert_eq truncate-short 'hi' "$(truncate_str 'hi' 10)"
assert_eq count 3 "$(count_words ' one  two three ')"
assert_eq title 'Ada Lovelace' "$(title_case 'aDA lOVELACE')"
finish

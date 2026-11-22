# String helpers. POSIX sh, ASCII only.

# slugify <text>: lowercase; each run of non-alphanumerics becomes one "-".
slugify() {
  printf '%s' "$1" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9][^a-z0-9]*/-/g; s/^-//; s/-$//'
}

# truncate_str <text> <max>: result is at most <max> characters; a cut ends in "...".
truncate_str() {
  if [ "${#1}" -le "$2" ]; then
    printf '%s' "$1"
  else
    printf '%s...' "$(printf '%s' "$1" | cut -c1-"$2")"
  fi
}

# count_words <text>
count_words() {
  set -f; set -- $1; set +f
  printf '%s' "$#"
}

# title_case <text>: first letter of each word upper, the rest lower.
title_case() {
  printf '%s' "$1" | awk -v ORS= '{ for (i = 1; i <= NF; i++) $i = toupper(substr($i, 1, 1)) tolower(substr($i, 2)); print }'
}

# Tiny assert helpers. Source it, call assert_eq <name> <want> <got>, end with finish.
fails=0; n=0
assert_eq() {
  n=$((n+1))
  [ "$2" = "$3" ] && return 0
  fails=$((fails+1)); printf 'FAIL %s: want [%s] got [%s]\n' "$1" "$2" "$3"
}
finish() { printf '%s checks, %s failed\n' "$n" "$fails"; [ "$fails" -eq 0 ]; }

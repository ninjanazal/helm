#!/bin/sh
# Tests for scripts/helm.sh: a stub claude records its argv instead of acting.
cd "$(dirname "$0")/.." || exit 1
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
for c in claude; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n[ "$1 $2" = "plugin list" ] && cat "%s/list$([ "$3" = --json ] && echo .json)" 2>/dev/null\ncase "%s $*" in $STUB_FAIL) exit 1;; esac\nexit 0\n' "$c" "$T" "$T" "$c" > "$T/bin/$c"; chmod +x "$T/bin/$c"
done
export PATH="$T/bin:$PATH" NO_COLOR=1 HELM_IN_TEST=1
unset SCOPE FROM PIECES HELM_YES STUB_FAIL
fails=0; n=0
ok()   { n=$((n+1)); printf 'ok   %s\n' "$1"; }
bad()  { n=$((n+1)); fails=$((fails+1)); printf 'FAIL %s\n' "$1"; [ -f "$T/out" ] && sed 's/^/     | /' "$T/out"; }
has()  { grep -q -- "$2" "$1"; }
reset() { : > "$T/calls"; : > "$T/out"; }
run()  { reset; HELM_INTERACTIVE=1 sh scripts/helm.sh "$@" > "$T/out" 2>&1; }

printf '1\n\n' | run setup
has "$T/calls" 'plugin install helm --marketplace' && has "$T/calls" 'superpowers@claude-plugins-official --scope local' && has "$T/calls" 'mattpocock-skills@claude-plugins-official --scope local' \
  && ! has "$T/calls" 'mcp add' && ! has "$T/calls" 'i-have-adhd' && ok 'setup: defaults install every piece locally' || bad 'setup: defaults install every piece locally'

printf '2\n\n' | run setup
has "$T/calls" 'superpowers@claude-plugins-official --scope user' && has "$T/calls" 'mattpocock-skills@claude-plugins-official --scope user' \
  && has "$T/calls" 'install helm --marketplace .* --scope user' \
  && ok 'setup: every project installs everything there' || bad 'setup: every project installs everything there'

printf '1\n\n2\ny\n' | run setup
has "$T/calls" 'plugin uninstall helm@helm --scope local' && has "$T/calls" 'uninstall superpowers' && has "$T/calls" 'uninstall mattpocock-skills' && ! has "$T/calls" 'plugin install' \
  && ok 'setup: remove choice removes after confirm' || bad 'setup: remove choice removes after confirm'

reset; PIECES=adhd sh scripts/helm.sh setup < /dev/null > "$T/out" 2>&1
m=$(grep -n 'plugin marketplace add ayghri/i-have-adhd' "$T/calls" | head -1 | cut -d: -f1)
i=$(grep -n 'plugin install i-have-adhd@i-have-adhd --scope local' "$T/calls" | head -1 | cut -d: -f1)
[ -n "$m" ] && [ -n "$i" ] && [ "$m" -lt "$i" ] && ok 'setup: adhd adds its marketplace then installs' || bad 'setup: adhd adds its marketplace then installs'

printf '1\n\n2\nn\n' | run setup
! has "$T/calls" uninstall && ok 'setup: remove declined removes nothing' || bad 'setup: remove declined removes nothing'

mkdir -p "$T/proj"
printf '1\n%s\n\n' "$T/proj" | run setup
has "$T/out" "project $T/proj" && has "$T/calls" 'install helm --marketplace .* --scope local' \
  && ok 'setup: asks for a project path and uses it' || bad 'setup: asks for a project path and uses it'

reset; sh scripts/helm.sh setup < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 0 ] && has "$T/calls" 'install helm --marketplace .* --scope local' && ok 'setup: no tty takes defaults' || bad 'setup: no tty takes defaults'

printf '1\n\n9\n1\n' | run setup
has "$T/out" 'not a choice' && has "$T/calls" 'install helm' \
  && ok 'setup: bad choice is re-asked' || bad 'setup: bad choice is re-asked'

reset; sh scripts/helm.sh remove < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && has "$T/out" 'make remove' && ! has "$T/calls" uninstall && ok 'remove: no tty refuses' || bad 'remove: no tty refuses'

printf '1\n\ny\n' | run remove
has "$T/calls" 'plugin uninstall helm@helm --scope local' && ok 'remove: confirmed removes' || bad 'remove: confirmed removes'

printf '1\n\nn\n' | run remove
! has "$T/calls" uninstall && ok 'remove: declined removes nothing' || bad 'remove: declined removes nothing'

reset; PATH=/usr/bin:/bin sh scripts/helm.sh status > "$T/out" 2>&1; e=$?
[ $e -eq 0 ] && [ "$(grep -c '○' "$T/out")" -ge 3 ] && ok 'status: works without claude' || bad 'status: works without claude'

reset; sh scripts/helm.sh bogus > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && has "$T/out" 'make help' && ok 'bad verb: usage hint' || bad 'bad verb: usage hint'

reset; sh scripts/helm.sh help > "$T/out" 2>&1
[ "$(wc -l < "$T/out")" -le 15 ] && ! has "$T/out" "$(printf '\033')" && ok 'help: short, no colour codes' || bad 'help: short, no colour codes'

# review fixes
reset; STUB_FAIL='claude plugin install helm*' PIECES=helm sh scripts/helm.sh setup < /dev/null > "$T/out" 2>&1; e=$?
[ $e -ne 0 ] && ! has "$T/out" 'Done' && has "$T/out" 'failed' && ok 'setup: a failed install is reported and exits non-zero' || bad 'setup: a failed install is reported and exits non-zero'
reset; STUB_FAIL='claude plugin test*' sh scripts/helm.sh test > "$T/out" 2>&1; e=$?
[ $e -ne 0 ] && ok 'test: failing plugin tests fail the run' || bad 'test: failing plugin tests fail the run'
printf 'helm@helm\n  Scope: local\n' > "$T/list"
printf '[{"id":"helm@helm","scope":"local","projectPath":"%s"}]\n' "$(pwd)" > "$T/list.json"
reset; SCOPE=local sh scripts/helm.sh install helm < /dev/null > "$T/out" 2>&1
! has "$T/calls" 'plugin update' && has "$T/out" 'already installed' && ok 'install helm: installed means no-op' || bad 'install helm: installed means no-op'
rm -f "$T/list" "$T/list.json"
reset; SCOPE=local sh scripts/helm.sh install atlas < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && has "$T/out" 'unknown piece: atlas' && [ ! -s "$T/calls" ] && ok 'install atlas: no longer a piece' || bad 'install atlas: no longer a piece'
reset; YES=1 sh scripts/helm.sh remove < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && ! has "$T/calls" uninstall && ok 'remove: a stray YES does not skip asking' || bad 'remove: a stray YES does not skip asking'

# make level: the targets, and the old names as quiet aliases.
mk() { reset; make -s --no-print-directory "$@" < /dev/null > "$T/out" 2> "$T/err"; }
mk help
[ "$(wc -l < "$T/out")" -le 15 ] && ! grep -Eqi 'local:|global|doctor|atlas|herdr|index|superpowers-remove' "$T/out" \
  && ! has "$T/out" "$(printf '\033')" && ok 'make help: short, no old names' || bad 'make help: short, no old names'
for t in atlas index herdr; do
  mk $t; e=$?
  [ $e -ne 0 ] && has "$T/err" "unknown: $t" && [ ! -s "$T/calls" ] && ok "make $t: gone, unknown hint" || bad "make $t: gone, unknown hint"
done
mk doctor
has "$T/err" '→ now: make status' && has "$T/out" 'helm status' && ok 'make doctor: runs status, hints' || bad 'make doctor: runs status, hints'
mk remove
! has "$T/calls" uninstall && ok 'make remove without tty: nothing removed' || bad 'make remove without tty: nothing removed'
printf '\n%d/%d passed\n' $((n-fails)) "$n"
[ $fails -eq 0 ]

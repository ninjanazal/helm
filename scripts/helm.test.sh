#!/bin/sh
# Tests for scripts/helm.sh: stub claude/python/atlas record their argv instead of acting.
cd "$(dirname "$0")/.." || exit 1
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
for c in claude python atlas; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n[ "$1 $2" = "plugin list" ] && cat "%s/list" 2>/dev/null\ncase "%s $*" in $STUB_FAIL) exit 1;; esac\nexit 0\n' "$c" "$T" "$T" "$c" > "$T/bin/$c"; chmod +x "$T/bin/$c"
done
# the python stub also makes a venv (a copy of itself) when asked, like `python -m venv DIR`
sed -i 's|^exit 0$|[ "$1 $2" = "-m venv" ] \&\& { mkdir -p "$3/bin"; cp "$0" "$3/bin/python"; }\nexit 0|' "$T/bin/python"
export ATLAS_VENV="$T/venv" ATLAS_BIN_DIR="$T/abin"
export PATH="$T/bin:$PATH" PY="$T/bin/python" ATLAS="$T/bin/atlas" NO_COLOR=1 HELM_IN_TEST=1
unset SCOPE FROM DIR PIECES HELM_YES STUB_FAIL
fails=0; n=0
ok()   { n=$((n+1)); printf 'ok   %s\n' "$1"; }
bad()  { n=$((n+1)); fails=$((fails+1)); printf 'FAIL %s\n' "$1"; [ -f "$T/out" ] && sed 's/^/     | /' "$T/out"; }
has()  { grep -q -- "$2" "$1"; }
reset() { : > "$T/calls"; : > "$T/out"; }
run()  { reset; HELM_INTERACTIVE=1 sh scripts/helm.sh "$@" > "$T/out" 2>&1; }

printf '1\n\n' | run setup
has "$T/calls" 'plugin install helm --marketplace' && has "$T/calls" 'superpowers@claude-plugins-official --scope local' \
  && has "$T/calls" 'python -m venv .*/venv' && ok 'setup: defaults install every piece locally' || bad 'setup: defaults install every piece locally'

printf '2\n\n' | run setup
has "$T/calls" 'superpowers@claude-plugins-official --scope user' && has "$T/calls" 'install helm --marketplace .* --scope user' \
  && ok 'setup: every project installs everything there' || bad 'setup: every project installs everything there'

printf '1\n2\ny\n' | run setup
has "$T/calls" 'plugin uninstall helm@helm --scope local' && has "$T/calls" 'uninstall superpowers' && ! has "$T/calls" 'plugin install' \
  && ok 'setup: remove choice removes after confirm' || bad 'setup: remove choice removes after confirm'

printf '1\n2\nn\n' | run setup
! has "$T/calls" uninstall && ok 'setup: remove declined removes nothing' || bad 'setup: remove declined removes nothing'

reset; sh scripts/helm.sh setup < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 0 ] && has "$T/calls" 'install helm --marketplace .* --scope local' && ok 'setup: no tty takes defaults' || bad 'setup: no tty takes defaults'

printf '1\n9\n1\n' | run setup
has "$T/out" 'not a choice' && has "$T/calls" 'install helm' \
  && ok 'setup: bad choice is re-asked' || bad 'setup: bad choice is re-asked'

reset; sh scripts/helm.sh remove < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && has "$T/out" 'make remove' && ! has "$T/calls" uninstall && ok 'remove: no tty refuses' || bad 'remove: no tty refuses'

printf '1\ny\n' | run remove
has "$T/calls" 'plugin uninstall helm@helm --scope local' && ok 'remove: confirmed removes' || bad 'remove: confirmed removes'

printf '1\nn\n' | run remove
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
reset; mkdir -p "$T/venv/bin"; cp "$T/bin/python" "$T/venv/bin/python"; STUB_FAIL='python -m unittest*' sh scripts/helm.sh test > "$T/out" 2>&1; e=$?
[ $e -ne 0 ] && ok 'test: failing atlas tests fail the run' || bad 'test: failing atlas tests fail the run'
printf 'helm@helm\n  Scope: local\n' > "$T/list"
reset; SCOPE=local sh scripts/helm.sh install helm < /dev/null > "$T/out" 2>&1
! has "$T/calls" 'plugin update' && has "$T/out" 'already installed' && ok 'install helm: installed means no-op' || bad 'install helm: installed means no-op'
rm -f "$T/list"
reset; SCOPE=local sh scripts/helm.sh install atlas < /dev/null > "$T/out" 2>&1
! has "$T/calls" 'atlas index' && ok 'install atlas: does not index' || bad 'install atlas: does not index'
reset; YES=1 sh scripts/helm.sh remove < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && ! has "$T/calls" uninstall && ok 'remove: a stray YES does not skip asking' || bad 'remove: a stray YES does not skip asking'

# make level: the targets, and the old names as quiet aliases.
mk() { reset; make -s --no-print-directory "$@" < /dev/null > "$T/out" 2> "$T/err"; }
mk help
[ "$(wc -l < "$T/out")" -le 15 ] && ! grep -Eq 'local:|global|doctor|atlas-remove|superpowers-remove' "$T/out" \
  && ! has "$T/out" "$(printf '\033')" && ok 'make help: short, no old names' || bad 'make help: short, no old names'
mk atlas SCOPE=user
has "$T/calls" 'mcp add --scope user atlas' && has "$T/err" '→ now: make setup' && ok 'make atlas SCOPE=user: still works, hints' || bad 'make atlas SCOPE=user: still works, hints'
mk doctor
has "$T/err" '→ now: make status' && has "$T/out" 'helm status' && ok 'make doctor: runs status, hints' || bad 'make doctor: runs status, hints'
mk remove
! has "$T/calls" uninstall && ok 'make remove without tty: nothing removed' || bad 'make remove without tty: nothing removed'
printf '\n%d/%d passed\n' $((n-fails)) "$n"
[ $fails -eq 0 ]

#!/bin/sh
# Tests for scripts/helm.sh: stub claude/cargo/atlas record their argv instead of acting.
cd "$(dirname "$0")/.." || exit 1
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin"
for c in claude cargo atlas; do
  printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$c" "$T" > "$T/bin/$c"; chmod +x "$T/bin/$c"
done
export PATH="$T/bin:$PATH" ATLAS="$T/bin/atlas" NO_COLOR=1
unset SCOPE FROM DIR PIECES YES
fails=0; n=0
ok()   { n=$((n+1)); printf 'ok   %s\n' "$1"; }
bad()  { n=$((n+1)); fails=$((fails+1)); printf 'FAIL %s\n' "$1"; [ -f "$T/out" ] && sed 's/^/     | /' "$T/out"; }
has()  { grep -q -- "$2" "$1"; }
reset() { : > "$T/calls"; : > "$T/out"; }
run()  { reset; HELM_INTERACTIVE=1 sh scripts/helm.sh "$@" > "$T/out" 2>&1; }

printf '1\n\n' | run setup
has "$T/calls" 'plugin install helm --marketplace' && has "$T/calls" 'superpowers@claude-plugins-official --scope local' \
  && has "$T/calls" 'cargo install --path .*/atlas ' && ok 'setup: defaults install every piece locally' || bad 'setup: defaults install every piece locally'

printf '2\n2\n' | run setup
has "$T/calls" 'superpowers@claude-plugins-official --scope user' && ! has "$T/calls" 'install helm' && ! has "$T/calls" cargo \
  && ok 'setup: every project + superpowers only' || bad 'setup: every project + superpowers only'

reset; sh scripts/helm.sh setup < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 0 ] && has "$T/calls" 'install helm --marketplace .* --scope local' && ok 'setup: no tty takes defaults' || bad 'setup: no tty takes defaults'

printf '1\n9\n2\n' | run setup
has "$T/out" 'not a choice' && has "$T/calls" superpowers && ! has "$T/calls" 'install helm' \
  && ok 'setup: bad choice is re-asked' || bad 'setup: bad choice is re-asked'

reset; sh scripts/helm.sh remove < /dev/null > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && has "$T/out" 'make remove' && ! has "$T/calls" uninstall && ok 'remove: no tty refuses' || bad 'remove: no tty refuses'

printf '1\n1\ny\n' | run remove
has "$T/calls" 'plugin uninstall helm@helm --scope local' && ok 'remove: confirmed removes' || bad 'remove: confirmed removes'

printf '1\n1\nn\n' | run remove
! has "$T/calls" uninstall && ok 'remove: declined removes nothing' || bad 'remove: declined removes nothing'

reset; PATH=/usr/bin:/bin sh scripts/helm.sh status > "$T/out" 2>&1; e=$?
[ $e -eq 0 ] && [ "$(grep -c '○' "$T/out")" -ge 3 ] && ok 'status: works without claude' || bad 'status: works without claude'

reset; sh scripts/helm.sh bogus > "$T/out" 2>&1; e=$?
[ $e -eq 1 ] && has "$T/out" 'make help' && ok 'bad verb: usage hint' || bad 'bad verb: usage hint'

reset; sh scripts/helm.sh help > "$T/out" 2>&1
[ "$(wc -l < "$T/out")" -le 15 ] && ! has "$T/out" "$(printf '\033')" && ok 'help: short, no colour codes' || bad 'help: short, no colour codes'

printf '\n%d/%d passed\n' $((n-fails)) "$n"
[ $fails -eq 0 ]

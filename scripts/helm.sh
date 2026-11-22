#!/bin/sh
# helm setup script: the make targets call this. Asks where and what when a person is there to answer.
#   sh scripts/helm.sh help|setup|remove|status|index|check|bench
#   non-interactive (used by the old make names): install|uninstall <piece>, update, enable, disable, test, validate
# Presets, all optional: SCOPE=local|user  FROM=here|github  DIR=<repo>  PIECES="helm superpowers atlas herdr"  HELM_YES=1

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PLUGIN=helm MARKETPLACE=helm GITHUB=ninjanazal/helm
ID=$PLUGIN@$MARKETPLACE
SP=superpowers@claude-plugins-official
ALL="helm superpowers herdr atlas"
BIN_local=$ROOT/.atlas/bin
BIN_user=$HOME/.local/bin

if [ -t 1 ] && [ -z "$NO_COLOR" ]; then
  B=$(printf '\033[1m') D=$(printf '\033[2m') R=$(printf '\033[0m') G=$(printf '\033[32m')
  Y=$(printf '\033[33m') C=$(printf '\033[36m') M=$(printf '\033[35m')
else B= D= R= G= Y= C= M=; fi

say()  { printf '%s\n' "$*"; }
done_() { say "${G}✔${R} $*"; }
miss() { say "${D}○ $*${R}"; }
step() { printf '\n%s▸%s %s%s%s\n' "$C" "$R" "$B" "$*" "$R"; }
die()  { say "$*" >&2; exit 1; }
# Ask only when someone can answer: stdin is a terminal (or HELM_INTERACTIVE=1, for tests).
interactive() { [ -n "$HELM_INTERACTIVE" ] || [ -t 0 ]; }
has_claude() { command -v claude >/dev/null 2>&1; }

scope_word() { [ "$1" = user ] && say 'every project' || say 'this project'; }
bin_dir() { [ "$SCOPE" = user ] && say "$BIN_user" || say "$BIN_local"; }
atlas_bin() {
  if [ -n "$ATLAS" ]; then say "$ATLAS"; return; fi
  for b in "$BIN_local/atlas" "$BIN_user/atlas"; do [ -x "$b" ] && { say "$b"; return; }; done
  say atlas
}
source_() { [ "$FROM" = github ] && say "$GITHUB" || say "$ROOT"; }

# plugin_scopes <id>: the scopes it is installed at, space separated (empty when none or no claude).
plugin_scopes() {
  has_claude || return 0
  claude plugin list 2>/dev/null | grep -A3 "$1" | sed -n 's/.*Scope: *//p' | sort -u | tr '\n' ' '
}
at_scope() { case " $(plugin_scopes "$1") " in *" $SCOPE "*) return 0;; esac; return 1; }

# piece_state <piece>: one short word for the menus.
piece_state() {
  case $1 in
    helm) at_scope "$ID" && say "installed ($SCOPE) → update" || say 'not installed' ;;
    superpowers) at_scope "$SP" && say "installed ($SCOPE)" || say 'not installed' ;;
    atlas) [ -x "$(bin_dir)/atlas" ] && say "installed ($SCOPE) → rebuild" || say 'not installed' ;;
    herdr) command -v herdr >/dev/null 2>&1 && say found || say 'not found (optional)' ;;
  esac
}
piece_label() {
  case $1 in helm) say 'helm plugin';; superpowers) say superpowers;; atlas) say 'atlas + index';; herdr) say 'herdr check';; esac
}

# ask_scope: sets SCOPE unless preset or nobody to ask.
ask_scope() {
  case $SCOPE in global) SCOPE=user;; local|user) return;; esac
  SCOPE=local
  interactive || return 0
  say ''; say "${B}Where?${R}"
  say '  1) this project only   (default)'
  say '  2) every project'
  while :; do
    printf '> '; read -r a || a=
    case $a in ''|1) SCOPE=local; return;; 2) SCOPE=user; return;; *) say "${Y}not a choice:${R} $a";; esac
  done
}

# ask_pieces <verb>: sets PIECES unless preset or nobody to ask (then: all).
ask_pieces() {
  [ -n "$PIECES" ] && return
  PIECES=$ALL
  interactive || return 0
  say ''; say "${B}Which pieces?${R}  ${D}(numbers separated by spaces, Enter = all)${R}"
  i=0; for p in $ALL; do i=$((i+1)); printf '  %d) %-15s %s%s%s\n' $i "$(piece_label $p)" "$D" "$(piece_state $p)" "$R"; done
  while :; do
    printf '> '; read -r a || a=
    [ -z "$a" ] && return
    picked= okay=1
    for n in $a; do
      case $n in 1) picked="$picked helm";; 2) picked="$picked superpowers";; 3) picked="$picked atlas";; 4) picked="$picked herdr";;
        *) say "${Y}not a choice:${R} $n"; okay=;; esac
    done
    [ -n "$okay" ] && [ -n "$picked" ] && { PIECES=$picked; return; }
  done
}

need_claude() { has_claude || die "${Y}○${R} claude not found: install Claude Code first."; }

install_helm() {
  need_claude
  if at_scope "$ID"; then
    done_ "helm already installed ($SCOPE)"
  else
    claude plugin install "$PLUGIN" --marketplace "$(source_)" --scope "$SCOPE" && done_ "helm installed ($SCOPE)"
  fi
}
install_superpowers() {
  need_claude
  if at_scope "$SP"; then done_ "superpowers already installed ($SCOPE)"
  else claude plugin install "$SP" --scope "$SCOPE" && done_ "superpowers installed ($SCOPE)"; fi
}
install_atlas() {
  command -v cargo >/dev/null 2>&1 || { say "${Y}○${R} cargo not found: install Rust via rustup, then re-run."; return 1; }
  need_claude
  bin=$(bin_dir)
  cargo install --path "$ROOT/atlas" --root "$(dirname "$bin")" --quiet --force || return 1
  claude mcp remove --scope "$SCOPE" atlas >/dev/null 2>&1 || true
  claude mcp add --scope "$SCOPE" atlas -- "$bin/atlas" mcp >/dev/null || return 1
  done_ "atlas ($SCOPE) → $bin/atlas, MCP server registered"
  [ "$SCOPE" = user ] && say "  ${D}atlas indexes a repo the first time its tools are used, or run: make index${R}"
  return 0
}
install_herdr() {
  command -v herdr >/dev/null 2>&1 && done_ "herdr $(herdr --version 2>/dev/null)" \
    || say "${Y}○${R} herdr not found; optional. Install it from its project page, then re-run."
}

uninstall_helm() {
  has_claude && claude plugin uninstall "$ID" --scope "$SCOPE" >/dev/null 2>&1 && done_ "helm removed ($SCOPE)" || miss "helm not installed at $SCOPE scope"
}
uninstall_superpowers() {
  has_claude && claude plugin uninstall "$SP" --scope "$SCOPE" >/dev/null 2>&1 && done_ "superpowers removed ($SCOPE)" || miss "superpowers not installed at $SCOPE scope"
}
uninstall_atlas() {
  has_claude && claude mcp remove --scope "$SCOPE" atlas >/dev/null 2>&1 && done_ "MCP server \"atlas\" removed ($SCOPE)" || miss "no atlas MCP server at $SCOPE scope"
  bin=$(bin_dir)
  if [ -x "$bin/atlas" ]; then rm -f "$bin/atlas"; done_ "removed $bin/atlas"; fi
}
uninstall_herdr() { miss 'herdr is not managed by helm; nothing to remove'; }
install_index() { cmd_index; }
uninstall_index() { rm -rf "${DIR:-$ROOT}"/.atlas/graph.db* && done_ 'index removed'; }

# helm already installed: offer what else can be done with it.
helm_action() {
  at_scope "$ID" && interactive || { install_helm; return; }  # no one to ask: install, or leave as is
  say ''; say "${B}helm is installed ($SCOPE).${R} 1) update (default)  2) disable  3) enable  4) leave"
  while :; do
    printf '> '; read -r a || a=
    case $a in ''|1) cmd_update; return;; 2) cmd_disable; return;; 3) cmd_enable; return;; 4) return;;
      *) say "${Y}not a choice:${R} $a";; esac
  done
}

cmd_setup() {
  printf '\n  %s⎈ %shelm setup%s\n' "$M" "$B" "$R"
  ask_scope; ask_pieces
  for p in $PIECES; do
    step "$(piece_label $p) · $(scope_word $SCOPE)"
    case $p in helm) helm_action;; *) "install_$p";; esac || failed="$failed $p"
    [ "$p" = atlas ] && [ "$SCOPE" = local ] && ! echo "$failed" | grep -qw atlas && { cmd_index || failed="$failed index"; }
  done
  [ -n "$failed" ] && die "${Y}✘${R} failed:$failed (see above)"
  printf '\n%s✔ Done.%s In Claude Code: %s/reload-plugins%s, then %s/helm:deck%s.\n' "$G" "$R" "$B" "$R" "$B" "$R"
}

cmd_remove() {
  if ! interactive && [ -z "$HELM_YES" ]; then
    die "${Y}○${R} make remove asks what to remove; run it in a terminal."
  fi
  printf '\n  %s⎈ %shelm remove%s\n' "$M" "$B" "$R"
  ask_scope; ask_pieces
  if [ -z "$HELM_YES" ]; then
    printf '\nRemove%s from %s? [y/N] ' "$(for p in $PIECES; do printf ' %s' "$(piece_label $p)"; done)" "$(scope_word $SCOPE)"
    read -r a || a=
    case $a in y|Y|yes) ;; *) say 'Nothing removed.'; return 0;; esac
  fi
  for p in $PIECES; do "uninstall_$p"; done
  say "  ${D}.atlas/ and .claude/ stay in place.${R}"
}

row_ok()   { printf '  %s✔%s %-36s %s%s%s\n' "$G" "$R" "$1" "$D" "$2" "$R"; }
row_miss() { printf '  %s○%s %-36s %s%s%s\n' "$Y" "$R" "$1" "$D" "$2" "$R"; }

cmd_status() {
  printf '\n  %shelm status%s\n\n' "$B" "$R"
  has_claude || row_miss claude 'not found: install Claude Code'
  for p in "$ID" "$SP"; do
    s=$(plugin_scopes "$p"); [ -n "$s" ] && row_ok "$p" "$s" || row_miss "$p" 'not installed · make setup'
  done
  command -v herdr >/dev/null 2>&1 && row_ok herdr "$(herdr --version 2>/dev/null)" || row_miss herdr 'not found (optional)'
  for sc in local user; do
    [ $sc = local ] && b=$BIN_local || b=$BIN_user
    [ -x "$b/atlas" ] && row_ok "atlas binary ($sc)" "$b/atlas" || row_miss "atlas binary ($sc)" 'make setup'
  done
  m=; has_claude && m=$(claude mcp get atlas 2>/dev/null | sed -n 's/.*Scope: *//p' | head -1)
  [ -n "$m" ] && row_ok 'atlas MCP server' "$m" || row_miss 'atlas MCP server' 'make setup'
  [ -f "$ROOT/.atlas/graph.db" ] && row_ok 'atlas index (this folder)' "$("$(atlas_bin)" stats 2>/dev/null | head -1)" \
    || row_miss 'atlas index (this folder)' 'make index'
  say ''
}

cmd_index() { "$(atlas_bin)" index --root "${DIR:-$ROOT}"; }
cmd_update() { need_claude; claude plugin marketplace update "$MARKETPLACE" && claude plugin update "$ID" --scope "${SCOPE:-local}" && say "${G}✔${R} Updated. Run ${B}/reload-plugins${R} to load it."; }
cmd_enable() { need_claude; claude plugin enable "$ID" --scope "${SCOPE:-local}" && say "${G}✔${R} Enabled. Run ${B}/reload-plugins${R} in Claude Code."; }
cmd_disable() { need_claude; claude plugin disable "$ID" --scope "${SCOPE:-local}"; }
cmd_validate() { need_claude; claude plugin validate "$ROOT"; }
# tailed <n> <cmd…>: run it, show the last n lines (all of it on failure), keep its exit status.
tailed() {
  n=$1; shift; out=$("$@" 2>&1); rc=$?
  [ $rc -eq 0 ] && printf '%s\n' "$out" | tail -"$n" || printf '%s\n' "$out"
  return $rc
}
cmd_test() {
  need_claude
  (cd "$ROOT" && claude plugin test .) || exit 1
  tailed 2 cargo test -q --manifest-path "$ROOT/atlas/Cargo.toml" || exit 1
  [ -n "$HELM_IN_TEST" ] || tailed 1 sh "$ROOT/scripts/helm.test.sh" || exit 1
}
cmd_check() { cmd_validate && cmd_test; }
# bench: A/B helm vs baseline on the fixture tasks. TASKS= RUNS= MODEL= EFFORT= DRY=1 REPORT=1 (report only).
cmd_bench() {
  [ -n "$REPORT" ] || { sh "$ROOT/bench/run.sh" || exit 1; }
  [ -n "$DRY" ] || sh "$ROOT/bench/report.sh"
}

cmd_help() {
  version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/.claude-plugin/plugin.json" | head -1)
  printf '\n  %s⎈ %shelm%s %sv%s · Claude Code plugin + atlas%s\n\n' "$M" "$B" "$R" "$D" "$version" "$R"
  printf '    %smake setup%s    install or update helm, superpowers, atlas %s(asks where and what)%s\n' "$C" "$R" "$D" "$R"
  printf '    %smake remove%s   uninstall pieces %s(asks where and what, then confirms)%s\n' "$C" "$R" "$D" "$R"
  printf '    %smake status%s   what is installed, and where\n' "$C" "$R"
  printf '    %smake index%s    build or refresh the atlas index of this repo\n' "$C" "$R"
  printf '    %smake check%s    validate the plugin and run the tests\n' "$C" "$R"
  printf '    %smake bench%s    A/B helm vs baseline on a fixed task suite %s(spends API credits; DRY=1 lists the runs)%s\n' "$C" "$R" "$D" "$R"
  printf '\n  %sThen in Claude Code: /reload-plugins, then /helm:help%s\n\n' "$D" "$R"
}

verb=${1:-help}; [ $# -gt 0 ] && shift
case $SCOPE in global) SCOPE=user;; esac
case $verb in
  help|setup|remove|status|index|check|bench|update|enable|disable|test|validate) "cmd_$verb" ;;
  install|uninstall)
    case $1 in helm|superpowers|atlas|herdr|index) ;; *) die "usage: make help  (unknown piece: $1)";; esac
    SCOPE=${SCOPE:-local}; "${verb}_$1" ;;
  *) die "unknown: $verb · usage: make help" ;;
esac

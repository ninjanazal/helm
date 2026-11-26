#!/bin/sh
# helm setup script: the make targets call this. Asks where and what when a person is there to answer.
#   sh scripts/helm.sh help|setup|remove|status|check|bench
#   non-interactive (used by the old make names): install|uninstall <piece>, update, enable, disable, test, validate
# Presets, all optional: SCOPE=local|user  PROJECT=<dir>  FROM=here|github  PIECES="helm superpowers mattpocock adhd"  HELM_YES=1

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PLUGIN=helm MARKETPLACE=helm GITHUB=ninjanazal/helm
ID=$PLUGIN@$MARKETPLACE
SP=superpowers@claude-plugins-official
MP=mattpocock-skills@claude-plugins-official
AD=i-have-adhd@i-have-adhd AD_MKT=ayghri/i-have-adhd
ALL="helm superpowers mattpocock"

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

scope_word() { [ "$1" = user ] && say 'every project' || say "project $(pwd)"; }
source_() { [ "$FROM" = github ] && say "$GITHUB" || say "$ROOT"; }

# plugin_scopes <id>: the scopes it is installed at, space separated (empty when none or no claude).
plugin_scopes() {
  has_claude || return 0
  if command -v jq >/dev/null 2>&1; then
    # local installs belong to one project: count only the ones for the current directory.
    claude plugin list --json 2>/dev/null | jq -r --arg id "$1" --arg cwd "$(pwd)" \
      '[.[] | select(.id == $id) | select(.scope != "local" or .projectPath == $cwd) | .scope] | unique | join(" ")'
  else
    claude plugin list 2>/dev/null | grep -A3 "$1" | sed -n 's/.*Scope: *//p' | sort -u | tr '\n' ' '
  fi
}
at_scope() { case " $(plugin_scopes "$1") " in *" $SCOPE "*) return 0;; esac; return 1; }

# piece_state <piece>: one short word for the menus.
piece_state() {
  case $1 in
    helm) at_scope "$ID" && say "installed ($SCOPE) → update" || say 'not installed' ;;
    *) at_scope "$(piece_id $1)" && say "installed ($SCOPE)" || say 'not installed' ;;
  esac
}
# piece_id <piece>: the plugin id for a piece.
piece_id() {
  case $1 in helm) say "$ID";; superpowers) say "$SP";; mattpocock) say "$MP";; adhd) say "$AD";; esac
}
piece_label() {
  case $1 in helm) say 'helm plugin';; superpowers) say superpowers;; mattpocock) say 'Matt Pocock skills';; adhd) say i-have-adhd;; esac
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
    case $a in ''|1) SCOPE=local; break;; 2) SCOPE=user; return;; *) say "${Y}not a choice:${R} $a";; esac
  done
  ask_project
}

# ask_project: local scope works on the current directory; let the person pick another. Empty keeps it.
ask_project() {
  [ -n "$PROJECT" ] && return
  interactive || return 0
  say ''; say "${B}Project path?${R} ${D}(empty: $(pwd))${R}"
  while :; do
    printf '> '; read -r a || a=
    case $a in '~') a=$HOME;; '~/'*) a=$HOME/${a#\~/};; esac
    [ -z "$a" ] && return
    [ -d "$a" ] && { PROJECT=$a; use_project; return; }
    say "${Y}not a directory:${R} $a"
  done
}
# use_project: claude's local scope follows the working directory, so move there.
use_project() { [ -n "$PROJECT" ] && [ "$SCOPE" != user ] && { cd "$PROJECT" || die "${Y}○${R} cannot enter $PROJECT"; }; return 0; }

need_claude() { has_claude || die "${Y}○${R} claude not found: install Claude Code first."; }

install_helm() {
  need_claude
  if at_scope "$ID"; then
    done_ "helm already installed ($SCOPE)"
  else
    claude plugin install "$PLUGIN" --marketplace "$(source_)" --scope "$SCOPE" && done_ "helm installed ($SCOPE)"
  fi
}
# install_plugin <id> <label>: install a plugin at SCOPE unless it is already there.
install_plugin() { need_claude; if at_scope "$1"; then done_ "$2 already installed ($SCOPE)"; else claude plugin install "$1" --scope "$SCOPE" && done_ "$2 installed ($SCOPE)"; fi; }
# uninstall_plugin <id> <label>: remove a plugin from SCOPE.
uninstall_plugin() { has_claude && claude plugin uninstall "$1" --scope "$SCOPE" >/dev/null 2>&1 && done_ "$2 removed ($SCOPE)" || miss "$2 not installed at $SCOPE scope"; }
install_superpowers() { install_plugin "$SP" superpowers; }
install_mattpocock() { install_plugin "$MP" 'Matt Pocock skills'; }
install_adhd() {
  need_claude
  if at_scope "$AD"; then install_plugin "$AD" i-have-adhd
  else claude plugin marketplace add "$AD_MKT" >/dev/null 2>&1; install_plugin "$AD" i-have-adhd; fi
}

uninstall_helm() {
  has_claude && claude plugin uninstall "$ID" --scope "$SCOPE" >/dev/null 2>&1 && done_ "helm removed ($SCOPE)" || miss "helm not installed at $SCOPE scope"
}
uninstall_superpowers() { uninstall_plugin "$SP" superpowers; }
uninstall_mattpocock() { uninstall_plugin "$MP" 'Matt Pocock skills'; }
uninstall_adhd() { uninstall_plugin "$AD" i-have-adhd; }

# helm already installed: update it; otherwise install it.
helm_action() { if at_scope "$ID"; then cmd_update; else install_helm; fi; }

# ask_action: install/update (default) or remove. Sets ACTION.
ask_action() {
  ACTION=install
  interactive || return 0
  say ''; say "${B}What?${R}"
  say '  1) install / update   (default)'
  say '  2) remove'
  while :; do
    printf '> '; read -r a || a=
    case $a in ''|1) return;; 2) ACTION=remove; return;; *) say "${Y}not a choice:${R} $a";; esac
  done
}

cmd_setup() {
  printf '\n  %s⎈ %shelm setup%s\n' "$M" "$B" "$R"
  ask_scope; ask_action
  [ "$ACTION" = remove ] && { do_remove; return; }
  PIECES=${PIECES:-$ALL}
  for p in $PIECES; do
    step "$(piece_label $p) · $(scope_word $SCOPE)"
    case $p in helm) helm_action;; *) "install_$p";; esac || failed="$failed $p"
  done
  [ -n "$failed" ] && die "${Y}✘${R} failed:$failed (see above)"
  printf '\n%s✔ Done.%s In Claude Code: %s/reload-plugins%s, then %s/helm:help%s.\n' "$G" "$R" "$B" "$R" "$B" "$R"
}

# do_remove: confirm (unless HELM_YES), then uninstall PIECES (default: all helm manages).
do_remove() {
  PIECES=${PIECES:-$ALL}
  if [ -z "$HELM_YES" ]; then
    printf '\nRemove%s from %s? [y/N] ' "$(for p in $PIECES; do printf ' %s' "$(piece_label $p)"; done)" "$(scope_word $SCOPE)"
    read -r a || a=
    case $a in y|Y|yes) ;; *) say 'Nothing removed.'; return 0;; esac
  fi
  for p in $PIECES; do "uninstall_$p"; done
  say "  ${D}.claude/ stays in place.${R}"
}

cmd_remove() {
  if ! interactive && [ -z "$HELM_YES" ]; then
    die "${Y}○${R} make remove asks what to remove; run it in a terminal."
  fi
  printf '\n  %s⎈ %shelm remove%s\n' "$M" "$B" "$R"
  ask_scope; do_remove
}

row_ok()   { printf '  %s✔%s %-36s %s%s%s\n' "$G" "$R" "$1" "$D" "$2" "$R"; }
row_miss() { printf '  %s○%s %-36s %s%s%s\n' "$Y" "$R" "$1" "$D" "$2" "$R"; }

cmd_status() {
  printf '\n  %shelm status%s\n\n' "$B" "$R"
  has_claude || row_miss claude 'not found: install Claude Code'
  for p in "$ID" "$SP" "$MP" "$AD"; do
    s=$(plugin_scopes "$p"); [ -n "$s" ] && row_ok "$p" "$s" || row_miss "$p" 'not installed · make setup'
  done
  say ''
}

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
  [ -n "$HELM_IN_TEST" ] || tailed 1 sh "$ROOT/scripts/helm.test.sh" || exit 1
}
cmd_check() { cmd_validate && cmd_test; }
# bench: A/B helm vs baseline on the fixture tasks. TASKS= RUNS= MODEL= EFFORT= DRY=1 REPORT=1 (report only).
cmd_bench() {
  [ -n "$REPORT" ] || { sh "$ROOT/bench/run.sh" || exit 1; }
  [ -n "$DRY" ] || sh "$ROOT/bench/report.sh"
}

cmd_help() {
  # Start on a clean screen, but only for a person at a terminal (not pipes or NO_COLOR).
  [ -t 1 ] && [ -z "$NO_COLOR" ] && [ -n "$TERM" ] && printf '\033[H\033[2J'
  version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/.claude-plugin/plugin.json" | head -1)
  printf '\n  %s⎈ %shelm%s %sv%s · Claude Code plugin%s\n\n' "$M" "$B" "$R" "$D" "$version" "$R"
  printf '    %smake setup%s    install / update or remove helm, superpowers and Matt Pocock skills %s(asks where, then what)%s\n' "$C" "$R" "$D" "$R"
  printf '    %smake setup PIECES=adhd%s   also add i-have-adhd %s(optional)%s\n' "$C" "$R" "$D" "$R"
  printf '    %smake remove%s   uninstall pieces %s(asks where and what, then confirms)%s\n' "$C" "$R" "$D" "$R"
  printf '    %smake status%s   what is installed, and where\n' "$C" "$R"
  printf '    %smake check%s    validate the plugin and run the tests\n' "$C" "$R"
  printf '    %smake bench%s    A/B helm vs baseline on a fixed task suite %s(spends API credits; DRY=1 lists the runs)%s\n' "$C" "$R" "$D" "$R"
  printf '\n  %sThen in Claude Code: /reload-plugins, then /helm:help%s\n\n' "$D" "$R"
}

verb=${1:-help}; [ $# -gt 0 ] && shift
case $SCOPE in global) SCOPE=user;; esac
use_project
case $verb in
  help|setup|remove|status|check|bench|update|enable|disable|test|validate) "cmd_$verb" ;;
  install|uninstall)
    case $1 in helm|superpowers|mattpocock|adhd) ;; *) die "usage: make help  (unknown piece: $1)";; esac
    SCOPE=${SCOPE:-local}; "${verb}_$1" ;;
  *) die "unknown: $verb · usage: make help" ;;
esac

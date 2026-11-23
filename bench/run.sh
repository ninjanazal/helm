#!/bin/sh
# bench/run.sh: run every task x arm (helm | baseline) x run with headless `claude -p`, check the result, append JSONL rows.
#   TASKS="a b"  tasks to run (default: all in bench/tasks)      RUNS=3     repeats per task and arm
#   MODEL=sonnet model alias or id                               EFFORT=medium
#   DRY=1        list what would run, call nothing               RESULTS=<file>  (default bench/results.jsonl)
#   BUDGET=1     max USD per run (claude --max-budget-usd)       CLAUDE=claude   binary (tests point it at a stub)
# Isolation: both arms use the same flags and a fresh copy of bench/fixture in a temp dir. The only difference is
# --plugin-dir <repo> in the helm arm. The large-* tasks run on bench/fixture-large (named in the task's `fixture` file).
# ARMS="helm baseline" by default; add helm-nolean (helm with lean mode pinned off by .claude/helm/lean) to measure lean alone.
# Both arms enable superpowers (helm's dependency), so the delta is helm alone.
# --setting-sources project + --strict-mcp-config keep user settings, plugins
# and MCP servers out of both arms; --no-session-persistence keeps your ~/.claude free of bench sessions.

B=$(cd "$(dirname "$0")" && pwd); ROOT=$(dirname "$B")
RUNS=${RUNS:-3}; MODEL=${MODEL:-sonnet}; EFFORT=${EFFORT:-medium}; BUDGET=${BUDGET:-1}
ARMS=${ARMS:-helm baseline}; RESULTS=${RESULTS:-$B/results.jsonl}; CLAUDE=${CLAUDE:-claude}
die() { printf '%s\n' "$*" >&2; exit 1; }

all=$(cd "$B/tasks" && for d in */; do printf '%s ' "${d%/}"; done)
TASKS=$(printf '%s' "${TASKS:-$all}" | tr ',' ' ')
for t in $TASKS; do [ -f "$B/tasks/$t/prompt.md" ] || die "unknown task: $t (have: $all)"; done
case $RUNS in ''|*[!0-9]*|0) die "RUNS must be a positive number, got: $RUNS";; esac

n=0
na=$(printf '%s\n' $ARMS | wc -l)
for t in $TASKS; do n=$((n + na * RUNS)); done

if [ -n "$DRY" ]; then
  printf 'bench dry run: model=%s effort=%s runs=%s -> %s claude calls, nothing is run\n' "$MODEL" "$EFFORT" "$RUNS" "$n"
  r=1
  while [ "$r" -le "$RUNS" ]; do
    for t in $TASKS; do for arm in $ARMS; do printf '  %-24s %-9s run %s/%s\n' "$t" "$arm" "$r" "$RUNS"; done; done
    r=$((r + 1))
  done
  exit 0
fi

command -v "$CLAUDE" >/dev/null 2>&1 || die "claude not found: install Claude Code"
command -v jq >/dev/null 2>&1 || die "jq not found"
sha=$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo nogit)
[ -z "$(git -C "$ROOT" status --porcelain -- . ':!bench/results.jsonl' 2>/dev/null)" ] || sha=$sha-dirty
mkdir -p "$(dirname "$RESULTS")"
printf 'bench: model=%s effort=%s runs=%s sha=%s -> %s claude calls, up to $%s each\n' "$MODEL" "$EFFORT" "$RUNS" "$sha" "$n" "$BUDGET" >&2

one() { # one <task> <arm> <run>
  task=$1 arm=$2 run=$3
  P=$(mktemp -d "${TMPDIR:-/tmp}/helm-bench.XXXXXX") || die "no temp dir"
  fx=fixture; [ -f "$B/tasks/$task/fixture" ] && fx=$(cat "$B/tasks/$task/fixture")
  cp -R "$B/$fx" "$P/work"
  (cd "$P/work" && git init -q && git add -A && git -c user.name=bench -c user.email=bench@helm.invalid commit -qm fixture) || die "git init failed"
  plugin=; tools="Bash,Read,Edit,Write,Glob,Grep"
  case $arm in helm|helm-nolean) plugin=$ROOT;; esac
  [ "$arm" = helm-nolean ] && { mkdir -p "$P/work/.claude/helm"; printf off > "$P/work/.claude/helm/lean"; }
  start=$(date +%s)
  # shellcheck disable=SC2086
  (cd "$P/work" && ${BENCH_TIMEOUT:+timeout $BENCH_TIMEOUT} "$CLAUDE" -p "$(cat "$B/tasks/$task/prompt.md")" --output-format json \
    --model "$MODEL" --effort "$EFFORT" --max-budget-usd "$BUDGET" \
    --setting-sources project --strict-mcp-config --no-session-persistence \
    --settings '{"enabledPlugins":{"superpowers@claude-plugins-official":true}}' \
    --permission-mode acceptEdits --allowedTools "$tools" \
    ${plugin:+--plugin-dir "$plugin"} < /dev/null > "$P/out.json" 2> "$P/err.txt")
  rc=$?
  wall=$(( ($(date +%s) - start) * 1000 ))
  if sh "$B/tasks/$task/check.sh" "$P/work" > "$P/check.txt" 2>&1; then pass=true; else pass=false; fi
  jq -c -n --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg sha "$sha" --arg model "$MODEL" --arg task "$task" --arg arm "$arm" \
    --argjson run "$run" --argjson pass "$pass" --argjson rc "$rc" --argjson wall "$wall" --arg fx "$fx" --slurpfile o "$P/out.json" '
    ($o[0] // {}) as $r | ($r.usage // {}) as $u |
    {date: $date, sha: $sha, model: $model, fixture: $fx, task: $task, arm: $arm, run: $run, pass: $pass,
     input_tokens: ($u.input_tokens // 0), output_tokens: ($u.output_tokens // 0),
     cache_read_tokens: ($u.cache_read_input_tokens // 0), cache_creation_tokens: ($u.cache_creation_input_tokens // 0),
     cost_usd: ($r.total_cost_usd // 0), duration_ms: ($r.duration_ms // $wall), turns: ($r.num_turns // 0)}
    + (if $rc != 0 or ($r.is_error // false) then {error: true} else {} end)' >> "$RESULTS" 2>/dev/null \
  || jq -c -n --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg sha "$sha" --arg model "$MODEL" --arg task "$task" --arg arm "$arm" \
    --argjson run "$run" --argjson pass "$pass" --argjson wall "$wall" \
    '{date: $date, sha: $sha, model: $model, fixture: $fx, task: $task, arm: $arm, run: $run, pass: $pass, input_tokens: 0, output_tokens: 0,
      cache_read_tokens: 0, cache_creation_tokens: 0, cost_usd: 0, duration_ms: $wall, turns: 0, error: true}' >> "$RESULTS"
  printf '  %-24s %-9s run %s  pass=%s  %s\n' "$task" "$arm" "$run" "$pass" "$(tail -1 "$RESULTS" | jq -r '"$\(.cost_usd) \(.turns) turns \(.duration_ms / 1000 | floor)s" + (if .error then " ERROR" else "" end)')" >&2
  rm -rf "$P"
}

r=1
while [ "$r" -le "$RUNS" ]; do
  for t in $TASKS; do for arm in $ARMS; do one "$t" "$arm" "$r"; done; done
  r=$((r + 1))
done

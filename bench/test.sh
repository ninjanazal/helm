#!/bin/sh
# bench/test.sh: free self-test, no claude call. Each task's check must fail on the untouched fixture and pass with
# its solution.patch; DRY must list runs; the runner (with a stub claude) must append one row per task x arm x run; the
# report must print the table. Run: sh bench/test.sh
B=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
fails=0
ok()  { printf 'ok   %s\n' "$1"; }
bad() { fails=$((fails + 1)); printf 'FAIL %s\n' "$1"; }
git_() { git -c user.name=t -c user.email=t@t "$@"; }

for d in "$B"/tasks/*/; do
  t=$(basename "$d"); W=$T/$t
  fx=fixture; [ -f "$d/fixture" ] && fx=$(cat "$d/fixture")
  cp -R "$B/$fx" "$W"; (cd "$W" && git init -q && git add -A && git_ commit -qm base)
  sh "$d/check.sh" "$W" >/dev/null 2>&1 && bad "$t: check passes on the untouched fixture" || ok "$t: check fails on the untouched fixture"
  (cd "$W" && git apply "$d/solution.patch") || { bad "$t: solution.patch applies"; continue; }
  sh "$d/check.sh" "$W" >/dev/null 2>&1 && ok "$t: check passes with solution.patch" || bad "$t: check passes with solution.patch"
done
for fx in fixture fixture-large; do
  (cd "$B/$fx" && sh test.sh >/dev/null 2>&1) && ok "$fx suite passes untouched" || bad "$fx suite passes untouched"
done

# stub claude: prints a result JSON, and records argv and the plugin flag
cat > "$T/claude" <<'STUB'
#!/bin/sh
echo "$*" >> "$STUB_LOG"
echo '{"is_error":false,"num_turns":3,"duration_ms":1500,"total_cost_usd":0.01,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":30,"cache_creation_input_tokens":40}}'
STUB
chmod +x "$T/claude"
export STUB_LOG=$T/calls; : > "$STUB_LOG"
DRY=1 CLAUDE=$T/nope sh "$B/run.sh" > "$T/dry.txt" 2>&1 && grep -q 'nothing is run' "$T/dry.txt" && [ "$(grep -c 'run [0-9]/3' "$T/dry.txt")" -eq 48 ] \
  && ok 'DRY lists 8 tasks x 2 arms x 3 runs and calls nothing' || bad 'DRY lists 8 tasks x 2 arms x 3 runs and calls nothing'
CLAUDE=$T/claude RESULTS=$T/r.jsonl TASKS=fix-truncate RUNS=2 sh "$B/run.sh" >/dev/null 2>&1
[ "$(wc -l < "$T/r.jsonl")" -eq 4 ] && [ "$(jq -s 'map(select(.pass == false)) | length' "$T/r.jsonl")" -eq 4 ] && ok 'runner: 4 rows (stub changes nothing, so every check fails)' || bad 'runner: 4 rows'
[ "$(grep -c -- '--plugin-dir' "$T/calls")" -eq 2 ] && [ "$(grep -vc -- '--plugin-dir' "$T/calls")" -eq 2 ] && ok 'runner: --plugin-dir only in the helm arm' || bad 'runner: --plugin-dir only in the helm arm'
jq -e -s 'all(.[]; has("date","sha","model","task","arm","run","pass","input_tokens","output_tokens","cost_usd","duration_ms","turns"))' "$T/r.jsonl" >/dev/null && ok 'runner: rows have every column' || bad 'runner: rows have every column'
sh "$B/report.sh" "$B/results.sample.jsonl" | grep -q '| TOTAL |' && ok 'report prints the table from the sample' || bad 'report prints the table from the sample'
[ $fails -eq 0 ]

#!/bin/sh
# bench/report.sh [results.jsonl]: markdown table of helm vs baseline per model and fixture, per task and in total.
# For each model it compares the latest sha with the previous one (the last sha before it in the file).
# Columns: helm | baseline | delta (helm - baseline) | delta % | delta % at the previous sha.
# Pass is runs passed/run; tokens (input + output + cache), output (output tokens only), cost and time are medians per task (TOTAL = sum of the task medians, pass = all runs).
B=$(cd "$(dirname "$0")" && pwd); F=${1:-${RESULTS:-$B/results.jsonl}}
command -v jq >/dev/null 2>&1 || { echo 'jq not found' >&2; exit 1; }
[ -s "$F" ] || { echo "no results in $F: run make bench first" >&2; exit 1; }
jq -rs --arg arm "${ARM:-helm}" --arg vs "${VS:-baseline}" '
def med: sort | length as $n | if $n == 0 then null elif $n % 2 == 1 then .[($n-1)/2] else (.[$n/2-1] + .[$n/2]) / 2 end;
def tok: .input_tokens + .output_tokens + .cache_read_tokens + .cache_creation_tokens;
def st($r): {n: ($r|length), pass: ($r|map(select(.pass))|length), tokens: ($r|map(tok)|med), output: ($r|map(.output_tokens)|med), cost: ($r|map(.cost_usd)|med), time: ($r|map(.duration_ms/1000)|med)};
def sum($k): map(.[$k] // 0) | add;
def scopes($rows):
  ($rows | map(.task) | unique) as $ts
  | ([$ts[] as $t | {scope: $t, h: st($rows|map(select(.task == $t and .arm == $arm))), b: st($rows|map(select(.task == $t and .arm == $vs)))}]) as $per
  | $per + [{scope: "TOTAL",
      h: {n: ($per|map(.h.n)|add), pass: ($per|map(.h.pass)|add), tokens: ($per|map(.h)|sum("tokens")), output: ($per|map(.h)|sum("output")), cost: ($per|map(.h)|sum("cost")), time: ($per|map(.h)|sum("time"))},
      b: {n: ($per|map(.b.n)|add), pass: ($per|map(.b.pass)|add), tokens: ($per|map(.b)|sum("tokens")), output: ($per|map(.b)|sum("output")), cost: ($per|map(.b)|sum("cost")), time: ($per|map(.b)|sum("time"))}}];
def rnd($d): . as $x | if $x == null then null else (($x * pow(10; $d) | round) / pow(10; $d)) end;
def sg: if . == null then "-" elif . > 0 then "+\(.)" else "\(.)" end;
def rate($s): if $s.n == 0 then null else $s.pass / $s.n * 100 end;
def delta($m; $h; $b):   # [helm, base, delta, pct] as numbers (pct = pp for pass)
  if $m == "pass" then [rate($h), rate($b), (if rate($h) == null or rate($b) == null then null else rate($h) - rate($b) end), (if rate($h) == null or rate($b) == null then null else rate($h) - rate($b) end)]
  else [$h[$m], $b[$m], (if $h[$m] == null or $b[$m] == null then null else $h[$m] - $b[$m] end),
        (if $h[$m] == null or $b[$m] == null or $b[$m] == 0 then null else ($h[$m] - $b[$m]) / $b[$m] * 100 end)] end;
def cell($m; $v): if $v == null then "-" elif $m == "cost" then "$\($v|rnd(4))" elif $m == "time" then "\($v|rnd(1))s" elif $m == "pass" then "\($v|rnd(0))%" else "\($v|rnd(0))" end;
def dcell($m; $v): if $v == null then "-" elif $m == "cost" then ($v|rnd(4)|sg|sub("^\\+";"+$")|sub("^-";"-$")) elif $m == "time" then "\($v|rnd(1)|sg)s" elif $m == "pass" then "\($v|rnd(0)|sg)pp" else ($v|rnd(0)|sg) end;
def pcell($m; $v): if $v == null then "-" elif $m == "pass" then "\($v|rnd(0)|sg)pp" else "\($v|rnd(1)|sg)%" end;
map(. + {key: (.model + " · " + (.fixture // "fixture"))}) as $all
| ($all | map(.key) | unique[]) as $model
| ($all | map(select(.key == $model))) as $rows
| ($rows | to_entries | group_by(.value.sha) | map({sha: .[0].value.sha, last: (map(.key)|max)}) | sort_by(.last) | map(.sha)) as $shas
| ($shas | last) as $cur | (if ($shas|length) > 1 then $shas[-2] else null end) as $prev
| scopes($rows | map(select(.sha == $cur))) as $now
| (if $prev then scopes($rows | map(select(.sha == $prev))) else [] end) as $before
| "### \($model): sha \($cur)" + (if $prev then " vs previous \($prev)" else " (no previous sha)" end),
  "",
  "| scope | runs (helm/base) | metric | helm | baseline | delta | delta % | delta % prev sha |",
  "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
  ($now[] as $s
   | ($before | map(select(.scope == $s.scope)) | first) as $p
   | ("pass", "tokens", "output", "cost", "time") as $m
   | delta($m; $s.h; $s.b) as $d
   | (if $p then delta($m; $p.h; $p.b)[3] else null end) as $pd
   | "| \(if $m == "pass" then $s.scope else "" end) | \(if $m == "pass" then "\($s.h.n)/\($s.b.n)" else "" end) | \($m) | \(cell($m; $d[0]) | if $m == "pass" then "\($s.h.pass)/\($s.h.n)" else . end) | \(cell($m; $d[1]) | if $m == "pass" then "\($s.b.pass)/\($s.b.n)" else . end) | \(dcell($m; $d[2])) | \(pcell($m; $d[3])) | \(pcell($m; $pd)) |"),
  ""
' "$F"

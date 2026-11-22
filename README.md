# ⎈ helm

> Steer your Claude Code sessions: see what they cost and when they drift, and start every task from a complete prompt.

helm is a Claude Code plugin:

- **Deck pane:** the session's health beside the chat. A header with the task, time, turns, model, effort and branch; a focus meter (drift: time for a fresh session?); usage bars for context and the 5h and weekly limits with reset countdowns, tokens in and out, cost and cache hits; a row per sub agent with its own tokens and clock; and the approved `/helm:prompt`'s acceptance checks, which Claude ticks as it verifies them. Colours follow your theme, light or dark. It animates only while a turn runs.
- **`/helm:prompt`:** turns a rough request into a complete, checkable prompt (goal, grounded context, scope, acceptance checks, stop conditions) and saves it as the current task once approved.
- **Lean mode:** on by default, a short system-prompt section that cuts output tokens. `/helm:lean off` turns it off. Ideas from ponytail and caveman, written natively.
- **superpowers** (workflow skills) is installed with helm as a plugin dependency; helm's prompt and commit skills route to it and work without it.

## 📦 Install

```
make setup     # asks: this project or every project, and which pieces (helm, superpowers)
make remove    # asks the same, confirms, then uninstalls
make status    # what is installed, and where
```

Then run `/reload-plugins` and `/helm:help` in Claude Code.

From GitHub, without cloning: `/plugin install helm --marketplace ninjanazal/helm`.

### Upgrading from atlas

Earlier versions installed atlas (a local code index) and the `/helm:agent` herdr flow. Both are gone. To clean up an old install, run once per scope you used:

```
claude mcp remove --scope local atlas    # or --scope user
rm -rf .atlas                            # this project's venv, launcher and index
rm -f ~/.local/bin/atlas                 # user-scope launcher
rm -rf ~/.local/share/helm/atlas         # user-scope venv
rm -rf .claude/helm/tasks .claude/helm/team.json
```

## 🧭 Deck

- `/helm:switch` opens the pane; `/helm:switch on|off` turns helm (the deck and lean mode) on or off for the project; off survives `/clear` and new sessions. Each approved `/helm:prompt` re-anchors the task and resets drift.
- Drift = 0.4 × context fill + 0.4 × topic shift (new terms vs. the task's first prompt) + 0.2 × turns/60. At 0.70 it suggests a fresh session.
- Every number comes from the engine or git; cost is the engine's own estimate.

## ⌨️ Commands

| Command | What it does |
| --- | --- |
| `/helm:switch [on \| off]` | Turn helm on or off for this project (deck pane and lean mode) |
| `/helm:prompt <request>` | The one to work with: give it a task, it builds a complete prompt, and once you approve, "go" runs the pipeline (brainstorming, plans, split to cheaper sub agents) |
| `/helm:lean [on \| off \| lite \| full]` | Lean mode, on by default: fewer output tokens (answer first, no recap, smallest complete change) without dropping checks. Pin per project with `.claude/helm/lean` |
| `/helm:commit [--dry]` | Commit the staged changes: Conventional Commits subject, bulleted body, no attribution lines |
| `/helm:help` | The full guide |

## 📊 Bench

Does helm pay off? `make bench` runs a fixed task suite with headless `claude -p`, once with helm and once without, and compares the two.

```
make bench                              # all tasks, 3 runs per arm: 8 tasks x 2 arms x 3 = 48 paid claude calls
make bench TASKS=fix-truncate RUNS=1    # one task, one run per arm
make bench DRY=1                        # list task x arm x run, call nothing, spend nothing
make bench REPORT=1                     # only print the table from bench/results.jsonl
make bench MODEL=haiku EFFORT=low       # defaults: sonnet, medium
make bench ARMS='helm helm-nolean'      # lean A/B: helm vs helm with lean pinned off; then ARM=helm VS=helm-nolean make bench REPORT=1
sh bench/test.sh                        # free self-test: every check fails on the fixture and passes with its solution.patch
```

- **Tasks** (`bench/tasks/*`): a bug fix, a small feature, a refactor and a find-and-explain, all on `bench/fixture/` (a small POSIX sh library, `sh test.sh`). Each has `prompt.md`, a `check.sh` (exit 0 = pass) and a `solution.patch`.
- **Large fixture:** the `large-*` tasks run on `bench/fixture-large/` (about 120 files; `sh bench/gen-large.sh` regenerates it). The report groups by model and fixture.
- **Isolation:** each run gets a fresh copy of the fixture in a temp dir. Both arms use the same flags and enable superpowers (helm's dependency); only the helm arm adds `--plugin-dir`. `--setting-sources project`, `--strict-mcp-config` and `--no-session-persistence` keep your user settings, plugins, MCP servers and sessions out of the runs.
- **Results:** one JSONL row per run in `bench/results.jsonl` (date, sha, model, task, arm, run, pass, token counts, `cost_usd`, `duration_ms`, turns). Rows from a dirty tree get a `-dirty` sha. The file is yours to commit or not; `bench/results.sample.jsonl` holds invented numbers that only demo the report.
- **Report:** per model, per task and TOTAL: pass (runs passed/run), and the median tokens (input + output + cache read + cache creation), cost (the engine's estimate) and wall time, for helm and baseline, the delta (helm - baseline), delta %, and the same delta % for the previous sha, to see whether helm got better or worse. TOTAL sums the task medians.
- **Costs:** about $0.05-0.11 per run on sonnet, so roughly $3 for a full run; each run is capped at `BUDGET=1` USD. Needs `claude` and `jq`.
- **Limits:** 4 small tasks and 3 runs is a smoke signal, not statistics; compare only runs with the same model; drift and `/helm:prompt` are not measured; runs use `acceptEdits` plus Bash in a throwaway dir, so they can run commands.

## 🛠️ Developing

```
claude --plugin-dir .       # run it from this folder
make check                  # validate and run all the tests
claude plugin validate .    # check it
```

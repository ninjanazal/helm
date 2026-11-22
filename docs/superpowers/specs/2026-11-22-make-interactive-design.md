# Interactive make targets — design

## Intent
`make help` lists 24 targets and 4 variables; finding the right one is work. Replace them with 5 targets that need
no arguments: `make <target>`, and where a choice is needed a script asks for it.

## Goals / non-goals
- Goals: `make` shows ~5 lines; `make setup` / `make remove` ask where and which pieces; no arguments or variables
  needed for any normal use.
- Non-goals: changing what an install/remove actually does; new dependencies (no fzf/gum, no bash-isms).
- Anti-goals: a prompt that hangs in CI or a pipe; a bare command that deletes things without confirming.

## Targets
| Target | Does |
| --- | --- |
| `make` / `make help` | short help: the targets below |
| `make setup` | asks where (this project default / every project), then which pieces (Enter = all), showing each one's state; installs missing, updates installed; for an installed helm also offers disable/enable |
| `make remove` | asks where and which pieces, confirms, removes |
| `make status` | the old `doctor` report, no questions |
| `make index` | index this repo, no questions |
| `make check` | validate + tests, no questions |

Pieces: helm plugin, superpowers, atlas (binary + MCP + index), herdr check.

## How
- `scripts/helm.sh` (POSIX sh): all logic moved from the Makefile unchanged (scope checks, atlas BIN paths and lookup,
  doctor checks, ✔/○ output, colours only on a tty, NO_COLOR). Numbered menus via `read`.
- Not a tty → no prompts: setup uses defaults (this project, all pieces); remove refuses with a hint.
- `SCOPE=`, `FROM=`, `DIR=` env vars still preset the answers (quiet escape hatch, not shown in help).
- Makefile: ~40 lines, each target calls the script. Old names (local, global, unlocal, unglobal, doctor, install,
  plugin, plugin-remove, superpowers(-remove), herdr, atlas(-remove), index-remove, update, enable, disable, test,
  validate) run non-interactively as before and print `→ now: make <new>` on stderr; hidden from help.
- README, skills/help/SKILL.md, hooks/atlas.ts:49 (+ its test) point to `make setup` instead of `make atlas` /
  `make superpowers`. `make index` keeps its name.

## Approaches
1. **Interactive targets backed by a script (picked)**: no arguments, guided choices.
2. Verb + positional arguments (`make add atlas user`): rejected — the person doesn't want to pass arguments.
3. Fewer targets with variables (`make setup SCOPE=user`): rejected for the same reason.

## Left to the builder
Exact menu wording, how multi-select input is parsed (space-separated numbers), help text layout.

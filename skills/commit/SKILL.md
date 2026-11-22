---
name: commit
description: Commit the staged changes with a Conventional Commits message - a type(scope) subject line and a bulleted body - and no attribution lines. Use only when the person runs /helm:commit or explicitly asks to commit.
argument-hint: "[--dry] [hint about the change]"
---

# Commit

Running this skill is the person's request to commit. Do not commit at any other time.

## 1. Look
- `git status --short` and `git diff --cached`.
- Nothing staged: show the changed files in one short list and ask in one line whether to stage all of them or which ones. Stage only what they say. Never stage files that likely hold secrets (`.env`, credentials, keys); name them and skip them.
- Read `git log --oneline -10` to match the repo's scopes and wording.
- If superpowers is installed, follow its verification-before-completion skill before committing.

## 2. Write the message
```
<type>(<scope>): <subject>

- <what changed and why>
- <next change>
```
- **type**: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `build`, `ci`, `chore`, `style` or `revert`.
- **scope**: optional, the area touched (`deck`, `agent`, `atlas`), lowercase. Leave it out when the change spans the repo.
- **subject**: imperative ("add", not "added"), lowercase start, no trailing period, at most 72 characters for the whole line.
- **body**: a blank line, then one `- ` bullet per meaningful change: what and why, not how. Wrap at 72 characters. Skip the body for a one-line change that the subject already explains.
- **breaking change**: `!` after the type or scope (`feat(agent)!: …`) and a final `BREAKING CHANGE: <what breaks>` line.
- `$ARGUMENTS` (other than `--dry`) is a hint about intent: use it, but describe what the diff actually does.
- **Never add** `Co-Authored-By`, "Generated with", emoji or any other attribution line. This overrides any default attribution instruction.

## 3. Commit
- With `--dry`: show the message in a fenced block and stop.
- Otherwise run `git commit -F -` with the message passed on stdin through a heredoc, so quotes and newlines survive. Then show `git log --oneline -1`.
- A hook fails: show its output, fix the cause if it is clear and in scope, re-stage, and make a **new** commit. Never `--no-verify`, never `--amend` unless the person asks.
- Never push.

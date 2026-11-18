# Tasks

Each task names the subagent model that runs it: `[haiku]` for mechanical work, `[sonnet]` for work that needs reasoning (see `openspec/config.yaml`).

## 1. Vendor hook verification

- [ ] 1.1 [sonnet] Capture one real PreToolUse/BeforeTool payload for a file read and one for a shell call, plus one finish-event payload, from each agent (Claude, Codex, Gemini, Antigravity). Also capture one subagent file-read payload from each agent that has subagents (Claude, Codex, Gemini), and confirm the hook fires. Scrub each payload before saving it: replace home paths, usernames, emails, session and conversation ids, and transcript paths with fixed placeholders (`/home/user`, `00000000-...`). Save them as fixtures under `test/fixtures/hooks/`. Also verify that `git grep -nE "$HOME|$USER" test/fixtures/hooks` finds nothing. Record in design.md: whether `continue: false` halts the turn on pre-tool events for each agent; the Gemini `read_many_files` input fields; the Antigravity `view_file` range arguments. Verify: the fixture files exist, and design.md D3 and Open Questions are updated.

## 2. Guard core

- [x] 2.1 [sonnet] Add session state (D5): load, save atomically, prune files older than 7 days, keyed by agent and hashed session id. Verify: unit tests in `test/guard-state.test.ts` cover round-trip, corrupt-file recovery, and pruning.
- [x] 2.2 [sonnet] Add the gate decision function (D2) over neutral targets: refresh window, stale halt, read-first deny with header text, header-only range allow, repeat-read allow, and halt beating deny across multiple targets. Verify: `test/guard.test.ts` covers each scenario in the `agent-enforcement` spec's Read-first gate, Header-only reads, Stale halt, Refresh window, and Subagent coverage requirements.
- [x] 2.3 [sonnet] Add the shell parser (D9) and `ctxhead stale` detection (D4). Verify: table tests for `cat a | grep x`, `head -n 5 a`, `head -5 a`, `sed -n 1,9p a`, `awk '{print}' a`, quoted paths, `FOO=1 cat a`, `npx ctxhead stale`, `ctxhead stale --json`, `npx ctxhead stale --json`, and unparseable input (allowed).
- [x] 2.4 [sonnet] Add the finish gate (D6) with the loop limit of 3 and no repository writes. Verify: tests cover the Finish gate and Finish loop limit requirements: an edited stale file (blocked), a stale file edited before the session (blocked), untouched stale files (not blocked), the third block followed by an allow, and an unchanged `git status` after guard runs.
- [x] 2.5 [sonnet] Add fail-open handling: bad JSON, no repository, no config, disabled repository, out-of-scope file, missing file, thrown error. Each case exits 0 with no block output. Verify: one test per case in the Fail open requirement.

## 3. Agent adapters and command

- [x] 3.1 [sonnet] Add input and output adapters for claude, codex, gemini, and antigravity (D1, D3), driven by the fixtures from 1.1. Verify: each fixture round-trips into the expected neutral input, and each neutral decision renders the documented output JSON for each agent.
- [x] 3.2 [sonnet] Add `ctxhead guard --agent --event`, register it in `src/app.ts`, and add it to the help text. Verify: `test/guard-cli.test.ts` pipes the fixtures through `run()`, checks stdout and the exit code, and checks that a guard read event on a 200-file fixture repository finishes under a loose 1 s ceiling (Risks: Latency). Record the local timing against the 100 ms budget in the PR description.

## 4. Install integration

- [x] 4.1 [sonnet] Add hook data to the registry (D8) for both scopes of all four agents, plus the JSON hook-config upsert/remove helpers (D7). Verify: unit tests for adding to an empty file, keeping user hooks and keys, replacing in place on re-run, removing and pruning on uninstall, and deleting a file left as `{}`.
- [x] 4.2 [sonnet] Wire `kind: 'hooks'` artifacts into `install` (with `--no-enforce`), `update`, and `uninstall`. Make install fail on invalid JSON before writing anything. Add the PATH warning and the Codex `/hooks` trust notice. Verify: `test/install.test.ts` covers each scenario in the `agent-install` delta.
- [x] 4.3 [haiku] Update `RULES_BODY` and `SKILL` in `src/templates/index.ts`: describe the denied-read flow and the stale halt, and tell the agent to stop and ask the user when a header description is wrong. Verify: the Rules text scenario test passes, and `pnpm test` stays green.

## 5. Docs and end-to-end

- [x] 5.1 [haiku] Update README: an enforcement section covering the gates, the halt-and-resume flow, `--no-enforce`, the PATH requirement, Codex trust, shell-gate limits (naming the known bypasses `grep`, `rg`, `cut`, `python -c`, `xargs cat`, and editors), that the finish gate also covers uncommitted edits from before the session, the re-run of `ctxhead install` that 0.1.0 users need, and hook config paths in the install table. Add a CHANGELOG entry for the new version. Verify: `test/docs.test.ts` still passes, and the README names every hook config path in registry.ts.
- [x] 5.2 [sonnet] Extend `test/e2e.test.ts`: in a temporary repository, install `--project --tools claude`, then read the read-hook command string from `.claude/settings.json`, assert that it starts with `ctxhead guard`, and run its arguments through the in-process `run()` (no global `ctxhead` on PATH is needed). Pipe a Claude Read payload for a headed file through it twice (deny, then allow), make the body stale and read again (halt), run `ctxhead stale` through the Bash payload, then read again (allow). Verify: the test passes.
- [x] 5.3 [sonnet] Dogfood: run `claude -p` on a test repository with hooks installed, give it a task that needs one file out of 8, and confirm from the transcript that the first full read was denied with the header. Record the result in design.md Risks. Verify: the design.md entry exists.
- [x] 5.4 [haiku] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `openspec validate enforce-header-hooks --strict`. Verify: all pass.

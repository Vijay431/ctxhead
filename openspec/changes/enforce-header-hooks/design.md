# Design

## Context

See proposal.md (Why). Today `ctxhead install` writes three kinds of artifact, listed per agent in `src/agents/registry.ts`: a skill file, a command file, and marked blocks. Files are owned through the `ctxhead-managed` marker, and blocks through `<!-- ctxhead:start/end -->`. Hook configs are JSON files that the user and other tools share. JSON has no comments, so neither ownership method works for them.

Hook support was checked against vendor docs on 2026-11-17:

| Agent | Hook config (project / global) | Read tools (input) | Shell tool (input) | Finish event | Block output |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `.claude/settings.json` / `~/.claude/settings.json` | `Read` (`file_path`, `offset`, `limit`) | `Bash` (`command`) | `Stop` | PreToolUse `hookSpecificOutput.permissionDecision: "deny"` + `permissionDecisionReason`; Stop `decision: "block"` + `reason` |
| Codex | `.codex/hooks.json` (trusted projects only) / `~/.codex/hooks.json` | none built in; reads go through shell | `Bash`, `exec_command` (`command`) | `Stop` | same as Claude; Stop `decision: "block"` turns into a continuation prompt |
| Gemini CLI | `.gemini/settings.json` / `~/.gemini/settings.json` | `read_file`, `read_many_files` | `run_shell_command` | `AfterAgent` | `decision: "deny"` + `reason`; AfterAgent deny forces a retry |
| Antigravity | `.agents/hooks.json` / `~/.gemini/config/hooks.json` | `view_file` (`AbsolutePath`) | `run_command` (`CommandLine`) | `Stop` | PreToolUse `decision: "deny"` + `reason`; Stop `decision: "continue"` + `reason` |

Session ids are `session_id` in Claude, Codex, and Gemini, and `conversationId` in Antigravity. Exit code 2 blocks in Claude, Codex, and Gemini. Antigravity documents only JSON output.

## Goals / Non-Goals

**Goals:**
- One `guard` code path for all agents. Per-agent differences stay as data or as small adapters.
- Never break an agent session because of a ctxhead fault.
- Keep the hook cheap: no full-repository scan on read events.

**Non-Goals:**
- Airtight enforcement against shell tricks (`python -c`, `xargs cat`, editors). The shell gate covers common read commands only.
- Detecting semantically wrong descriptions. That stays an agent duty, set by the rules text.
- MCP file-read tools, and agents other than the four supported ones.

## Decisions

**D1. One subcommand, adapters per agent.** `ctxhead guard --agent <id> --event read|finish`. An adapter turns the stdin payload into `{ sessionId, cwd, targets: { path, range? }[], shellCommand?, retry? }`, and turns a neutral decision (`allow | deny(reason) | halt(message) | block-finish(reason)`) into the agent's output. Alternative: one hook script per agent. Rejected, because it duplicates the gate logic four times.

**D2. Gate order for each target file.** First apply the fail-open checks: repository, config, enabled, in scope, file exists. Then check the refresh window, then the header state. A stale, invalid, or missing header means halt. A fresh header means: allow if it was already shown this session or the range ends at or before the header; otherwise mark it shown and deny with the header. When one call has several targets, a halt beats a deny, and a deny reason lists every header it withholds.

**D3. Halt mechanism.** In Claude and Gemini, a halt prints `continue: false` with a `stopReason` that the user sees, together with a deny for the tool call. In Codex and Antigravity it denies the call, with a reason starting `STOP: do not continue this task.` that tells the agent to report the listed files to the user and wait. Task 1.1 confirms `continue: false` on pre-tool events for Claude and Gemini, and checks whether Codex or Antigravity support it. If they do, it becomes a registry flag and needs no code change. Alternative: Claude's `permissionDecision: "ask"`. Rejected, because the user chose a turn halt plus a manual resume over prompts for each file.

**D4. Refresh window via `ctxhead stale` detection.** When the shell gate sees a simple command whose program is `ctxhead` (or `npx ctxhead`) with the subcommand `stale`, followed by any flags such as `--json`, the guard runs the same read-only scan at that moment. It saves the non-fresh paths in session state, then allows the command. This reuses the skill's first step, so the skill needs no new step. Alternative: an explicit `ctxhead guard --unlock` command. Rejected, because it is an extra step agents would forget, and it is an easy bypass.

**D5. Session state.** Stored as JSON at `$XDG_STATE_HOME/ctxhead/sessions/<agent>-<sha256(sessionId)>.json`, falling back to `~/.local/state/...`. It holds `{ shown: string[], window: string[], finishBlocks: number }`, with repo-absolute paths. Writes go through a temporary file and a rename. Files older than 7 days are pruned whenever state is written. Losing the state is harmless, because the worst case is one extra header deny. Subagent tool calls are expected to fire the parent's pre-tool hooks, and task 1.1 confirms this for each agent. State is keyed by the session id in the payload, so a subagent with its own id is shown each header once itself, and one that shares the parent id reuses the parent's state. Alternative: the OS temp directory. Rejected, because it is world-readable on some systems and file paths can be sensitive.

**D6. Finish gate scope.** Changed files come from `git status --porcelain`: modified, staged, and untracked. They are filtered to in-scope files and checked with `inspect()`. The scan does not use the `stale` command code path, because `stale` writes `lastRunSha` and the guard must never write to the repository. The loop counter resets on any allowed finish. The limit of 3 is a constant, not configuration. This scope includes uncommitted edits made before the session, because git cannot tell who made them. Alternative: snapshot the dirty set at the session's first hook event and block only on files changed after it. Rejected, because a write tool can fire before any read hook, so the snapshot could miss the agent's own first edit; the loop limit already bounds the cost of a pre-existing stale file.

**D7. Hook config ownership by command prefix.** A handler is ctxhead-owned when its `command` starts with `ctxhead guard`. Upsert removes every owned handler and then adds the current set, putting each into its own matcher group so that user groups are never edited. Uninstall removes owned handlers and prunes empty groups and events. It deletes the file only if the result is `{}`. Formatting is two-space JSON with a trailing newline. User key order is kept, because `JSON.parse` keeps insertion order. Alternative: a sidecar ownership file. Rejected, because it is extra state that can drift from the config.

**D8. Registry carries hook data.** Each `ScopeTargets` entry gains `hooks: { path, format, read: { event, matcher }, finish: { event } } | null`. `format` picks between the Claude/Codex/Gemini nested `{ matcher, hooks: [...] }` shape and the Antigravity shape, where the finish event holds handlers directly. `artifactsFor` adds a `kind: 'hooks'` artifact unless `--no-enforce` is passed. `update` and `uninstall` find hook artifacts by owned entries, the same way they find files by marker.

**D9. Shell parser.** A small hand-written tokenizer handles single and double quotes and backslash escapes. It splits on `|`, `;`, `&&`, and `||`, and skips env-assignment prefixes and `sudo`. File arguments are the non-flag tokens. For `sed` and `awk`, the first non-flag token is the script, so it is skipped. For `head -n N` or `head -N`, the line count is used as the range. Anything else, such as subshells, here-docs, or unbalanced quotes, is treated as unparseable and allowed. There is no new dependency.

## Risks / Trade-offs

- [Missing headers halt reads in a freshly onboarded repository] → Expected after `ctxhead add`: the agent's first read halts, and the user tells the agent to run the ctxhead skill. The skill's `ctxhead stale` opens the refresh window. The README documents this flow.
- [`ctxhead` not on PATH (npx users)] → The hook command fails with a non-blocking error, so it fails open. Install warns about this. The hook command uses a bare `ctxhead` rather than `npx`, because npx adds about a second to every read.
- [Codex project hooks need trust] → They do nothing until the user trusts them with `/hooks`. Install prints this, and the README says it.
- [Latency on every read] → One `git rev-parse` call, one config read, and one file read and hash. The budget is under 100 ms, measured locally. The automated timing test asserts a loose 1 s ceiling so shared CI runners do not make it flaky; it catches accidental full-repository scans, not small regressions.
- [Shell gate bypasses] → Accepted and documented, including `grep`, `rg`, `cut`, `python -c`, `xargs cat`, and editors. The finish gate still enforces fresh headers on changed files.
- [Fixtures leak personal data] → Real payloads from task 1.1 contain home paths, usernames, session ids, and transcript paths. Before committing, replace them with placeholders (`/home/user`, fixed fake ids). The repository is public.
- [E2E needs the hook command on PATH] → The installed hook command is a bare `ctxhead`. The e2e test reads the command string from the installed config, asserts it starts with `ctxhead guard`, and runs its arguments through the in-process `run()`. That tests the registered arguments without needing a global install.
- [Vendor payload drift] → Adapters fail open on unknown shapes. The e2e fixtures capture real payloads (task 1.1), so drift shows up as a test update.

## Migration Plan

This ships after 0.1.0 is published. Users on 0.1.0 who run `ctxhead update` get no hooks, because update only regenerates owned artifacts. They run `ctxhead install` again to add them, and the CHANGELOG entry and README say so. Rollback is `ctxhead uninstall`, or `ctxhead install --no-enforce` after an uninstall.

## Open Questions

- Gemini `read_many_files` input field names, and the Antigravity `view_file` line-range argument names. Task 1.1 resolves both, and they only change adapter data.

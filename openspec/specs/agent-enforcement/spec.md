# agent-enforcement Specification

## Purpose

Enforces ctxhead's rules inside AI agents at hook time. Agents see a file's header before its body, stop when a header is stale, and refresh the headers of files they changed before ending a turn.

## Requirements

### Requirement: Guard command
The CLI SHALL provide `ctxhead guard --agent <id> --event <read|finish>`. It reads the agent's hook payload as JSON from stdin and writes a decision in that agent's native hook output format. It SHALL support the agent ids `claude`, `codex`, `gemini`, and `antigravity`.

#### Scenario: Unknown agent id
- **WHEN** `ctxhead guard --agent cursor --event read` runs
- **THEN** it allows the action and writes nothing that blocks the agent

### Requirement: Fail open
The guard SHALL allow the action in each of these cases: the payload cannot be parsed; the target is outside a git repository; the repository has no `.ctxhead.json`; ctxhead is disabled there; the target file is out of scope or does not exist; or the guard hits an internal error. It SHALL NOT exit with a code the agent treats as a block in any of these cases.

#### Scenario: Repository without ctxhead
- **WHEN** an agent reads a file in a repository that has no `.ctxhead.json`
- **THEN** the guard allows the read

#### Scenario: Malformed payload
- **WHEN** the guard receives text on stdin that is not valid JSON
- **THEN** the guard allows the action and exits 0

### Requirement: Read-first gate
For an in-scope file with a fresh header, the guard SHALL deny the first read in an agent session that would return lines after the header. The deny reason SHALL contain the header text and tell the agent to re-issue the read only if the header does not settle its question. Once the header has been shown, later reads of that file in the same session SHALL be allowed.

#### Scenario: First full read
- **WHEN** an agent reads `src/auth.ts`, which has a fresh header, for the first time in a session, with no line range
- **THEN** the read is denied, and the reason contains the header of `src/auth.ts` and the instruction to re-issue the read only if needed

#### Scenario: Repeat read
- **WHEN** the same agent session reads `src/auth.ts` again after that denial
- **THEN** the read is allowed

### Requirement: Header-only reads
A read limited to lines at or before a header's closing line SHALL be allowed, and SHALL count as the header having been shown in that session.

#### Scenario: Header-only read
- **WHEN** an agent reads `src/auth.ts` limited to its first 5 lines and the header ends on line 5
- **THEN** the read is allowed, and a later full read of `src/auth.ts` in that session is allowed

#### Scenario: New session
- **WHEN** a different agent session reads `src/auth.ts` with no line range
- **THEN** the read is denied with the header, as for a first read

### Requirement: Stale halt
When an agent reads an in-scope file whose header is stale, invalid, or missing, outside a refresh window, the guard SHALL halt the agent's turn. Where the agent's hooks can end the turn, the guard SHALL end it. Elsewhere it SHALL deny the read with a reason telling the agent to stop and report to the user. The halt message SHALL name each file and its state, and ask the user to refresh the headers and then resume.

#### Scenario: Stale header halts the turn
- **WHEN** an agent reads `src/db.ts`, whose body changed after its header was stamped, outside a refresh window
- **THEN** the agent's turn stops, and the user sees a message naming `src/db.ts` as stale and asking them to refresh headers and then resume

#### Scenario: Missing header halts the turn
- **WHEN** an agent reads in-scope `src/new.ts`, which has no header, outside a refresh window
- **THEN** the turn halts with `src/new.ts` listed as missing

### Requirement: Refresh window
When an agent session runs `ctxhead stale`, with or without flags such as `--json` and with or without an `npx` prefix, through its shell tool, the guard SHALL record the files that are missing, invalid, or stale at that moment. Reads of those files in that session SHALL then be allowed without the read-first gate or the stale halt. A file SHALL leave the window once its header is fresh again.

#### Scenario: Skill refreshes a stale file
- **WHEN** an agent session runs `ctxhead stale`, which lists `src/db.ts`, and then reads `src/db.ts`
- **THEN** the read is allowed

#### Scenario: Skill runs stale with --json
- **WHEN** an agent session runs `ctxhead stale --json`, which lists `src/db.ts`, and then reads `src/db.ts`
- **THEN** the read is allowed

#### Scenario: Window does not cover other files
- **WHEN** that session then reads `src/cache.ts`, which became stale after `ctxhead stale` ran
- **THEN** the turn halts for `src/cache.ts`

### Requirement: Shell read gate
The guard SHALL check, on a best-effort basis, the file arguments of each simple command in a shell call (split on `|`, `;`, `&&`, `||`) whose program is `cat`, `head`, `tail`, `sed`, `less`, `more`, `bat`, `awk`, or `nl`. The read gates SHALL apply to those files as to read-tool calls, with `head` line counts treated as a range. A command the guard cannot parse SHALL be allowed.

#### Scenario: cat on a headed file
- **WHEN** an agent runs `cat src/auth.ts | grep token` in a new session and `src/auth.ts` has a fresh header
- **THEN** the command is denied with the header of `src/auth.ts` as the reason

#### Scenario: Unrelated command
- **WHEN** an agent runs `pnpm test`
- **THEN** the command is allowed

### Requirement: Finish gate
When an agent tries to end its turn, the guard SHALL block the finish if any in-scope file that is modified, staged, or untracked relative to `HEAD` has a missing, invalid, or stale header. The reason SHALL list those files and tell the agent to refresh them with the ctxhead skill. This includes uncommitted changes made before the session began. Unchanged files SHALL NOT block the finish.

#### Scenario: Pre-existing uncommitted edit
- **WHEN** `src/util.ts` was edited and left stale before the session began, and the agent tries to end its turn
- **THEN** the finish is blocked with `src/util.ts` listed

#### Scenario: Edited file left stale
- **WHEN** an agent edits `src/auth.ts`, which has a header, and tries to end its turn without refreshing it
- **THEN** the finish is blocked with `src/auth.ts` listed and the instruction to run the ctxhead skill

### Requirement: Finish loop limit
After 3 consecutive blocked finishes in one session, the guard SHALL allow the finish and name the files that are still stale in its output.

#### Scenario: Loop limit
- **WHEN** the finish has been blocked 3 times in a row in one session and the agent tries to finish again
- **THEN** the finish is allowed

#### Scenario: Untouched stale files
- **WHEN** `src/old.ts` is stale but unchanged in the working tree, and the agent tries to end its turn
- **THEN** the finish is not blocked because of `src/old.ts`

### Requirement: Subagent coverage
The read gates SHALL apply to file-read and shell tool calls made by subagents an agent spawns, the same as to the main agent. The finish gate SHALL apply to the main agent's end of turn.

#### Scenario: Subagent full read
- **WHEN** a subagent reads `src/auth.ts`, which has a fresh header, for the first time in its session
- **THEN** the read is denied with the header

### Requirement: Session state location
The guard SHALL keep per-session state outside the repository, under the user's state or temporary directory, keyed by agent and session id. It SHALL NOT write any file inside the repository.

#### Scenario: Repository stays clean
- **WHEN** the guard denies a read in a repository
- **THEN** `git status` in that repository shows no new or changed files

### Requirement: Agent-judged stale header
The installed rules block and skill SHALL tell agents what to do when a fresh header's description is wrong for the file. The agent must stop its task, name the file to the user, and ask the user to refresh its header before resuming.

#### Scenario: Rules text
- **WHEN** the installed rules block is read
- **THEN** it states that an agent which finds a header description wrong stops and asks the user to refresh it before resuming

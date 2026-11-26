# Proposal

## Why

The rules block only asks agents to read a file's ctxhead header before the body, and to refresh headers after edits. Agents can ignore it. The first dogfood run showed this: the control agent read a whole 101-line file. All four supported agents now have pre-tool and end-of-turn hooks that can block an action, so ctxhead can enforce both rules instead of asking for them.

## What Changes

- New `ctxhead guard` subcommand. It runs as an agent hook, reads the hook's JSON from stdin, and writes the agent's decision format to stdout.
- **Read-first gate**: the first read of the body of an in-scope file with a fresh header is denied in each agent session, for main agents and subagents alike. The deny reason carries the file's header and tells the agent to re-issue the read only if the header is unclear for its task. A later read of the same file in that session is allowed. Reads that stop at the end of the header are always allowed.
- **Stale halt**: a read of an in-scope file whose header is stale, invalid, or missing halts the agent's whole turn instead of being retried. The halt message lists the files and asks the user to refresh their headers and then tell the agent to resume. The rules and skill tell the agent to halt the same way when it judges a fresh header's description wrong.
- **Refresh window**: after the agent runs `ctxhead stale` in a session, reads of the files that command listed are allowed, so the ctxhead skill can refresh headers without being halted.
- **Shell gate** (best effort): common file-reading shell commands (`cat`, `head`, `tail`, `sed`, `less`, `more`, `bat`, `awk`, `nl`) on headed files follow the same rule as the read tools.
- **Finish gate**: when the agent tries to end its turn, in-scope files that are modified, staged, or untracked in the working tree and have a missing, invalid, or stale header block the finish. This covers uncommitted changes from before the session too, because git cannot tell who made them. The reason tells the agent to follow the ctxhead skill. After a fixed number of consecutive blocks in one session, the gate lets the agent finish, so it can never loop forever.
- `ctxhead install` writes the hook registrations into each selected agent's hook config by default. A new `--no-enforce` flag skips them. `update` regenerates them and `uninstall` removes them, touching only ctxhead's own entries.
- The guard fails open. Any error inside the guard, or a repository where ctxhead is not initialised or is disabled, allows the action.
- The rules block and skill text explain the denied-read flow, the stale halt, and the agent's duty to halt on a wrong description.

## Capabilities

### New Capabilities
- `agent-enforcement`: hook-time enforcement of ctxhead rules inside AI agents. Covers the read-first gate, the stale halt and refresh window, the shell gate, the finish gate, subagent coverage, session memory, loop limits, and fail-open behavior.

### Modified Capabilities
- `agent-install`: install, update, and uninstall also manage hook registrations in each agent's hook config, with a `--no-enforce` opt-out.

## Impact

- New code: `src/commands/guard.ts`, a per-agent hook adapter module, a shell-command parser, and a JSON hook-config merger in `src/agents/`.
- Changed code: `src/agents/registry.ts` (hook config paths per agent and scope), `src/commands/install.ts` (new artifact kind, `--no-enforce`), `src/templates/index.ts` (rules text), `src/app.ts` (help text).
- Agent config files written: `.claude/settings.json`, `.codex/hooks.json`, `.gemini/settings.json`, `.agents/hooks.json` (project), plus their global equivalents.
- Users must have `ctxhead` on `PATH` for hooks to run. Codex requires users to trust new project hooks with `/hooks` before they run.
- No new runtime dependencies.
- Release: ships after 0.1.0 (`add-oss-governance`) as its own version, with its own CHANGELOG entry. Real hook payload fixtures are committed to a public repository, so they are scrubbed of personal data first.

# Proposal

## Why

AI coding agents open whole source files to learn what a file does, which wastes tokens and context. A short, fixed-format header at the top of each file lets an agent read about 15 lines and decide whether the body is worth opening. Agents differ in where they keep instructions, skills, and commands, so users need one tool that installs the same behavior into every agent they use and keeps headers honest as code changes.

## What Changes

- New npm CLI package `ctxhead`. There is no VS Code extension; the earlier plan for one is dropped.
- `ctxhead install` detects installed agents (Claude Code, Codex, Gemini CLI, Antigravity), lets the user pick them, and installs one skill and one command per selected agent. `--global` installs into user-level agent folders; `--project` installs into the repository root. `--tools` limits the install to named agents. `update` regenerates installed files; `uninstall` removes them.
- Project installs add a marked ctxhead block to `AGENTS.md`, plus the shims Claude Code and Gemini CLI need to read it. Global installs add the block to each selected agent's own global rules file.
- Per-repository onboarding, in order: `ctxhead init` creates `.ctxignore`, then `add` sets which paths get headers, then `enable` / `disable` turns header writing on or off.
- Runtime commands that agent skills call: `stale` (list files whose headers are missing or out of date, with a token estimate), `write` (validate and stamp a header), and `check` (read-only gate for CI and hooks).
- Header format: comment-wrapped frontmatter with `name`, `description`, and a tool-owned `ctxhead` line holding the body hash. Limits follow Agent Skills frontmatter (`name` 1-64 characters, `description` 1-1024 characters).
- Staleness uses the body hash in each header plus one repository-level `lastRunSha`, not a commit SHA per file.
- The repository is scaffolded as a plain TypeScript npm CLI. `vscode-extension-template` is not used.

## Capabilities

### New Capabilities

- `agent-install`: Detecting agents and installing, updating, and removing ctxhead skills, commands, and rules blocks at global or project scope.
- `repo-onboarding`: Per-repository setup: `.ctxignore`, the include list, and the enabled/disabled state.
- `file-header`: The header format, its placement in a file, its validation limits, and how `ctxhead write` stamps it.
- `header-staleness`: How ctxhead decides that a header is missing, invalid, or stale, and the `stale` and `check` commands.

### Modified Capabilities

None. The project has no existing specs.

## Impact

- New code: the whole CLI (`src/`), tests, and the npm package manifest. The repository has no code today.
- New runtime dependencies: an interactive prompt library and a gitignore-syntax matcher. Everything else uses the Node standard library.
- Writes outside the repository: `--global` installs write into user-level agent folders such as `~/.claude/`.
- Files in user repositories: `.ctxignore`, `.ctxhead.json`, the `AGENTS.md` block, shims, and headers in included source files.
- Docs: `README.md` and `CLAUDE.md` still describe a VS Code extension and need updating.

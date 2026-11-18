<p align="center"><img src="assets/banner.svg" alt="ctxhead: headers that let AI agents read 15 lines, not the whole file" width="100%"></p>

# ctxhead

An npm CLI that puts a short frontmatter header at the top of each source file, so AI coding
agents read ~15 lines instead of whole files. Staleness is detected with a per-file body hash
plus one repository-level `lastRunSha`.

ctxhead installs a skill, a command, and a rules block into the
agents you already use: Claude Code, Codex, Gemini CLI, and Antigravity.

Requires Node 22+ and git.

## Quick start

```sh
npm install -g ctxhead          # or run any command with `npx ctxhead`

ctxhead install --project --tools claude   # skill, command and rules block for your agent
ctxhead init                    # creates .ctxignore and .ctxhead.json
ctxhead add src                 # choose what gets headers
ctxhead enable                  # allow header writes
ctxhead stale                   # see what needs a header, with a token estimate
```

<p align="center"><img src="assets/demo.svg" alt="Terminal demo: ctxhead init, add src, enable, write and check on a sample file" width="800"></p>

Then ask your agent to run the `ctxhead` skill (or the `/ctxhead` command). The agent writes
each description; the CLI validates and stamps it.

## Onboarding commands

| Command                      | What it does                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ctxhead init`               | Creates `.ctxignore` (default exclusions) and `.ctxhead.json` (empty include list, disabled). Existing files are kept. |
| `ctxhead add <path...>`      | Adds files or folders (relative to the repo root) to the include list.                                                 |
| `ctxhead remove <path...>`   | Removes them from the include list.                                                                                    |
| `ctxhead enable` / `disable` | Allows or blocks header writes in this repository.                                                                     |
| `ctxhead status`             | Shows enabled state, include list, files in scope, and missing/stale/invalid counts.                                   |

A file is in scope when it is under an included path, not matched by `.ctxignore` or
`.gitignore`, and has a supported line-comment syntax. See [docs/header-format.md](docs/header-format.md).

## Agent commands

| Command                                                  | What it does                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ctxhead stale [--json]`                                 | Lists files whose header is missing, invalid, or stale. Records `lastRunSha` when nothing is listed. |
| `ctxhead write <file> [--name <n>] --description <text>` | Validates and writes a header. Exit 2 and `rule <id>:` lines when the input breaks a rule.           |
| `ctxhead check`                                          | Read-only: exit 1 if any in-scope file is missing, invalid, or stale. Use it in CI.                  |

## Installing into agents

```sh
ctxhead install --global                         # pick agents interactively, user-level
ctxhead install --project --tools claude,codex   # repository-level, named agents
ctxhead update --project                         # regenerate after upgrading ctxhead
ctxhead uninstall --project                      # remove everything ctxhead wrote
```

Exactly one of `--global` or `--project` is required. Without `--tools`, an interactive picker
preselects detected agents; in a non-interactive shell `--tools` is required.

| Agent       | `--project` writes                                                                                              | `--global` writes                                                                                   | `--project` hook config                 | `--global` hook config        |
| ----------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------- |
| Claude Code | `.claude/skills/ctxhead/SKILL.md`, `.claude/commands/ctxhead.md`, `AGENTS.md` block, `CLAUDE.md` import block   | `~/.claude/skills/ctxhead/SKILL.md`, `~/.claude/commands/ctxhead.md`, `~/.claude/CLAUDE.md` block   | `.claude/settings.json`                 | `~/.claude/settings.json`     |
| Codex       | `.agents/skills/ctxhead/SKILL.md`, `AGENTS.md` block                                                            | `~/.agents/skills/ctxhead/SKILL.md`, `~/.codex/AGENTS.md` block                                     | `.codex/hooks.json` (trust it in Codex) | `~/.codex/hooks.json`         |
| Gemini CLI  | `.gemini/skills/ctxhead/SKILL.md`, `.gemini/commands/ctxhead.toml`, `AGENTS.md` block, `GEMINI.md` import block | `~/.gemini/skills/ctxhead/SKILL.md`, `~/.gemini/commands/ctxhead.toml`, `~/.gemini/GEMINI.md` block | `.gemini/settings.json`                 | `~/.gemini/settings.json`     |
| Antigravity | `.agents/skills/ctxhead/SKILL.md`, `.agents/workflows/ctxhead.md`, `AGENTS.md` block                            | `~/.gemini/config/skills/ctxhead/SKILL.md`, `~/.gemini/AGENTS.md` block                             | `.agents/hooks.json`                    | `~/.gemini/config/hooks.json` |

Codex has no custom-command install, and Antigravity has no global command (no documented path).
Every installed file carries a `ctxhead-managed` marker; ctxhead never overwrites or deletes an
unmarked file, and edits shared files (`AGENTS.md` and friends) only between
`<!-- ctxhead:start -->` and `<!-- ctxhead:end -->`.

## Enforcement

`ctxhead install` also registers a guard hook in each agent's hook config (see the table
above). The hook runs `ctxhead guard`, which checks each file read and each end of turn against
the headers. The rules text asks agents to follow the header rules. The guard makes them do it.

### Gates

- **Read-first gate.** The first read of a file's body in an agent session is denied. The agent
  sees the file's header instead. It can read the body again if the header does not answer its
  question. Later reads of the same file in that session are allowed. Reads that stop at the end
  of the header are always allowed. Subagents get the same rule.
- **Stale halt.** Reading a file whose header is stale, invalid, or missing stops the agent's
  turn. Claude Code and Gemini CLI stop the turn. Codex and Antigravity deny the read with a
  message that starts with `STOP:`, and the agent reports to you and waits.
- **Shell gate.** A shell command that reads a headed file with `cat`, `head`, `tail`, `sed`,
  `less`, `more`, `bat`, `awk`, or `nl` follows the same rules. It is best effort. See the limits
  below.
- **Finish gate.** The agent cannot end its turn while an in-scope file that is modified, staged,
  or untracked has a missing, invalid, or stale header. This includes uncommitted edits from
  before the session, because git cannot tell who made them. After 3 blocked finishes in a row,
  the gate lets the agent finish and names the files that are still stale.

### Halt and resume

When a turn halts, the message names the stale or missing files. To continue:

1. Ask the agent to run the `ctxhead` skill, or `/ctxhead` where the agent has the command, to
   refresh the listed headers.
2. Tell the agent to resume.

The skill runs `ctxhead stale` first. That opens a refresh window for the files it lists, so the
skill can read them and rewrite their headers. Other stale files stay gated. The rules text also
tells agents to stop and ask you to refresh a header when its description is wrong for the file.

### Shell gate limits

The shell gate checks only the read commands listed above. These bypass it:

- `grep`, `rg`, and `cut`
- `python -c` and other one-line interpreter scripts
- `xargs cat`
- editors

The finish gate still checks every changed file, so an edited file with a stale header still
blocks the finish.

### Requirements

- `ctxhead` must be on your `PATH`. The hooks call `ctxhead guard` by name, not through `npx`,
  because `npx` adds about a second to every read. Install a global copy with
  `npm i -g ctxhead`. Install warns when it cannot find `ctxhead`. Without it, the hooks fail open
  and do nothing.
- Codex does not run project hooks until you trust them. Run `/hooks` in Codex and trust the
  ctxhead entries for each project.

### Fails open

The guard allows the action when it hits an error, when the file is outside a git repository,
when ctxhead is not initialised there, or when ctxhead is disabled. A broken guard never blocks
your agent.

Per-session state lives in `$XDG_STATE_HOME/ctxhead` (or `~/.local/state/ctxhead`), never in your
repository. Losing it costs one extra read denial. Session files older than 7 days are removed.

### Turn it off

Pass `--no-enforce` to skip the hooks:

```sh
ctxhead install --project --tools claude --no-enforce
```

`ctxhead update` regenerates the hooks that are installed. `ctxhead uninstall` removes only
ctxhead's own hook entries and keeps the rest of each file.

### Upgrading from 0.1.0

`ctxhead update` does not add hooks to a 0.1.0 install. Run `ctxhead install` again with the same
`--global` or `--project` and `--tools` flags to add them.

## Exit codes

`0` success, `1` failure (or `check` found problems), `2` validation rejected by `write`.

## License

ctxhead is licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text, and [TRADEMARKS.md](TRADEMARKS.md) for the trademark policy covering the name "ctxhead".

Files that ctxhead generates in your repository belong to you. This includes the frontmatter headers, `.ctxhead.json`, `.ctxignore`, and the installed skill, command, and rules files.

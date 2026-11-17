# Design

## Context

The repository holds only planning files: `README.md`, `CLAUDE.md`, `openspec/`, and `.claude/`. There is no code. The original plan was a VS Code extension built from `vscode-extension-template`; that plan is dropped (see proposal.md - What Changes). The CLI's installer layout follows OpenSpec (`@fission-ai/openspec`, MIT), which keeps one table row per agent (`skillsDir`, `detectionPaths`) and one adapter per agent for command paths and formats. OpenSpec installs at project scope only; ctxhead adds a global scope.

The CLI never calls a language model. The user's agent writes every description by following the installed skill; the CLI does the deterministic work: scope, hashing, placement, and validation.

## Goals / Non-Goals

**Goals:**

- One package, one binary (`ctxhead`), runnable with `npx ctxhead`.
- Every agent behaves the same, because each rule is enforced by the CLI, not by instructions.
- Small dependency surface.

**Non-Goals:**

- No VS Code extension, no language-model calls, no API keys.
- No `exports`, `depends`, or `tags` header fields in v1.
- No block-comment-only languages (HTML, CSS, Markdown) in v1.
- No agents beyond the four named in the agent-install spec.

## Decisions

### D1. Stack

TypeScript compiled with `tsc` to ESM in `dist/`; `bin` points to `dist/cli.js` (shebang in source). Node `>=22` (Node 20 is end-of-life; 22 and 24 are LTS). pnpm, Vitest, and Biome, matching the user's other repositories. Argument parsing uses `node:util` `parseArgs`; hashing uses `node:crypto`; git uses `git` through `node:child_process` `execFile` (no shell).

- Runtime dependencies: `@clack/prompts` (multi-select picker) and `ignore` (gitignore-syntax matching for `.ctxignore` and `.gitignore`). Both are needed for correctness; writing a gitignore matcher by hand is error-prone.
- Alternative: `commander` for argument parsing. Rejected: the command set is small and `parseArgs` covers it.
- Alternative: the `vscode-extension-template` scaffold. Rejected: its DI container, VSIX packaging, and the `drop: ['console']` production build do not fit a CLI.

### D2. Module layout

```
src/
  cli.ts                 argument parsing, command dispatch, exit codes
  commands/              one file per command (install, init, add, ..., check)
  agents/registry.ts     one row per agent: id, label, detection paths, per-scope paths, command format
  agents/render.ts       renders the skill, command, and rules block from templates
  templates/             SKILL.md, command body, AGENTS block (the single source)
  repo/                  git root, config (.ctxhead.json), scope (include + ignore + language)
  header/                comment syntax table, parse, placement, validate, hash, write
  staleness/             classify, candidate narrowing, token estimate
```

The adapter differences live only in data (`registry.ts`). Agents do not get their own classes.

### D3. Agent paths

| Agent | Project skill | Project command | Project rules | Global skill | Global command | Global rules |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | `.claude/skills/ctxhead/SKILL.md` | `.claude/commands/ctxhead.md` | `AGENTS.md` + marked `@AGENTS.md` block in `CLAUDE.md` | `~/.claude/skills/ctxhead/SKILL.md` | `~/.claude/commands/ctxhead.md` | `~/.claude/CLAUDE.md` |
| Codex | `.agents/skills/ctxhead/SKILL.md` | none | `AGENTS.md` | `~/.agents/skills/ctxhead/SKILL.md` | none | `~/.codex/AGENTS.md` |
| Gemini CLI | `.gemini/skills/ctxhead/SKILL.md` | `.gemini/commands/ctxhead.toml` | `AGENTS.md` + marked `@AGENTS.md` block in `GEMINI.md` | `~/.gemini/skills/ctxhead/SKILL.md` | `~/.gemini/commands/ctxhead.toml` | `~/.gemini/GEMINI.md` |
| Antigravity | `.agents/skills/ctxhead/SKILL.md` | `.agents/workflows/ctxhead.md` | `AGENTS.md` | `~/.gemini/config/skills/ctxhead/SKILL.md` | none | `~/.gemini/AGENTS.md` |

Sources checked 2026-11-17:

- Codex project and global skills (`$REPO_ROOT/.agents/skills`, `$HOME/.agents/skills`): <https://learn.chatgpt.com/docs/build-skills>. Global rules `~/.codex/AGENTS.md` is Codex's documented global instructions file (not re-fetched).
- Gemini CLI skills (`.gemini/skills/`, `~/.gemini/skills/`, aliases `.agents/skills/`): <https://geminicli.com/docs/cli/skills/>.
- Antigravity skills (`<workspace>/.agents/skills/`, `~/.gemini/config/skills/`): <https://antigravity.google/docs/skills>. Rules (`AGENTS.md` at the workspace root, `~/.gemini/AGENTS.md` globally): <https://antigravity.google/docs/rules>.
- Antigravity workflows: the workspace path `.agents/workflows/<name>.md` is confirmed (<https://antigravity.google/docs/migration/workflows-to-skills/>, which calls workflows "legacy" in favour of skills). The global workflow folder is `~/.gemini/config/global_workflows/` (same page; no source checked mentions `~/.gemini/antigravity/global_workflows/`), but Antigravity's workflows page says "Workflows are deprecated, and a new workflows system is on the way". Antigravity therefore gets no global command; its global skill covers that case, and a command can be added once the replacement system is documented.
- Gemini CLI custom commands (`.gemini/commands/`, `~/.gemini/commands/`, `prompt` required, `description` optional) and `GEMINI.md` `@file.md` imports (relative and absolute paths) are confirmed: <https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md>, <https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/memport.md>. The import is written in the same folder as `AGENTS.md`, so relative resolution is not in question.
- Claude Code: `@AGENTS.md` imports in `CLAUDE.md` are the documented way to share one file (<https://code.claude.com/docs/en/memory>). `.claude/commands/*.md` still works (<https://code.claude.com/docs/en/skills>). The global `~/.claude/commands/` path is only mentioned indirectly in the docs; the skill at `~/.claude/skills/` is the documented personal location.
- Gemini CLI loads `AGENTS.md` through a marked `@AGENTS.md` import in `GEMINI.md` instead of editing `.gemini/settings.json`, because JSON cannot carry an ownership marker.

Codex and Antigravity share `.agents/skills/` at project scope. They install the same skill file, so the second write is a no-op, and uninstall removes it only when neither agent remains selected.

Detection uses agent-specific paths, never a shared folder on its own: `.claude/`, `.codex/` or `.agents/skills/`, `.gemini/`, `.agent/` or `.agents/workflows/`. At global scope the same paths are checked under the home directory.

### D4. Ownership markers

Every file ctxhead writes carries a marker (`ctxhead-managed: v1`, in frontmatter or as a comment, depending on format). Blocks inside shared files use `<!-- ctxhead:start -->` / `<!-- ctxhead:end -->`. `update` and `uninstall` find files by registry path plus marker, so no install manifest is needed. A file at a registry path without the marker is never overwritten or deleted; the CLI reports a conflict.

### D5. Skill content

The AGENTS block holds the read rule: before opening an in-scope file, read up to the closing header `---` and open the body only when the description's "when" clause matches the task. The skill holds the write procedure:

1. Run `ctxhead stale --json`. If the repository is disabled, stop.
2. For each listed file, read it and write a description that says what the file does and when to open it.
3. Run `ctxhead write <file> --description "..."`. On exit code 2, fix the input using the `rule` lines and retry.
4. Run `ctxhead stale` again until nothing is listed.

The command body says "Follow the ctxhead skill" and nothing else.

### D6. Configuration file

`.ctxhead.json` at the repository root: `{ "version": 1, "enabled": false, "include": [], "lastRunSha": null }`. It is committed so teammates share the scope. Writes are atomic: write to a temporary file, then rename.

### D7. Comment syntax table (v1)

Line-comment languages only, keyed by file extension:

- `//`: `.ts .tsx .js .jsx .mjs .cjs .go .rs .java .kt .kts .swift .c .h .cc .cpp .hpp .cs .scala .dart .php`
- `#`: `.py .rb .sh .bash .zsh .pl .r .ex .exs .yaml .yml .toml`
- `--`: `.sql .lua .hs`

Placement exceptions: shebang, Python `# -*- coding` and `# coding:` lines, the JavaScript directive prologue, and `<?php` (the header goes after the opening tag).

### D8. Staleness and token estimate

The body hash follows the file-header spec. Candidates come from `git diff --name-only <lastRunSha>` (which compares against the working tree) plus `git ls-files --others --exclude-standard`, intersected with scope. Reachability uses `git merge-base --is-ancestor <lastRunSha> HEAD`. Token estimate is `ceil(body bytes / 4)` summed over listed files, plus a fixed allowance per file for the description written back; it is labeled as an estimate.

### D9. Command list

`install`, `update`, `uninstall`, `init`, `add`, `remove`, `enable`, `disable`, `status`, `stale`, `write`, `check`, plus `--help` and `--version`. Exit codes: 0 success, 1 failure or `check` found problems, 2 validation rejection from `write`.

Refreshing headers is done in the agent through the installed skill or command, not by a CLI subcommand, because only the agent can write descriptions. `ctxhead status` and `ctxhead stale` cover the user-facing "update" step from onboarding: they show what needs refreshing and the estimated cost.

## Risks / Trade-offs

- [Agent paths change between agent releases] → All paths live in one registry table; detection includes the legacy paths OpenSpec tracks (`.agent`, `.codex/skills`); `ctxhead update` rewrites to current paths.
- [Agents ignore the read-first rule] → Not solvable in the CLI. The rule sits in the always-loaded rules file, and the header is short enough that reading it is cheap. Measure this in dogfooding before v1.0. First dogfood (2026-11-17, `claude -p`, 8 files, 3 questions per arm, rule installed vs uninstalled): the skill wrote all headers through `ctxhead write` and `check` passed; with the rule the agent read only header lines in 2 of 3 questions (a 15-line and a 40-line read) while the control once read a whole 101-line file. This is weak evidence: one run per cell, grep alone answered most questions, and claude-mem leaked memory into one run. No token saving is claimed. Redo with several runs per question, questions that grep cannot answer, and claude-mem disabled before v1.0.
- [Header edits add diff noise] → Headers change only when the body hash changes; v1 has no derived fields that churn.
- [Global install writes into files the user owns (`~/.claude/CLAUDE.md`)] → Only marked blocks are touched, and uninstall removes them cleanly. Every touched path is printed.
- [Committed `lastRunSha` causes merge conflicts in `.ctxhead.json`] → The value is only an optimisation; any reachable or unreachable value gives a correct result, so either side of a conflict is safe.
- [Shared `.agents/skills/` between Codex and Antigravity] → One skill file serves both; uninstall checks whether the other agent is still installed.

## Migration Plan

Greenfield; there is nothing to migrate. Rollback for users is `ctxhead uninstall` at each scope, plus deleting `.ctxignore` and `.ctxhead.json`. Headers left in files are inert comments.

## Open Questions

- Antigravity's global skill, workflow, and rules paths, and whether its project scope reads `AGENTS.md`. This is answered by the verification task and only changes registry data.
- The exact Codex and Gemini CLI global skill folders. Same handling.

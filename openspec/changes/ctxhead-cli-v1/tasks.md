# Tasks

## 1. Scaffold

- [x] 1.1 Create `package.json` (`name: ctxhead`, `type: module`, `bin.ctxhead: dist/cli.js`, `engines.node: >=22`, `files: [dist, README.md, LICENSE]`, `packageManager` pinned pnpm) and verify `pnpm install` succeeds
- [x] 1.2 Add `tsconfig.json` (strict, NodeNext, `outDir: dist`), `biome.json`, `vitest.config.ts`, `.gitignore`, `.editorconfig`, and MIT `LICENSE`; verify `pnpm tsc --noEmit`, `pnpm biome check .`, and `pnpm vitest run --passWithNoTests` all pass
- [x] 1.3 Add `src/cli.ts` with `parseArgs` dispatch, `--help`, `--version`, and the exit-code contract (0/1/2); verify `node dist/cli.js --version` prints the package version after `pnpm build`
- [x] 1.4 Add a test helper that creates a temporary git repository and a temporary `HOME`; verify a smoke test using it passes

## 2. Repository config and scope

- [x] 2.1 Implement git root resolution (`git rev-parse --show-toplevel` via `execFile`) and verify tests for the repo root, a subfolder, and a non-git directory
- [x] 2.2 Implement `.ctxhead.json` read/write with schema check and atomic rename; verify tests for the default shape, invalid JSON, and unknown version
- [x] 2.3 Implement the comment syntax table from design D7 and verify a test that every listed extension maps to its prefix and `.json` maps to unsupported
- [x] 2.4 Implement scope resolution (include list ∩ not `.ctxignore` ∩ not `.gitignore` ∩ supported extension) using `ignore`; verify tests for an included folder, an ignored file inside it, a gitignored file, and an unsupported extension

## 3. Onboarding commands

- [x] 3.1 Implement `ctxhead init` (default `.ctxignore`, default `.ctxhead.json`, kept-if-exists, next-steps output); verify tests for the repo-onboarding "Fresh repository" and "Existing .ctxignore" scenarios
- [x] 3.2 Implement `add` and `remove` with path validation (inside repo, exists, normalised, no duplicates); verify tests for "Add a folder", "Path outside the repository", and "Missing path"
- [x] 3.3 Implement `enable`, `disable`, and the shared "not initialised" guard; verify tests for "Not initialised" and the enabled flag round trip
- [x] 3.4 Document onboarding (`init` → `add` → `enable`) in `README.md` and verify each documented command runs as written against a temporary repository

## 4. Header

- [x] 4.1 Implement header parse (locate after shebang, encoding line, directive prologue, or `<?php`; read fields; detect malformed headers); verify tests for each placement case in every comment prefix
- [x] 4.2 Implement validation for the `name` and `description` limits with rule ids `name-format`, `name-length`, `description-length`, `description-xml`, `description-filler`, and `description-wrap`; verify a test per rule plus the two-rule scenario
- [x] 4.3 Implement the body hash (CRLF→LF, strip leading blank lines, SHA-256) and verify the "Line-ending change" scenario and a known-vector test
- [x] 4.4 Implement folded description wrapping at 100 characters including the comment prefix, and name derivation from the file stem; verify tests for wrapping and "Derived name"
- [x] 4.5 Implement `ctxhead write <file> [--name] --description` (scope check, enabled check, replace-or-insert, body byte-identical, exit 2 on rule failure); verify tests for "TypeScript header", "Python header", "Shebang preserved", "Rewrite", "Write while disabled", and "Unsupported file type"
- [x] 4.6 Document the header format and rule ids in `docs/header-format.md` and verify every example header in it passes `ctxhead check` in a fixture repository

## 5. Staleness

- [x] 5.1 Implement classification (`missing`, `invalid`, `stale`, `fresh`) and verify tests for "Edited body" and "Header-only edit"
- [x] 5.2 Implement candidate narrowing (reachability check, `git diff --name-only <sha>`, untracked files, full-scan fallback); verify tests for "Unreachable lastRunSha" and "Uncommitted edit"
- [x] 5.3 Implement `ctxhead stale [--json]` with the token estimate and the clean-run `lastRunSha` update; verify tests for "JSON for agents" and "All fresh", plus a test that `lastRunSha` does not move when a file is stale
- [x] 5.4 Implement `ctxhead check` (full scan, read-only, exit 1 on problems, exit 0 when disabled) and `ctxhead status`; verify tests for "CI with a stale file", "Header in excluded file", and "Status output"

## 6. Agent install

- [x] 6.1 Verify the paths marked † in design D3 against current Codex, Gemini CLI, and Antigravity documentation, and update the D3 table with the source for each path; deliverable is the updated table with links
- [x] 6.2 Write the templates (`SKILL.md` with the D5 procedure, the command body, the AGENTS block with the read rule) with the `ctxhead-managed: v1` marker; verify a test that the rendered skill has valid Agent Skills frontmatter and the command body only defers to the skill
- [x] 6.3 Implement the agent registry from D3 and detection at both scopes; verify tests for "Interactive pick with detection" (picker preselection checked through an injected prompt) and that a bare `.agents/` folder does not detect Antigravity
- [x] 6.4 Implement the marked-block editor (insert, replace in place, remove, preserve outside bytes) and verify tests for "Existing AGENTS.md" and "Re-running install"
- [x] 6.5 Implement `ctxhead install` (scope flags, `--tools` validation, non-TTY rule, per-agent writes, Claude and Gemini shims, conflict on unmarked files, path summary); verify tests for "Unknown tool name", "Non-interactive without tools", "Project install from a subfolder", "Project install outside a git repository", "Missing or conflicting scope", "Tool-specific install", "Agent without custom commands", "Claude shim", and "Summary output"
- [x] 6.6 Implement `ctxhead update` and `ctxhead uninstall` (marker-based discovery, shared `.agents/skills` handling); verify tests for "Uninstall keeps user content" and "Update after upgrade", using the temporary `HOME` for global scope
- [x] 6.7 Document `install`, `update`, and `uninstall` with the scope table in `README.md` and verify each documented command runs as written against a temporary repository and `HOME`

## 7. Integration and release readiness

- [x] 7.1 Run an end-to-end test on a fixture repository: `install --project --tools claude` → `init` → `add src` → `enable` → `stale --json` → `write` for each listed file → `check` exits 0; verify it passes in CI
- [x] 7.2 Update `CLAUDE.md` and `README.md` to describe an npm CLI with no VS Code extension, and verify neither file mentions a VS Code extension
- [x] 7.3 Run `pnpm pack` and verify the tarball contains only `dist/`, `README.md`, `LICENSE`, and `package.json`, and that `npx ./ctxhead-<version>.tgz --help` runs

## Workflow follow-up

- Rename the Linear project "VS Code: CtxHead" and consider renaming the repository, since there is no VS Code extension.
- Archive the change after review.

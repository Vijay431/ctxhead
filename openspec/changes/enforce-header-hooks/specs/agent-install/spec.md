# Spec Delta

## ADDED Requirements

### Requirement: Enforcement hooks
By default, `ctxhead install` SHALL register `ctxhead guard` hooks in each selected agent's hook config for the chosen scope: a read hook on its file-read and shell tools, and a finish hook on its end-of-turn event. `--no-enforce` SHALL skip them. Entries whose command starts with `ctxhead guard` are ctxhead-owned. Install SHALL replace owned entries in place and preserve all other content.

#### Scenario: Default install adds hooks
- **WHEN** the user runs `ctxhead install --project --tools claude`
- **THEN** `.claude/settings.json` contains a ctxhead read hook and a ctxhead finish hook, and the summary lists that file

#### Scenario: Opt out
- **WHEN** the user runs `ctxhead install --project --tools claude --no-enforce`
- **THEN** no hook config file is created or changed

#### Scenario: Existing user hooks kept
- **WHEN** `.claude/settings.json` already has a user `PreToolUse` hook and a `permissions` key, and the user runs a project install
- **THEN** the user hook and `permissions` key are unchanged, and the ctxhead hooks are added once

### Requirement: Invalid hook config
If an existing hook config file is not valid JSON, install SHALL exit non-zero, name the file, and write no files.

#### Scenario: Invalid hook config
- **WHEN** `.gemini/settings.json` contains invalid JSON and the user runs `ctxhead install --project --tools gemini`
- **THEN** the CLI exits non-zero, names `.gemini/settings.json`, and writes no files

### Requirement: Hook update and uninstall
`ctxhead update` SHALL regenerate ctxhead-owned hook entries wherever they exist at the chosen scope. `ctxhead uninstall` SHALL remove ctxhead-owned hook entries, drop any event or matcher group left empty, and delete a hook config file only when nothing remains in it.

#### Scenario: Uninstall keeps user hooks
- **WHEN** `.claude/settings.json` has a user hook and ctxhead hooks, and the user runs `ctxhead uninstall --project`
- **THEN** only the ctxhead hooks are removed, and the user hook remains

#### Scenario: Uninstall empties the file
- **WHEN** `.agents/hooks.json` contains only ctxhead hooks and the user runs `ctxhead uninstall --project`
- **THEN** `.agents/hooks.json` is deleted

### Requirement: Hook prerequisites notice
When install writes hooks, it SHALL warn if `ctxhead` is not found on `PATH`, because the hooks call it by name. When it writes Codex project hooks, it SHALL tell the user to trust them with `/hooks` in Codex.

#### Scenario: Codex trust notice
- **WHEN** the user runs `ctxhead install --project --tools codex`
- **THEN** the output tells the user to review and trust the new hooks with `/hooks` in Codex

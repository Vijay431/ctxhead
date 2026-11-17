# Spec Delta

## Purpose

Installs, updates, and removes the ctxhead skill, command, and rules block in each AI coding agent the user selects, at user (global) or repository (project) scope.

## ADDED Requirements

### Requirement: Supported agents
The CLI SHALL support Claude Code (`claude`), Codex (`codex`), Gemini CLI (`gemini`), and Antigravity (`antigravity`) as install targets. Any other value passed to `--tools` SHALL be rejected before any file is written.

#### Scenario: Unknown tool name
- **WHEN** the user runs `ctxhead install --project --tools claude,cursor`
- **THEN** the CLI exits non-zero, names `cursor` as unsupported, lists the supported names, and writes no files

### Requirement: Agent detection
`ctxhead install` SHALL detect which supported agents are present at the chosen scope and SHALL mark them as preselected in the interactive picker.

#### Scenario: Interactive pick with detection
- **WHEN** the user runs `ctxhead install --project` in a repository that contains `.claude/` and nothing for other agents, without `--tools`
- **THEN** the CLI shows a multi-select of all supported agents with Claude Code preselected and installs only the agents the user confirms

#### Scenario: Non-interactive without tools
- **WHEN** `ctxhead install` runs without `--tools` and stdin is not a TTY
- **THEN** the CLI exits non-zero and states that `--tools` is required in non-interactive mode

### Requirement: Install scope
`ctxhead install` SHALL require exactly one of `--global` or `--project`. `--global` SHALL write only under the user's home directory. `--project` SHALL write only under the git repository root, resolved from the current directory.

#### Scenario: Project install from a subfolder
- **WHEN** the user runs `ctxhead install --project --tools claude` from `<repo>/src/lib`
- **THEN** the files are written under `<repo>/`, not under `<repo>/src/lib/`

#### Scenario: Project install outside a git repository
- **WHEN** the user runs `ctxhead install --project` in a directory that is not inside a git repository
- **THEN** the CLI exits non-zero and writes no files

#### Scenario: Missing or conflicting scope
- **WHEN** the user runs `ctxhead install` with neither scope flag, or with both
- **THEN** the CLI exits non-zero and explains that exactly one of `--global` or `--project` is required

### Requirement: Installed artifacts per agent
For each selected agent, install SHALL write one ctxhead skill, plus one ctxhead command when the agent supports custom commands, in that agent's native location and format for the chosen scope. Prompt files SHALL NOT be installed. Agents that were not selected SHALL NOT receive any file.

#### Scenario: Tool-specific install
- **WHEN** the user runs `ctxhead install --project --tools gemini`
- **THEN** only Gemini CLI skill and command files are written, and no Claude Code, Codex, or Antigravity files are created

#### Scenario: Agent without custom commands
- **WHEN** the user runs `ctxhead install --project --tools codex`
- **THEN** only the Codex skill is written, and no prompt or command file is created

### Requirement: Single source for skill and command
The installed command SHALL delegate to the installed skill and SHALL NOT restate the skill's procedure, so both always behave the same.

#### Scenario: Command defers to skill
- **WHEN** the installed Claude Code command file is read
- **THEN** its body instructs the agent to follow the ctxhead skill and contains no separate copy of the refresh procedure

### Requirement: Rules block
Project install SHALL insert a ctxhead block into `<repo>/AGENTS.md`, delimited by `<!-- ctxhead:start -->` and `<!-- ctxhead:end -->`. Global install SHALL insert the same block into each selected agent's global rules file. Content outside the markers SHALL be preserved byte for byte.

#### Scenario: Existing AGENTS.md
- **WHEN** `<repo>/AGENTS.md` already has user content and the user runs a project install
- **THEN** the ctxhead block is appended once, and the existing content is unchanged

#### Scenario: Re-running install
- **WHEN** install runs again at the same scope
- **THEN** the existing ctxhead block is replaced in place, and no second block is added

### Requirement: Rules-file shims
When a project install selects Claude Code, the CLI SHALL ensure `<repo>/CLAUDE.md` imports `AGENTS.md`. When it selects Gemini CLI, the CLI SHALL ensure Gemini CLI loads `AGENTS.md`. Existing user content in those files SHALL be preserved.

#### Scenario: Claude shim
- **WHEN** a project install selects Claude Code and `<repo>/CLAUDE.md` does not import `AGENTS.md`
- **THEN** a marked line `@AGENTS.md` is added to `<repo>/CLAUDE.md`

### Requirement: Update and uninstall
`ctxhead update` SHALL regenerate every ctxhead-owned file and block found at the chosen scope from the current package version. `ctxhead uninstall` SHALL remove only ctxhead-owned files and ctxhead marked blocks, and SHALL leave all other content untouched.

#### Scenario: Uninstall keeps user content
- **WHEN** the user runs `ctxhead uninstall --project` in a repository whose `AGENTS.md` has user content and a ctxhead block
- **THEN** the ctxhead block, skill, command, and shim lines are removed, and the user content in `AGENTS.md` remains

#### Scenario: Update after upgrade
- **WHEN** the package is upgraded and the user runs `ctxhead update --global`
- **THEN** every installed ctxhead skill, command, and block at global scope matches the new version's content

### Requirement: Install summary
Install, update, and uninstall SHALL print every file path they created, changed, or removed.

#### Scenario: Summary output
- **WHEN** a project install for Claude Code completes
- **THEN** the output lists each written path relative to the repository root

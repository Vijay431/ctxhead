# repo-onboarding Specification

## Purpose

Sets up a repository for ctxhead: which files are excluded, which paths get headers, and whether agents may write headers in it.

## Requirements

### Requirement: Init creates .ctxignore first
`ctxhead init` SHALL create `.ctxignore` at the git repository root with default exclusions, SHALL create `.ctxhead.json` with an empty include list and `enabled: false`, and SHALL print the next onboarding steps (`add`, then `enable`).

#### Scenario: Fresh repository
- **WHEN** the user runs `ctxhead init` in a git repository with neither file
- **THEN** `.ctxignore` and `.ctxhead.json` are created at the repository root, and the output names `ctxhead add <path>` and `ctxhead enable` as the next steps

#### Scenario: Existing .ctxignore
- **WHEN** `.ctxignore` already exists
- **THEN** init leaves it unchanged and reports that it was kept

### Requirement: Default exclusions
The default `.ctxignore` SHALL exclude dependency folders, build output, generated and minified files, and lockfiles. Files matched by the repository's `.gitignore` SHALL be out of scope as well; ctxhead reads `.gitignore` when it resolves scope, so the patterns are not copied into `.ctxignore`.

#### Scenario: Gitignored file
- **WHEN** `dist/app.js` matches `.gitignore`
- **THEN** it is out of scope even if `dist/` is added to the include list

### Requirement: Commands require onboarding
`add`, `remove`, `enable`, `disable`, `stale`, `write`, and `check` SHALL exit non-zero with a message naming `ctxhead init` when `.ctxhead.json` is missing at the repository root.

#### Scenario: Not initialised
- **WHEN** the user runs `ctxhead add src` in a repository without `.ctxhead.json`
- **THEN** the CLI exits non-zero and tells the user to run `ctxhead init`

### Requirement: Include list
`ctxhead add <path...>` SHALL add each path (file or folder, relative to the repository root) to the include list in `.ctxhead.json`. `ctxhead remove <path...>` SHALL remove them. A file is in scope only if it is inside an included path, is not matched by `.ctxignore`, and has a supported comment syntax.

#### Scenario: Add a folder
- **WHEN** the user runs `ctxhead add src/auth`
- **THEN** `.ctxhead.json` lists `src/auth`, and supported files under it become in scope

#### Scenario: Path outside the repository
- **WHEN** the user runs `ctxhead add ../other`
- **THEN** the CLI exits non-zero and does not change `.ctxhead.json`

#### Scenario: Missing path
- **WHEN** the user runs `ctxhead add src/nope` and that path does not exist
- **THEN** the CLI exits non-zero and does not change `.ctxhead.json`

### Requirement: Enable and disable
`ctxhead enable` and `ctxhead disable` SHALL set `enabled` in `.ctxhead.json`. When disabled, `ctxhead write` SHALL refuse to change files, and `ctxhead stale` SHALL report that the repository is disabled instead of listing files.

#### Scenario: Write while disabled
- **WHEN** the repository is disabled and an agent runs `ctxhead write src/a.ts ...`
- **THEN** the CLI exits non-zero, states that ctxhead is disabled in this repository, and leaves the file unchanged

### Requirement: Status
`ctxhead status` SHALL print whether the repository is enabled, the include list, the number of in-scope files, and how many are missing, stale, or invalid.

#### Scenario: Status output
- **WHEN** the user runs `ctxhead status` in an enabled repository with 10 in-scope files, 3 of them stale
- **THEN** the output shows `enabled`, the include list, 10 in-scope files, and 3 stale

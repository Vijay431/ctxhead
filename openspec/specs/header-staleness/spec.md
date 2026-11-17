# header-staleness Specification

## Purpose

Determines which in-scope files have a missing, invalid, or out-of-date header, so agents know what to refresh and CI can block drift.

## Requirements

### Requirement: File states
Each in-scope file SHALL be classified as exactly one of: `missing` (no header), `invalid` (a header that breaks the format or limits), `stale` (stored hash differs from the current body hash), or `fresh`.

#### Scenario: Edited body
- **WHEN** a file with a fresh header has a line of its body changed
- **THEN** the file is classified `stale`

#### Scenario: Header-only edit
- **WHEN** only the header's description text is changed by hand
- **THEN** the file stays `fresh`, because the body hash is unchanged

### Requirement: Candidate narrowing
When `.ctxhead.json` holds a `lastRunSha` that is reachable from `HEAD`, `ctxhead stale` SHALL check only files changed between `lastRunSha` and the working tree, plus in-scope files with no header. Otherwise it SHALL check every in-scope file.

#### Scenario: Unreachable lastRunSha
- **WHEN** `lastRunSha` no longer exists after a history rewrite
- **THEN** `ctxhead stale` checks every in-scope file and gives the same result as a first run

#### Scenario: Uncommitted edit
- **WHEN** a fresh file is edited and not yet committed
- **THEN** `ctxhead stale` reports it as `stale`

### Requirement: Stale output
`ctxhead stale` SHALL list every non-fresh file with its state and SHALL print an estimate of the files and tokens an agent would read to refresh them. `--json` SHALL print the same data as JSON for agent use.

#### Scenario: JSON for agents
- **WHEN** an agent runs `ctxhead stale --json`
- **THEN** the output is one JSON object listing each file path, its state, and the total estimated tokens

### Requirement: Recording a clean run
When `ctxhead stale` finds no non-fresh files, it SHALL set `lastRunSha` in `.ctxhead.json` to the current `HEAD` commit. It SHALL NOT change `lastRunSha` when any file is non-fresh.

#### Scenario: All fresh
- **WHEN** every in-scope file is fresh and the user runs `ctxhead stale`
- **THEN** `lastRunSha` equals the current `HEAD` commit

### Requirement: Check gate
`ctxhead check` SHALL check every in-scope file, SHALL NOT modify any file, and SHALL exit 1 when any file is `missing`, `invalid`, or `stale`, and 0 otherwise. It SHALL exit 0 without checking when the repository is disabled.

#### Scenario: CI with a stale file
- **WHEN** CI runs `ctxhead check` and one in-scope file is stale
- **THEN** the exit code is 1 and the output names the file

### Requirement: Read-only headers outside scope
Classification and `check` SHALL ignore files outside the include list, even when those files contain a ctxhead header.

#### Scenario: Header in excluded file
- **WHEN** a file under an ignored path has a stale header
- **THEN** `ctxhead check` does not report it

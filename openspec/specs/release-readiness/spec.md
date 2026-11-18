# release-readiness Specification

## Purpose

Defines what the public ctxhead repository and npm package must contain before launch: registry
metadata, changelog, brand and demo assets, and a runtime-only package tarball.

## Requirements

### Requirement: Registry metadata
`package.json` SHALL declare `repository`, `homepage`, `bugs`, `author` and `keywords`, so the npm page links back to the GitHub repository and issue tracker.

#### Scenario: npm page links to source
- **WHEN** `package.json` is read
- **THEN** `repository.url`, `homepage` and `bugs.url` point at the GitHub repository, and `keywords` is a non-empty list

### Requirement: Changelog
The repository SHALL keep a `CHANGELOG.md` in Keep a Changelog format with an entry for every published version, starting with 0.1.0.

#### Scenario: First release entry exists
- **WHEN** a reader opens `CHANGELOG.md`
- **THEN** it has a `0.1.0` section summarizing the v1 CLI and the Apache-2.0 license, and features released later appear only under their own version sections

### Requirement: Brand assets
The repository SHALL include under `assets/` a logo as SVG and PNG, a 1280x640 PNG social preview, and a README banner. The README SHALL show the banner at the top.

#### Scenario: Social preview has GitHub dimensions
- **WHEN** the social preview PNG is inspected
- **THEN** it is exactly 1280x640 pixels

#### Scenario: README renders banner
- **WHEN** the README is viewed on GitHub
- **THEN** the banner image loads from a relative `assets/` path

### Requirement: Terminal demo
The repository SHALL include a terminal demo in `assets/`, shown in the README, built from real ctxhead output for `init`, `add`, `enable`, `write` and `check`. Every command and output line in the demo SHALL match what the current CLI prints.

#### Scenario: Demo matches real output
- **WHEN** the commands in the demo run against a fresh temporary git repository
- **THEN** the CLI prints the same lines the demo shows

### Requirement: Runtime-only package
The npm tarball SHALL contain only `dist/`, `README.md`, `LICENSE`, `NOTICE` and `package.json`. It SHALL NOT contain `assets/`, `src/`, `test/`, `openspec/`, `.claude/` or `.github/`.

#### Scenario: Pack excludes repo-only files
- **WHEN** `pnpm pack` runs and its file list is read
- **THEN** no path under `assets/`, `src/`, `test/`, `openspec/`, `.claude/` or `.github/` appears

#### Scenario: CI catches a tarball regression
- **WHEN** a change adds a repo-only path to the package `files` list
- **THEN** the test suite fails in CI

### Requirement: No secrets in public history
Before the first push, tracked files and full git history SHALL contain no credentials, tokens or private keys.

#### Scenario: Secret scan is clean
- **WHEN** a secret scan runs over all tracked files and every commit
- **THEN** it reports no findings, or each finding is shown to be a false positive

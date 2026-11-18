# project-governance Specification

## Purpose

Defines the terms for using, distributing and contributing to ctxhead: its open-source license,
reserved project name, contribution sign-off, CI quality gate and security-report channel.

## Requirements

### Requirement: Apache-2.0 license
The repository and the npm package SHALL be licensed under Apache-2.0. The repo root SHALL hold the unmodified Apache-2.0 text in `LICENSE` and a `NOTICE` that names ctxhead and its copyright holder. The package metadata SHALL declare the SPDX id `Apache-2.0`.

#### Scenario: Package metadata declares the license
- **WHEN** a user runs `npm view ctxhead license` or reads `package.json`
- **THEN** the license is `Apache-2.0`

#### Scenario: Tarball carries license and notice
- **WHEN** the package is packed with `pnpm pack`
- **THEN** the tarball contains `LICENSE` with the Apache-2.0 text and `NOTICE`

### Requirement: Reserved project name
The repository SHALL publish a trademark policy in `TRADEMARKS.md`, linked from the README License section. The policy SHALL reserve the name "ctxhead" for the maintainer and SHALL require a distributed modified version to use a different name. It SHALL allow factual references such as "compatible with ctxhead" or "based on ctxhead".

#### Scenario: Fork rename rule is stated
- **WHEN** a reader opens `TRADEMARKS.md`
- **THEN** it states that modified distributions must not use the name "ctxhead" and lists the allowed factual references

#### Scenario: README points to license and policy
- **WHEN** a reader opens the README License section
- **THEN** it names Apache-2.0, links `LICENSE` and `TRADEMARKS.md`, and states that files ctxhead generates in a user's repository belong to that user

### Requirement: DCO sign-off on contributions
Every commit in a pull request SHALL carry a `Signed-off-by:` trailer certifying the Developer Certificate of Origin 1.1. CI SHALL fail the pull request when any of its non-merge commits lacks one. `CONTRIBUTING.md` SHALL explain the rule and how to fix an unsigned commit.

#### Scenario: Unsigned commit fails the check
- **WHEN** a pull request contains a non-merge commit without a `Signed-off-by:` trailer
- **THEN** the DCO check fails and names the offending commit

#### Scenario: Signed commits pass
- **WHEN** every non-merge commit in a pull request carries a `Signed-off-by:` trailer
- **THEN** the DCO check passes

### Requirement: CI quality gate
CI SHALL run lint, typecheck and the test suite on Node 22 for every pull request and every push to `main`. A failing step SHALL fail the run.

#### Scenario: Failing test blocks the run
- **WHEN** a pull request makes any test fail
- **THEN** the CI run reports failure

### Requirement: Contributor community files
The repository SHALL include `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), bug and feature issue forms, and a pull request template with a DCO sign-off checkbox.

#### Scenario: New issue offers forms
- **WHEN** a user opens a new issue on GitHub
- **THEN** a bug report form and a feature request form are offered

#### Scenario: Contributing guide covers dev loop
- **WHEN** a contributor reads `CONTRIBUTING.md`
- **THEN** it lists `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and the `git commit -s` rule

### Requirement: Private vulnerability reporting
`SECURITY.md` SHALL tell reporters to send vulnerabilities privately through GitHub Security Advisories, not public issues. It SHALL state which versions receive fixes.

#### Scenario: Reporter finds private channel
- **WHEN** a reporter opens `SECURITY.md`
- **THEN** it directs them to the repository's private security advisory form and says not to file a public issue

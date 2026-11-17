# file-header Specification

## Purpose

Defines the ctxhead header that sits at the top of a source file, where it goes, the limits its fields must meet, and how `ctxhead write` stamps it.

## Requirements

### Requirement: Header format
A header SHALL be a block of line comments in the file's comment syntax. Its lines SHALL be, in order: `---`, a `name:` field, a `description:` field (single line or a folded `>-` block), a `ctxhead: v1 sha256:<64 hex>` line, and `---`. No other fields are allowed in v1.

#### Scenario: TypeScript header
- **WHEN** `ctxhead write src/auth.ts --name auth-middleware --description "Verifies JWTs. Open when changing auth."` succeeds
- **THEN** the file starts with `// ---`, `// name: auth-middleware`, a `// description:` field, `// ctxhead: v1 sha256:<hash>`, and `// ---`

#### Scenario: Python header
- **WHEN** a header is written to a `.py` file
- **THEN** every header line starts with `# `

### Requirement: Name limits
`name` SHALL be 1-64 characters of lowercase `a-z`, `0-9`, and `-`, SHALL NOT start or end with `-`, and SHALL NOT contain `--`. When `--name` is omitted, `ctxhead write` SHALL derive it from the file name stem in kebab-case.

#### Scenario: Invalid name
- **WHEN** an agent runs `ctxhead write src/a.ts --name Auth_Middleware --description "..."`
- **THEN** the CLI exits non-zero with rule `name-format` and leaves the file unchanged

#### Scenario: Derived name
- **WHEN** an agent runs `ctxhead write src/UserService.ts --description "..."` without `--name`
- **THEN** the header's `name` is `user-service`

### Requirement: Description limits
`description` SHALL be 1-1024 characters after joining folded lines, SHALL NOT contain XML or HTML tags, and SHALL NOT start with filler such as "This file". Folded lines SHALL wrap at 100 characters or fewer, including the comment prefix.

#### Scenario: Too long
- **WHEN** the description is 1025 characters
- **THEN** the CLI exits non-zero with rule `description-length` and leaves the file unchanged

#### Scenario: XML tag
- **WHEN** the description contains `<summary>`
- **THEN** the CLI exits non-zero with rule `description-xml`

### Requirement: Rule-named rejections
Every validation failure SHALL exit with code 2 and print one line per broken rule in the form `rule <rule-id>: <explanation>`, so an agent can fix the input and retry.

#### Scenario: Two broken rules
- **WHEN** both the name and the description are invalid
- **THEN** the output has two `rule` lines and the exit code is 2

### Requirement: Placement
The header SHALL be placed after any leading shebang line, Python encoding declaration, and JavaScript directive prologue (`"use strict"`, `"use client"`, `"use server"`), and before everything else.

#### Scenario: Shebang preserved
- **WHEN** a header is written to a script whose first line is `#!/usr/bin/env node`
- **THEN** the shebang stays on line 1 and the header starts on line 2

### Requirement: Body hash
The `ctxhead` line SHALL hold the SHA-256 of the file body, meaning everything after the header, with CRLF normalised to LF and no leading blank lines. Agents SHALL NOT supply the hash; `ctxhead write` computes it.

#### Scenario: Line-ending change
- **WHEN** a file's line endings change from LF to CRLF and nothing else changes
- **THEN** its body hash is unchanged

### Requirement: Write replaces, never duplicates
`ctxhead write` SHALL replace an existing ctxhead header in place, SHALL add one when none exists, and SHALL leave the body byte-identical except for one blank line separating it from the header.

#### Scenario: Rewrite
- **WHEN** `ctxhead write` runs twice on the same file with different descriptions
- **THEN** the file has exactly one header, holding the second description

### Requirement: Scope check on write
`ctxhead write` SHALL refuse files that are not in scope (not included, ignored, or with an unsupported comment syntax) and SHALL name the reason.

#### Scenario: Unsupported file type
- **WHEN** an agent runs `ctxhead write config/app.json --description "..."`
- **THEN** the CLI exits non-zero with reason `unsupported-language` and leaves the file unchanged

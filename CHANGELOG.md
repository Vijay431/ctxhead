# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-17

### Added

- Initial release of the `ctxhead` CLI for Node 22+, with git required at runtime.
- Onboarding commands: `ctxhead init`, `add`, `remove`, `enable`, `disable`, and `status`.
  `init` creates `.ctxignore` and `.ctxhead.json`; `add` and `remove` manage the include list.
- Agent commands: `ctxhead stale [--json]`, `ctxhead write <file> [--name <n>] --description <text>`,
  and `ctxhead check` for CI. `stale` records a repository-level `lastRunSha` when nothing is listed.
- Body-hash staleness detection per file, so headers are flagged when their source changes.
- Install, update, and uninstall commands (`--global` or `--project`, `--tools`) that write a
  skill, a command, and a rules block for Claude Code, Codex, Gemini CLI, and Antigravity.
- Ownership safety: every installed file carries a `ctxhead-managed` marker, unmarked files are
  never overwritten or deleted, and shared files are edited only between
  `<!-- ctxhead:start -->` and `<!-- ctxhead:end -->` markers.
- Apache License, Version 2.0, with `NOTICE` and trademark policy for the "ctxhead" name.

[Unreleased]: https://github.com/Vijay431/vscode-ctxhead/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Vijay431/vscode-ctxhead/releases/tag/v0.1.0

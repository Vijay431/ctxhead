# Design

## Context

The repo is private-local: `origin` has no branches, and the name `ctxhead` returns 404 on npm.
`LICENSE` and `package.json` say MIT, and the README License section says "MIT". `package.json`
`files` ships `dist`, `README.md` and `LICENSE`. Biome lints everything except `dist`,
`node_modules`, `openspec`, `.claude` and the lockfile, so new Markdown and YAML files are not
linted. `test/docs.test.ts` already runs doc examples through the in-process CLI
(`test/helpers/env.ts`). The demo test reuses that pattern.

These tools are installed: `agy` (Antigravity CLI, print mode `-p`, `--mode accept-edits`) and
`playwright-cli` (`open`, `resize`, `screenshot`). `vhs`, `asciinema`, `rsvg-convert`,
`inkscape` and ImageMagick are not installed.

## Goals / Non-Goals

**Goals:**
- Use Apache-2.0 with a reserved name, enforce DCO, and add a CI gate before the first push.
- Create assets with `agy` that are reviewable text, can be rebuilt, and are checked against the
  real CLI.

**Non-Goals:**
- Per-file Apache license headers. ctxhead's own frontmatter header sits at the top of each
  source file, and Apache does not require per-file headers.
- Registering a trademark, publishing to npm, pushing to GitHub, or renaming the repo or the
  Linear project.
- A release automation workflow (changesets, semantic-release).

## Decisions

### D1. Apache-2.0 with `TRADEMARKS.md`, not MIT or a source-available license
Apache-2.0 §6 already withholds trademark rights, and §4(b) makes modified files carry change
notices. `TRADEMARKS.md` builds on §6 to reserve the name. The result stays OSI open source.
- Alternatives: MIT with a trademark policy works, but MIT has no trademark clause and no
  change-notice duty. PolyForm Strict and custom no-modify licenses lose the "open source" label
  and block contributions. CC BY-ND is not meant for software.

### D2. DCO, not CLA
The maintainer has no plan to relicense, and DCO adds the least friction. The trade-off: a
future relicense would need consent from every contributor.

### D3. DCO check as an in-repo workflow job
`.github/workflows/dco.yml` runs on `pull_request`. It checks out with `fetch-depth: 0`, lists
`git log --no-merges --format='%H%x09%(trailers:key=Signed-off-by,valueonly)'
base.sha..head.sha`, and fails with the SHA of any commit whose trailer value is empty.
- Alternative: the hosted DCO GitHub App. It needs a third-party app install, and its logic is
  invisible in the repo. Choose the workflow so the rule can be read and tested locally with the
  same `git log` command.

### D4. CI workflow
`.github/workflows/ci.yml` runs on `push: main` and `pull_request`. Its steps are
`actions/checkout`, `pnpm/action-setup` (version taken from `packageManager`), and
`actions/setup-node` with `node-version: 22` and `cache: pnpm`. It then runs
`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build` and `pnpm test`.
`build` runs as well because `prepack` depends on it. Actions are pinned to major tags. A single
Node version matches `engines: >=22`.

### D5. Brand assets: `agy` writes SVG source, `playwright-cli` renders PNG
`agy -p "<brief>" --mode accept-edits` runs from the repo root and writes `assets/logo.svg`,
`assets/banner.svg` and `assets/social-preview.svg`. Each brief gives the exact viewBox (logo
512x512, banner 1280x320, social 1280x640), names the palette, and allows only system font
stacks with no external fonts or images, so the SVGs are self-contained. For PNG, open each SVG
with `playwright-cli open file://...`, `resize` it to the target size, and `screenshot` it to
`assets/*.png`. Check the dimensions with `file`. The README references the SVG files, since
GitHub renders them crisply. Only `logo.png` and `social-preview.png` need PNG: avatars and the
GitHub social card do not accept SVG.
- Alternative: raster generation by an image model. It cannot be diffed, and text inside it
  (the word "ctxhead") is often misspelled. Vector source can be reviewed and edited.

### D6. Terminal demo: real transcript, then animated SVG
`assets/demo.txt` is the source of truth. It contains `$ ctxhead ...` lines, each followed by
that command's exact output, for `init`, `add src`, `enable`, `write` and `check` against a small
sample file. `agy` turns `demo.txt` into `assets/demo.svg`, a terminal-styled SVG where lines
appear in sequence through CSS keyframes. GitHub renders that animation in a README `<img>`.

`test/demo.test.ts` follows the `docs.test.ts` pattern. It replays each `$ ctxhead` line in a
`createEnv()` repo with the same sample file, and asserts that the output equals the transcript.
It also asserts that every transcript line appears as text in `demo.svg`, so the SVG cannot
drift from the transcript. SVG text is XML-escaped and may be split across `<tspan>`s, so the
test joins each `<text>` element's text content and decodes entities before comparing.
- Alternatives: `vhs` or `asciinema` + `agg` give real recordings, but they add a Go or Python
  toolchain that is not installed, and they output a binary GIF the test cannot check.

### D7. Keep `.claude/` and `openspec/` in the public repo
They are the project's planning record and contributor tooling, and they contain nothing
private. `CONTRIBUTING.md` explains them in one line. They are already outside `files`, so the
tarball excludes them.

### D8. Package metadata
`repository: {type: git, url: git+https://github.com/Vijay431/ctxhead.git}`, plus
`homepage` (README anchor) and `bugs` (issues URL) on the same repo. `author` is
`Vijay Gangatharan <vijaygangatharan.official@gmail.com>`, the public project email. `keywords`: ai, agents, claude, codex, gemini, context, cli,
frontmatter. `files` gains `NOTICE`.

## Risks / Trade-offs

- [The demo transcript holds output that changes per run, such as temp paths or hashes] →
  Choose commands whose output is stable. Wherever a value changes per run, the test
  normalizes that one field the same way in both the transcript and the CLI output, and the
  transcript shows the normalized form.
- [`agy` output differs between runs or misses the brief] → Commit the SVGs. The maintainer
  reviews them before merge. Regenerate only on request, not in CI.
- [Commit history exposes the author's personal email once pushed] → Decided: before the first
  push, rewrite every commit's author and committer email to
  `vijaygangatharan.official@gmail.com` with `git rebase --root --signoff`, and set that address
  as the repo's `user.email`. The sign-off makes `main` DCO-clean from the start. The rewrite
  changes every hash, so it is only safe while `origin` has no branches. It runs after every
  commit made before the first push, including any `enforce-header-hooks` commits.
- [Release scope] → 0.1.0 is the v1 CLI plus Apache-2.0. `enforce-header-hooks` ships in a later
  version with its own CHANGELOG entry, so this change does not wait on it.
- [Runtime-only tarball regresses] → `test/pack.test.ts` checks the `pnpm pack --dry-run` file
  list in CI.
- [Code of Conduct needs an enforcement contact] → Resolved: `vijaygangatharan.official@gmail.com`,
  the maintainer's public project email.
- [Relicensing from MIT] → No copy was ever distributed, so no MIT grant has to be honored.

## Migration Plan

All changes are file additions plus edits to `LICENSE`, `package.json` and `README.md`. To roll
back before the push, revert the commit. After the push, the license change cannot be reverted
for copies already taken.

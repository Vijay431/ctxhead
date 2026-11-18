# Proposal

## Why

ctxhead is about to go public on GitHub and npm. It ships under MIT, so anyone may fork it and
republish it under the name "ctxhead". The maintainer wants it to stay real open source and keep
the name. The repo also lacks the files contributors expect: how to contribute, conduct, security
reporting and CI. Nothing is pushed or published yet, so the license can change now without
older MIT copies in circulation.

## What Changes

- **BREAKING (license)**: Relicense from MIT to Apache-2.0. Replace `LICENSE`, add a `NOTICE`,
  set `package.json` `"license": "Apache-2.0"` and ship `NOTICE` in the npm tarball.
- Add `TRADEMARKS.md`. It reserves the name "ctxhead" for the maintainer: a modified fork must
  use another name. Plain references such as "compatible with ctxhead" and "based on ctxhead"
  stay allowed.
- Update the README License section to cover Apache-2.0, the trademark policy, and the fact that
  files ctxhead generates in a user's repo belong to that user.
- Add `CONTRIBUTING.md`: dev setup (`pnpm build` / `typecheck` / `lint` / `test`), the PR flow,
  and the Developer Certificate of Origin (DCO) sign-off rule (`git commit -s`).
- Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) and `SECURITY.md` (private reporting
  through GitHub Security Advisories).
- Add `.github/`: bug and feature issue forms, a PR template with a DCO checkbox, a CI workflow
  that runs lint, typecheck and test on Node 22 with pnpm, and a DCO check that fails a PR when
  any of its commits lacks a `Signed-off-by` line.
- Add launch assets under `assets/`, created with the Antigravity CLI (`agy`): a logo or icon,
  a 1280x640 GitHub social preview, a README banner, and a terminal demo built from real
  `ctxhead` output. Show the banner and the demo in the README.
- Release-readiness pass: fill in `package.json` metadata (`repository`, `homepage`, `bugs`,
  `author`, `keywords`), add `CHANGELOG.md` with an entry for 0.1.0 (v1 CLI only; hook enforcement ships
  later), and settle whether the
  tracked `.claude/` OpenSpec tooling stays in the public repo. Confirm that the tracked files and
  git history hold no secrets.

## Capabilities

### New Capabilities

- `project-governance`: the terms people use, distribute and contribute to ctxhead under. This
  covers the license and notice shipped with the package, the trademark policy, the DCO rule
  that CI enforces, the CI quality gate, and the security-report channel.
- `release-readiness`: what the public repo and npm package must contain before launch. This
  covers registry metadata, the changelog, the brand and demo assets with their README
  references, and the rule that the npm tarball ships only runtime files.

### Modified Capabilities

None. CLI behavior does not change.

## Impact

- Files: `LICENSE` (replaced), `package.json` (`license`, `files`), `README.md` (License
  section). New: `NOTICE`, `TRADEMARKS.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`,
  `SECURITY.md`, `CHANGELOG.md`, `.github/**`, `assets/**`.
- No source, dependency or CLI change. The npm tarball gains `NOTICE`. `assets/` stays in the
  repo and is not shipped in the npm package.
- Tools: `agy` creates the assets and `playwright-cli` turns SVG into PNG. Both are already
  installed, and neither becomes a project dependency.
- Git history: commits carry the author's personal email. Before the first push, every existing
  commit is rewritten to the public project email `vijaygangatharan.official@gmail.com` and
  signed off (design Risks, task 4.4), so `main` is DCO-clean from the start. The rewrite runs
  last, after any `enforce-header-hooks` commits, while `origin` still has no branches.
- Contributors must sign off every commit. The DCO check runs on PR commits.
- Repository name: the GitHub repository is `Vijay431/ctxhead`, not `vscode-ctxhead`, because
  ctxhead is not a VS Code extension. All repository URLs and the `origin` remote use that name.
- Out of scope: renaming the Linear project, registering the trademark, and publishing to npm.

# Tasks

Each task names the subagent model that runs it: `[haiku]` for mechanical work, `[sonnet]` for work that needs reasoning (see `openspec/config.yaml`).

## 1. License and trademark

- [x] 1.1 [haiku] Replace `LICENSE` with the official Apache-2.0 text from https://www.apache.org/licenses/LICENSE-2.0.txt, and add `NOTICE` (`ctxhead` / `Copyright 2026 Vijay Gangatharan`). Verify by diffing `LICENSE` against the downloaded original: no differences.
- [x] 1.2 [haiku] Add `TRADEMARKS.md`: the name is reserved, modified distributions must rename, and factual references such as "compatible with" or "based on" are allowed. Verify that the file states all three points.
- [x] 1.3 [haiku] Set `package.json` `"license": "Apache-2.0"` and add `NOTICE` to `files`. Verify that `pnpm pack --dry-run` lists `LICENSE` and `NOTICE`.
- [x] 1.4 [haiku] Rewrite the README License section: Apache-2.0, links to `LICENSE` and `TRADEMARKS.md`, and the fact that generated files belong to the user. Verify that `grep -n MIT README.md package.json` finds nothing.

## 2. Contributor files

- [x] 2.1 [haiku] Add `CONTRIBUTING.md`: `pnpm install/build/typecheck/lint/test`, the PR flow, the DCO 1.1 text link, `git commit -s`, fixing unsigned commits (`git commit --amend -s`, `git rebase --signoff`), and a one-line note on `openspec/` and `.claude/` (D7). Verify that each listed command appears in the file.
- [x] 2.2 [haiku] Add `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1) with `vijaygangatharan.official@gmail.com` as the enforcement contact. Verify that no placeholder text is left.
- [x] 2.3 [haiku] Add `SECURITY.md`: private reporting through GitHub Security Advisories, a request not to file public issues, and the supported-versions table (latest 0.x). Verify that the file links to the repo's `security/advisories/new` URL.
- [x] 2.4 [haiku] Add `.github/ISSUE_TEMPLATE/bug.yml`, `feature.yml` and `config.yml` (blank issues off), plus `.github/pull_request_template.md` with a DCO checkbox. Verify that each YAML file parses with `python3 -c 'import yaml,sys;[yaml.safe_load(open(f)) for f in sys.argv[1:]]' <files>`.

## 3. CI and DCO gate

- [x] 3.1 [sonnet] Add `.github/workflows/ci.yml` per design D4. Verify that the YAML parses, and that `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm build && pnpm test` passes locally.
- [x] 3.2 [sonnet] Add `.github/workflows/dco.yml` per design D3. Verify locally on a scratch branch: the same `git log` command reports an unsigned commit's SHA, and reports nothing after `git commit --amend -s`.

## 4. Release readiness

- [x] 4.1 [haiku] Add the `repository`, `homepage`, `bugs`, `author` (`Vijay Gangatharan <vijaygangatharan.official@gmail.com>`) and `keywords` fields to `package.json` per design D8. Verify with `node -e` that every field is present and that the URLs point at `github.com/Vijay431/vscode-ctxhead`.
- [x] 4.2 [haiku] Add `CHANGELOG.md` in Keep a Changelog format with a `0.1.0` entry covering the v1 CLI and Apache-2.0 only. Hook enforcement (`enforce-header-hooks`) is not part of 0.1.0; it gets its own later version entry. Verify that a `## [0.1.0]` heading exists and that it does not mention `guard` or hooks.
- [x] 4.3 [sonnet] Run a secret scan over the tracked files and full history (`git log -p --all` grep for key, token, secret, password and private-key patterns). Verify zero real findings, and record any false positives in the PR description.
- [ ] 4.4 [sonnet] Before the first push, run `git config user.email vijaygangatharan.official@gmail.com` in this repo. Then rewrite every existing commit's author and committer email to that address, and add a DCO sign-off to each, with `git -c user.email=vijaygangatharan.official@gmail.com rebase --root --signoff -x 'GIT_COMMITTER_DATE="$(git log -1 --format=%aI)" git commit --amend --no-edit --author="Vijay Gangatharan <vijaygangatharan.official@gmail.com>"'`. Setting `GIT_COMMITTER_DATE` inside the exec keeps committer dates equal to author dates, which `--committer-date-is-author-date` cannot do because the amend resets them. Run this last, after every other commit made before the first push, including any `enforce-header-hooks` commits, so the rebase covers them too. Verify that `git log --format='%ae %ce' | sort -u` prints only the new address, that the DCO `git log` command from D3 over the whole history reports no unsigned commit, and that `origin` still has no branches.

## 5. Brand assets (agy)

- [x] 5.1 [sonnet] Run `agy -p "<brief>" --mode accept-edits` to create `assets/logo.svg` (512x512), `assets/banner.svg` (1280x320) and `assets/social-preview.svg` (1280x640): self-contained, system fonts only, "ctxhead" spelled correctly. Verify that each viewBox matches and that no file contains an `href` to an external URL.
- [x] 5.2 [haiku] Render `assets/logo.png` (512x512) and `assets/social-preview.png` (1280x640) with `playwright-cli` `open`, `resize` and `screenshot`. Verify the dimensions with `file assets/*.png`.
- [x] 5.3 [haiku] Add the banner at the top of the README with a relative `assets/banner.svg` path and alt text. Verify that the path resolves from the repo root.

## 6. Terminal demo (agy)

- [x] 6.1 [sonnet] Capture `assets/demo.txt` from a real run (`init`, `add src`, `enable`, `write`, `check` on a sample file in a temp git repo), with any per-run values normalized per the design Risks. Verify that the file holds only `$ ctxhead` lines and their output.
- [x] 6.2 [sonnet] Add `test/demo.test.ts`: replay `demo.txt` in `createEnv()`, assert that the output matches, and assert that every transcript line appears in `assets/demo.svg`. Extract the SVG's text by joining the text content of each `<text>` element (including its `<tspan>` children) and decoding XML entities (`&lt;`, `&gt;`, `&amp;`, `&quot;`, `&apos;`) before comparing. It must fail until 6.3 lands. Verify that `pnpm test` passes after 6.3.
- [x] 6.3 [sonnet] Run `agy` to turn `demo.txt` into the animated terminal SVG `assets/demo.svg` (CSS keyframes, no scripts), and embed it in the README under the quick start. Verify that `pnpm test` passes and that the SVG contains no `<script>`.

## 7. Integration

- [x] 7.1 [sonnet] Add `test/pack.test.ts`: run `pnpm pack --dry-run --json` and assert that every listed path is `package.json`, `README.md`, `LICENSE`, `NOTICE`, or under `dist/`. It runs in CI after `pnpm build` (D4), so the runtime-only rule cannot regress. Verify that the test passes and fails when `assets` is temporarily added to `files`.
- [x] 7.2 [haiku] Run `pnpm lint && pnpm typecheck && pnpm test` and `openspec validate add-oss-governance --strict`. All must pass.

## Workflow follow-up

- Push to `origin`, then set `assets/social-preview.png` in GitHub Settings > Social preview and enable private vulnerability reporting.
- Archive the change after review.

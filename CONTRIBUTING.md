# Contributing to ctxhead

Thanks for helping improve ctxhead. This guide covers local setup, the pull request flow, and the Developer Certificate of Origin (DCO) sign-off that every commit needs.

## Development setup

Requirements:

- Node.js 22 or newer
- pnpm, enabled through Corepack (ships with Node 22):

  ```sh
  corepack enable
  ```

Clone your fork, then run:

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

All four checks (`build`, `typecheck`, `lint`, `test`) must pass before you open a pull request.

## Pull request flow

1. Fork the repository on GitHub and clone your fork.
2. Create a branch from `main` for your change.
3. Keep changes focused: one logical change per pull request. Unrelated refactors or formatting churn make review slower.
4. Make sure CI passes. CI runs the same checks listed above.
5. Open a pull request against `main` and describe the change: what it does, why, and how you verified it. Link the related issue if there is one.

## Developer Certificate of Origin (DCO)

This project uses the [Developer Certificate of Origin 1.1](https://developercertificate.org/) instead of a Contributor License Agreement. By signing off a commit, you certify that you have the right to submit it under the project's Apache-2.0 license.

Every commit in a pull request needs a `Signed-off-by:` trailer matching the commit author. Add it with `-s`:

```sh
git commit -s -m "fix: handle empty header"
```

This appends a line such as `Signed-off-by: Your Name <you@example.com>` to the commit message.

### Fixing unsigned commits

If a commit is missing the sign-off:

- Last commit only: amend it with a sign-off.

  ```sh
  git commit --amend -s
  ```

- Several commits: rebase onto the base branch and add a sign-off to each one.

  ```sh
  git rebase --signoff <base>
  ```

  Replace `<base>` with the branch your pull request targets, for example `main`.

After rewriting history, force-push your pull request branch:

```sh
git push --force-with-lease
```

## Repository layout

`openspec/` holds the project's planning specs and `.claude/` holds contributor agent tooling; neither ships in the npm package.

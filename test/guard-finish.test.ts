import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FINISH_BLOCK_LIMIT, gateFinish } from '../src/guard/finish.js';
import type { SessionState } from '../src/guard/types.js';
import { readConfig } from '../src/repo/config.js';
import { createEnv, gitCommitAll, type TestEnv } from './helpers/env.js';

const fresh = (): SessionState => ({ shown: [], window: [], finishBlocks: 0 });

async function setup(): Promise<TestEnv> {
  const env = createEnv();
  await env.cli(['init']);
  env.write('src/auth.ts', 'export const token = 1;\n');
  env.write('src/old.ts', 'export const old = 1;\n');
  env.write('docs/notes.md', '# notes\n');
  await env.cli(['add', 'src']);
  await env.cli(['enable']);
  for (const f of ['src/auth.ts', 'src/old.ts'])
    await env.cli(['write', f, '--description', `Describes ${f}.`]);
  gitCommitAll(env.repo);
  return env;
}

const finish = (env: TestEnv, state = fresh()) => gateFinish(env.repo, readConfig(env.repo), state);
const edit = (env: TestEnv, path: string) =>
  appendFileSync(join(env.repo, path), 'export const x = 2;\n');
const git = (env: TestEnv, ...args: string[]) =>
  execFileSync('git', args, { cwd: env.repo }).toString();

describe('finish gate', () => {
  it('blocks an edited stale file with path and skill instruction', async () => {
    const env = await setup();
    edit(env, 'src/auth.ts');
    const r = await finish(env);
    expect(r.decision.kind).toBe('block-finish');
    const reason = (r.decision as { reason: string }).reason;
    expect(reason).toContain('src/auth.ts (stale)');
    expect(reason).toContain('ctxhead skill');
    expect(reason).toContain('ctxhead stale');
    expect(r.state.finishBlocks).toBe(1);
  });

  it('blocks a stale file edited before the session began', async () => {
    const env = await setup();
    edit(env, 'src/auth.ts');
    const r = await finish(env, fresh());
    expect(r.decision.kind).toBe('block-finish');
  });

  it('does not block untouched stale files', async () => {
    const env = await setup();
    edit(env, 'src/old.ts');
    gitCommitAll(env.repo, 'stale committed');
    const r = await finish(env);
    expect(r.decision).toEqual({ kind: 'allow' });
    expect(r.state.finishBlocks).toBe(0);
  });

  it('blocks a staged-only stale file', async () => {
    const env = await setup();
    edit(env, 'src/auth.ts');
    git(env, 'add', 'src/auth.ts');
    const r = await finish(env);
    expect(r.decision.kind).toBe('block-finish');
    expect((r.decision as { reason: string }).reason).toContain('src/auth.ts');
  });

  it('blocks an untracked in-scope file without a header', async () => {
    const env = await setup();
    env.write('src/new.ts', 'export const n = 1;\n');
    const r = await finish(env);
    expect((r.decision as { reason: string }).reason).toContain('src/new.ts (missing)');
  });

  it('ignores changed out-of-scope files', async () => {
    const env = await setup();
    env.write('docs/notes.md', '# changed\n');
    const r = await finish(env);
    expect(r.decision.kind).toBe('allow');
  });

  it('allows when the changed file is refreshed', async () => {
    const env = await setup();
    edit(env, 'src/auth.ts');
    await env.cli(['write', 'src/auth.ts', '--description', 'Describes auth.']);
    expect((await finish(env)).decision.kind).toBe('allow');
  });

  it('handles renamed files by new path', async () => {
    const env = await setup();
    git(env, 'mv', 'src/auth.ts', 'src/auth2.ts');
    edit(env, 'src/auth2.ts');
    const r = await finish(env);
    expect((r.decision as { reason: string }).reason).toContain('src/auth2.ts (stale)');
  });

  it('allows on the fourth attempt after 3 blocks and resets the counter', async () => {
    const env = await setup();
    edit(env, 'src/auth.ts');
    let state = fresh();
    for (let i = 1; i <= FINISH_BLOCK_LIMIT; i++) {
      const input = state;
      const r = await finish(env, input);
      expect(r.decision.kind).toBe('block-finish');
      expect(r.state.finishBlocks).toBe(i);
      expect(input.finishBlocks).toBe(i - 1);
      state = r.state;
    }
    const last = await finish(env, state);
    expect(last.decision.kind).toBe('allow');
    expect((last.decision as { note: string }).note).toContain('src/auth.ts (stale)');
    expect(last.state.finishBlocks).toBe(0);
  });

  it('writes nothing to the repository', async () => {
    const env = await setup();
    edit(env, 'src/auth.ts');
    env.write('src/new.ts', 'export const n = 1;\n');
    const before = git(env, 'status', '--porcelain');
    const config = readFileSync(join(env.repo, '.ctxhead.json'), 'utf8');
    let state = fresh();
    for (let i = 0; i < 4; i++) state = (await finish(env, state)).state;
    expect(git(env, 'status', '--porcelain')).toBe(before);
    expect(readFileSync(join(env.repo, '.ctxhead.json'), 'utf8')).toBe(config);
  });
});

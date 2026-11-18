import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateRead } from '../src/guard/gate.js';
import type { SessionState, Target } from '../src/guard/types.js';
import { readConfig } from '../src/repo/config.js';
import { createEnv, type TestEnv } from './helpers/env.js';

const empty = (): SessionState => ({ shown: [], window: [], finishBlocks: 0 });

async function setup(): Promise<TestEnv> {
  const env = createEnv();
  await env.cli(['init']);
  env.write('src/auth.ts', 'export const token = 1;\nexport const user = 2;\n');
  env.write('src/b.ts', 'export const b = 2;\n');
  env.write('docs/notes.md', '# notes\n');
  await env.cli(['add', 'src']);
  await env.cli(['enable']);
  for (const f of ['src/auth.ts', 'src/b.ts'])
    await env.cli(['write', f, '--description', `Describes ${f}.`]);
  return env;
}

function gate(
  env: TestEnv,
  state: SessionState,
  targets: Target[],
  shellCommand?: string,
  sessionId = 's1',
) {
  return gateRead(
    { sessionId, cwd: env.repo, targets, shellCommand },
    env.repo,
    readConfig(env.repo),
    state,
  );
}

const read = (path: string, endLine?: number): Target => ({ path, endLine });
const porcelain = (env: TestEnv) =>
  execFileSync('git', ['status', '--porcelain'], { cwd: env.repo }).toString();

describe('read-first gate', () => {
  it('denies the first full read with header and re-issue instruction', async () => {
    const env = await setup();
    const r = await gate(env, empty(), [read('src/auth.ts')]);
    expect(r.decision.kind).toBe('deny');
    const reason = (r.decision as { reason: string }).reason;
    expect(reason).toContain('ctxhead: showing the header of src/auth.ts instead of its body.');
    expect(reason).toContain('Describes src/auth.ts.');
    expect(reason).toContain('ctxhead: v1 sha256:');
    expect(reason).not.toContain('export const token');
    expect(reason).toContain('Re-issue the read only if the header does not settle your question');
  });

  it('allows the repeat read and does not mutate input state', async () => {
    const env = await setup();
    const initial = empty();
    const first = await gate(env, initial, [read('src/auth.ts')]);
    expect(initial).toEqual(empty());
    const second = await gate(env, first.state, [read('src/auth.ts')]);
    expect(second.decision.kind).toBe('allow');
  });

  it('gates a shell cat pipeline', async () => {
    const env = await setup();
    const r = await gate(env, empty(), [], 'cat src/auth.ts | grep token');
    expect(r.decision.kind).toBe('deny');
    expect((r.decision as { reason: string }).reason).toContain('src/auth.ts');
  });

  it('allows unrelated shell commands and out-of-scope files', async () => {
    const env = await setup();
    expect((await gate(env, empty(), [], 'pnpm test')).decision.kind).toBe('allow');
    expect((await gate(env, empty(), [read('docs/notes.md')])).decision.kind).toBe('allow');
    expect((await gate(env, empty(), [read('src/missing.ts')])).decision.kind).toBe('allow');
    expect((await gate(env, empty(), [read('/etc/hostname')])).decision.kind).toBe('allow');
  });
});

describe('header-only reads', () => {
  it('allows a header-range read, then a later full read', async () => {
    const env = await setup();
    const r1 = await gate(env, empty(), [read('src/auth.ts', 3)]);
    expect(r1.decision.kind).toBe('allow');
    const r2 = await gate(env, r1.state, [read('src/auth.ts')]);
    expect(r2.decision.kind).toBe('allow');
  });

  it('denies a bounded read that goes past the header', async () => {
    const env = await setup();
    const r = await gate(env, empty(), [read('src/auth.ts', 500)]);
    expect(r.decision.kind).toBe('deny');
  });

  it('denies again in a new session with fresh state', async () => {
    const env = await setup();
    const first = await gate(env, empty(), [read('src/auth.ts')]);
    expect(first.decision.kind).toBe('deny');
    const fresh = await gate(env, empty(), [read('src/auth.ts')], undefined, 's2');
    expect(fresh.decision.kind).toBe('deny');
  });
});

describe('subagent coverage', () => {
  it('a subagent with its own state is denied a full read with the header', async () => {
    const env = await setup();
    const parent = await gate(env, empty(), [read('src/auth.ts')]);
    expect(parent.decision.kind).toBe('deny');
    const sub = await gate(env, empty(), [read('src/auth.ts')], undefined, 'sub-1');
    expect(sub.decision.kind).toBe('deny');
    expect((sub.decision as { reason: string }).reason).toContain('Describes src/auth.ts.');
  });
});

describe('stale halt', () => {
  it('halts naming a stale file', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const z = 3;\n');
    const r = await gate(env, empty(), [read('src/auth.ts')]);
    expect(r.decision.kind).toBe('halt');
    const message = (r.decision as { message: string }).message;
    expect(message.startsWith('STOP: do not continue this task.')).toBe(true);
    expect(message).toContain('src/auth.ts (stale)');
    expect(message).toContain('ctxhead stale');
  });

  it('halts on a missing header', async () => {
    const env = await setup();
    env.write('src/new.ts', 'export const n = 1;\n');
    const r = await gate(env, empty(), [read('src/new.ts')]);
    expect(r.decision.kind).toBe('halt');
    expect((r.decision as { message: string }).message).toContain('src/new.ts (missing)');
  });

  it('halt beats deny across targets and keeps the denied file unshown', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const z = 3;\n');
    const r = await gate(env, empty(), [read('src/b.ts'), read('src/auth.ts')]);
    expect(r.decision.kind).toBe('halt');
    const message = (r.decision as { message: string }).message;
    expect(message).toContain('src/auth.ts (stale)');
    expect(message).not.toContain('src/b.ts');
    expect(r.state.shown).toEqual([]);
  });

  it('deny lists every withheld header', async () => {
    const env = await setup();
    const r = await gate(env, empty(), [read('src/auth.ts'), read('src/b.ts')]);
    const reason = (r.decision as { reason: string }).reason;
    expect(reason).toContain('header of src/auth.ts');
    expect(reason).toContain('header of src/b.ts');
  });
});

describe('refresh window', () => {
  it('stale run opens the window; refreshed file is then allowed and leaves the window', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const z = 3;\n');
    const run = await gate(env, empty(), [], 'ctxhead stale --json');
    expect(run.decision.kind).toBe('allow');
    expect(run.state.window).toEqual([join(env.repo, 'src/auth.ts')]);

    // Still stale inside the window: allowed so the skill can read and edit it.
    const during = await gate(env, run.state, [read('src/auth.ts')]);
    expect(during.decision.kind).toBe('allow');
    expect(during.state.window).toHaveLength(1);

    await env.cli(['write', 'src/auth.ts', '--description', 'Refreshed.']);
    const after = await gate(env, run.state, [read('src/auth.ts')]);
    expect(after.decision.kind).toBe('allow');
    expect(after.state.window).toEqual([]);
    expect(after.state.shown).toEqual([join(env.repo, 'src/auth.ts')]);
  });

  it('does not cover a file that went stale after the stale run', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const z = 3;\n');
    const run = await gate(env, empty(), [], 'ctxhead stale --json');
    appendFileSync(join(env.repo, 'src/b.ts'), 'export const y = 4;\n');
    const r = await gate(env, run.state, [read('src/b.ts')]);
    expect(r.decision.kind).toBe('halt');
    expect((r.decision as { message: string }).message).toContain('src/b.ts (stale)');
  });

  it('never writes in the repository', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const z = 3;\n');
    const before = porcelain(env);
    const config = readConfig(env.repo);
    await gate(env, empty(), [], 'ctxhead stale --json');
    await gate(env, empty(), [read('src/b.ts')]);
    expect(porcelain(env)).toBe(before);
    expect(readConfig(env.repo)).toEqual(config);
  });
});

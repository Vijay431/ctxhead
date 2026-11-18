import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { evaluate, parsePayload } from '../src/guard/evaluate.js';
import * as gate from '../src/guard/gate.js';
import type { GuardInput } from '../src/guard/types.js';
import { createEnv, type TestEnv, tempDir } from './helpers/env.js';

vi.mock('../src/guard/gate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/guard/gate.js')>();
  return { ...actual, gateRead: vi.fn(actual.gateRead) };
});

const ALLOW = { kind: 'allow' };

const input = (cwd: string, path: string): GuardInput => ({
  sessionId: 's1',
  cwd,
  targets: [{ path }],
});

async function enabledRepo(): Promise<TestEnv> {
  const env = createEnv();
  await env.cli(['init']);
  env.write('src/a.ts', 'export const a = 1;\n');
  env.write('docs/notes.md', '# notes\n');
  await env.cli(['add', 'src']);
  await env.cli(['enable']);
  await env.cli(['write', 'src/a.ts', '--description', 'Describes a.']);
  return env;
}

describe('fail open', () => {
  it('positive control: enabled repo with fresh header denies', async () => {
    const env = await enabledRepo();
    const result = await evaluate('claude', 'read', input(env.repo, 'src/a.ts'), tempDir());
    expect(result.kind).toBe('deny');
  });

  it('allows on bad JSON', async () => {
    expect(parsePayload('not json')).toBeNull();
    expect(await evaluate('claude', 'read', null, tempDir())).toEqual(ALLOW);
  });

  it('allows outside a repository', async () => {
    const dir = tempDir();
    expect(await evaluate('claude', 'read', input(dir, 'a.ts'), tempDir())).toEqual(ALLOW);
  });

  it('allows with no .ctxhead.json', async () => {
    const env = createEnv();
    env.write('src/a.ts', 'export const a = 1;\n');
    expect(await evaluate('claude', 'read', input(env.repo, 'src/a.ts'), tempDir())).toEqual(ALLOW);
  });

  it('allows with an invalid .ctxhead.json', async () => {
    const env = createEnv();
    env.write('.ctxhead.json', '{broken');
    expect(await evaluate('claude', 'read', input(env.repo, 'src/a.ts'), tempDir())).toEqual(ALLOW);
  });

  it('allows when the repository is disabled', async () => {
    const env = await enabledRepo();
    await env.cli(['disable']);
    expect(await evaluate('claude', 'read', input(env.repo, 'src/a.ts'), tempDir())).toEqual(ALLOW);
    expect(await evaluate('claude', 'finish', input(env.repo, 'src/a.ts'), tempDir())).toEqual(
      ALLOW,
    );
  });

  it('allows an out-of-scope file', async () => {
    const env = await enabledRepo();
    expect(await evaluate('claude', 'read', input(env.repo, 'docs/notes.md'), tempDir())).toEqual(
      ALLOW,
    );
  });

  it('allows a missing file', async () => {
    const env = await enabledRepo();
    expect(await evaluate('claude', 'read', input(env.repo, 'src/gone.ts'), tempDir())).toEqual(
      ALLOW,
    );
  });

  it('allows when the gate throws', async () => {
    const env = await enabledRepo();
    vi.mocked(gate.gateRead).mockRejectedValueOnce(new Error('boom'));
    expect(await evaluate('claude', 'read', input(env.repo, 'src/a.ts'), tempDir())).toEqual(ALLOW);
  });

  it('keeps the decision when state cannot be written', async () => {
    const env = await enabledRepo();
    const base = tempDir();
    const file = join(base, 'blocker');
    writeFileSync(file, 'not a directory');
    const result = await evaluate('claude', 'read', input(env.repo, 'src/a.ts'), file);
    expect(result.kind).toBe('deny');
  });
});

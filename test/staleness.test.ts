import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnv, gitCommitAll, type TestEnv } from './helpers/env.js';

const cfg = (env: TestEnv) => JSON.parse(readFileSync(join(env.repo, '.ctxhead.json'), 'utf8'));
const json = async (env: TestEnv) => JSON.parse((await env.cli(['stale', '--json'])).out);

async function setup(): Promise<TestEnv> {
  const env = createEnv();
  await env.cli(['init']);
  env.write('src/a.ts', 'export const a = 1;\n');
  env.write('src/b.ts', 'export const b = 2;\n');
  await env.cli(['add', 'src']);
  await env.cli(['enable']);
  return env;
}

async function stampAll(env: TestEnv) {
  for (const f of ['src/a.ts', 'src/b.ts'])
    await env.cli(['write', f, '--description', `Describes ${f}.`]);
}

describe('classification', () => {
  it('lists missing files as JSON for agents', async () => {
    const env = await setup();
    const out = await json(env);
    expect(out.files.map((f: { path: string; state: string }) => [f.path, f.state])).toEqual([
      ['src/a.ts', 'missing'],
      ['src/b.ts', 'missing'],
    ]);
    expect(out.estimatedTokens).toBeGreaterThan(0);
  });
  it('edited body is stale; header-only edit stays fresh', async () => {
    const env = await setup();
    await stampAll(env);
    expect((await json(env)).files).toEqual([]);
    const path = join(env.repo, 'src/a.ts');
    writeFileSync(path, readFileSync(path, 'utf8').replace('Describes src/a.ts.', 'Hand edited.'));
    expect((await env.cli(['check'])).code).toBe(0);
    writeFileSync(path, `${readFileSync(path, 'utf8')}export const z = 3;\n`);
    const out = await json(env);
    expect(out.files[0]).toMatchObject({ path: 'src/a.ts', state: 'stale' });
  });
});

describe('lastRunSha', () => {
  it('moves only on a clean run and narrows candidates', async () => {
    const env = await setup();
    const sha0 = gitCommitAll(env.repo);
    await json(env);
    expect(cfg(env).lastRunSha).toBeNull();
    await stampAll(env);
    const head = gitCommitAll(env.repo);
    expect(head).not.toBe(sha0);
    const r = await env.cli(['stale']);
    expect(r.out).toContain('All headers are fresh');
    expect(cfg(env).lastRunSha).toBe(head);
    gitCommitAll(env.repo, 'record');
    // uncommitted edit is found even with a recorded sha
    const path = join(env.repo, 'src/b.ts');
    writeFileSync(path, `${readFileSync(path, 'utf8')}export const y = 1;\n`);
    expect((await json(env)).files[0]).toMatchObject({ path: 'src/b.ts', state: 'stale' });
    expect(cfg(env).lastRunSha).toBe(head);
    // new headerless file is found
    env.write('src/c.ts', 'export const c = 1;\n');
    const states = (await json(env)).files.map((f: { path: string }) => f.path);
    expect(states).toContain('src/c.ts');
  });
  it('falls back to a full scan when lastRunSha is unreachable', async () => {
    const env = await setup();
    gitCommitAll(env.repo);
    const c = cfg(env);
    c.lastRunSha = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
    writeFileSync(join(env.repo, '.ctxhead.json'), JSON.stringify(c));
    expect((await json(env)).files).toHaveLength(2);
  });
  it('reports disabled instead of listing', async () => {
    const env = await setup();
    await env.cli(['disable']);
    expect((await env.cli(['stale'])).out).toContain('disabled');
    expect((await json(env)).enabled).toBe(false);
  });
});

describe('check and status', () => {
  it('check exits 1 naming a stale file, 0 when disabled', async () => {
    const env = await setup();
    await stampAll(env);
    const path = join(env.repo, 'src/a.ts');
    writeFileSync(path, `${readFileSync(path, 'utf8')}// more\nlet q;\n`);
    const r = await env.cli(['check']);
    expect(r.code).toBe(1);
    expect(r.out).toContain('src/a.ts');
    await env.cli(['disable']);
    expect((await env.cli(['check'])).code).toBe(0);
  });
  it('ignores headers in excluded files', async () => {
    const env = await setup();
    await stampAll(env);
    env.write('.ctxignore', 'src/a.ts\n');
    const path = join(env.repo, 'src/a.ts');
    writeFileSync(path, `${readFileSync(path, 'utf8')}let q;\n`);
    expect((await env.cli(['check'])).code).toBe(0);
  });
  it('status summarises', async () => {
    const env = await setup();
    await stampAll(env);
    env.write('src/c.ts', 'x\n');
    const path = join(env.repo, 'src/a.ts');
    writeFileSync(path, `${readFileSync(path, 'utf8')}let q;\n`);
    const out = (await env.cli(['status'])).out;
    expect(out).toContain('enabled');
    expect(out).toContain('src');
    expect(out).toContain('3 file(s)');
    expect(out).toMatch(/missing: 1\s+stale: 1\s+invalid: 0/);
  });
});

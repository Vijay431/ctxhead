import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnv } from './helpers/env.js';

const cfg = (repo: string) => JSON.parse(readFileSync(join(repo, '.ctxhead.json'), 'utf8'));

describe('init', () => {
  it('creates files and prints next steps', async () => {
    const env = createEnv();
    const r = await env.cli(['init']);
    expect(r.code).toBe(0);
    expect(existsSync(join(env.repo, '.ctxignore'))).toBe(true);
    expect(cfg(env.repo)).toEqual({ version: 1, enabled: false, include: [], lastRunSha: null });
    expect(r.out).toContain('ctxhead add <path>');
    expect(r.out).toContain('ctxhead enable');
  });
  it('keeps an existing .ctxignore', async () => {
    const env = createEnv();
    writeFileSync(join(env.repo, '.ctxignore'), 'mine\n');
    const r = await env.cli(['init']);
    expect(readFileSync(join(env.repo, '.ctxignore'), 'utf8')).toBe('mine\n');
    expect(r.out).toMatch(/kept\s+\.ctxignore/);
  });
});

describe('add/remove', () => {
  it('adds a folder, rejects outside and missing paths, removes', async () => {
    const env = createEnv();
    await env.cli(['init']);
    env.write('src/auth/a.ts', 'x');
    expect((await env.cli(['add', 'src/auth'])).code).toBe(0);
    expect(cfg(env.repo).include).toEqual(['src/auth']);
    const before = readFileSync(join(env.repo, '.ctxhead.json'), 'utf8');
    expect((await env.cli(['add', '../other'])).code).toBe(1);
    expect((await env.cli(['add', 'src/nope'])).code).toBe(1);
    expect(readFileSync(join(env.repo, '.ctxhead.json'), 'utf8')).toBe(before);
    await env.cli(['remove', 'src/auth']);
    expect(cfg(env.repo).include).toEqual([]);
  });
  it('resolves paths from a subfolder', async () => {
    const env = createEnv();
    await env.cli(['init']);
    env.write('src/auth/a.ts', 'x');
    await env.cli(['add', 'auth'], { cwd: join(env.repo, 'src') });
    expect(cfg(env.repo).include).toEqual(['src/auth']);
  });
});

describe('enable/disable', () => {
  it('requires init and round-trips', async () => {
    const env = createEnv();
    const r = await env.cli(['add', 'src']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('ctxhead init');
    await env.cli(['init']);
    await env.cli(['enable']);
    expect(cfg(env.repo).enabled).toBe(true);
    await env.cli(['disable']);
    expect(cfg(env.repo).enabled).toBe(false);
  });
});

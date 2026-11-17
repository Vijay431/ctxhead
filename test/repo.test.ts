import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commentPrefix } from '../src/header/syntax.js';
import { defaultConfig, parseConfig, readConfig, writeConfig } from '../src/repo/config.js';
import { findRepoRoot } from '../src/repo/git.js';
import { buildScope, listInScope } from '../src/repo/scope.js';
import { createEnv, tempDir } from './helpers/env.js';

describe('git root', () => {
  it('resolves from root, subfolder, and fails outside git', async () => {
    const env = createEnv();
    mkdirSync(join(env.repo, 'a/b'), { recursive: true });
    expect(await findRepoRoot(env.repo)).toBe(env.repo);
    expect(await findRepoRoot(join(env.repo, 'a/b'))).toBe(env.repo);
    expect(await findRepoRoot(tempDir('nogit-'))).toBeNull();
  });
});

describe('config', () => {
  it('round-trips the default shape', () => {
    const env = createEnv();
    writeConfig(env.repo, defaultConfig());
    expect(readConfig(env.repo)).toEqual({
      version: 1,
      enabled: false,
      include: [],
      lastRunSha: null,
    });
    expect(readFileSync(join(env.repo, '.ctxhead.json'), 'utf8')).toContain('"include": []');
  });
  it('rejects invalid JSON and unknown versions', () => {
    expect(() => parseConfig('{')).toThrow(/not valid JSON/);
    expect(() =>
      parseConfig('{"version":2,"enabled":false,"include":[],"lastRunSha":null}'),
    ).toThrow(/unsupported version/);
  });
});

describe('comment syntax', () => {
  it('maps every listed extension and rejects json', () => {
    for (const ext of ['ts', 'go', 'php', 'cs']) expect(commentPrefix(`a.${ext}`)).toBe('//');
    for (const ext of ['py', 'sh', 'yml', 'toml']) expect(commentPrefix(`a.${ext}`)).toBe('#');
    for (const ext of ['sql', 'lua', 'hs']) expect(commentPrefix(`a.${ext}`)).toBe('--');
    expect(commentPrefix('a.json')).toBeNull();
  });
});

describe('scope', () => {
  it('applies include, ctxignore, gitignore, and language', async () => {
    const env = createEnv();
    env.write('src/a.ts', 'x');
    env.write('src/gen/b.ts', 'x');
    env.write('src/c.json', '{}');
    env.write('src/d.ts', 'x');
    env.write('other/e.ts', 'x');
    env.write('.ctxignore', 'src/gen/\n');
    env.write('.gitignore', 'src/d.ts\n');
    const config = { ...defaultConfig(), include: ['src'] };
    const scope = buildScope(env.repo, config);
    expect(scope.reasonFor('src/a.ts')).toBeNull();
    expect(scope.reasonFor('src/gen/b.ts')).toBe('ignored');
    expect(scope.reasonFor('src/d.ts')).toBe('ignored');
    expect(scope.reasonFor('src/c.json')).toBe('unsupported-language');
    expect(scope.reasonFor('other/e.ts')).toBe('not-included');
    expect(await listInScope(env.repo, config)).toEqual(['src/a.ts']);
    writeFileSync(join(env.repo, 'x'), '');
  });
});

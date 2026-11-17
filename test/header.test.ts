import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bodyHash,
  deriveName,
  parseHeader,
  splitLines,
  validateFields,
} from '../src/header/header.js';
import { inspect, stamp } from '../src/header/inspect.js';
import { createEnv, type TestEnv } from './helpers/env.js';

const ok = (r: ReturnType<typeof stamp>) => {
  if (!('text' in r)) throw new Error(JSON.stringify(r));
  return r.text;
};

describe('placement', () => {
  it.each([
    ['//', 'const a = 1;\n', 0],
    ['//', '#!/usr/bin/env node\nconst a = 1;\n', 1],
    ['//', '"use strict";\n"use client"\nconst a = 1;\n', 2],
    ['//', '<?php\necho 1;\n', 1],
    ['#', '#!/usr/bin/env python\n# -*- coding: utf-8 -*-\nx = 1\n', 2],
    ['#', '# coding: latin-1\nx = 1\n', 1],
    ['--', 'select 1;\n', 0],
  ])('%s header goes at line index %i', (prefix, src, index) => {
    const text = ok(stamp(src, prefix as string, 'thing', 'Does a thing. Open when testing.'));
    const header = parseHeader(splitLines(text), prefix as string);
    expect(header?.start).toBe(index);
    expect(inspect(text, prefix as string).state).toBe('fresh');
    expect(text.startsWith(src.split('\n').slice(0, index).join('\n'))).toBe(true);
  });
});

describe('validation', () => {
  const ids = (n: string, d: string) => validateFields(n, d).map((r) => r.id);
  it('flags each rule', () => {
    expect(ids('Auth_Mw', 'ok')).toEqual(['name-format']);
    expect(ids('', 'ok')).toEqual(['name-length']);
    expect(ids('a'.repeat(65), 'ok')).toEqual(['name-length']);
    expect(ids('a--b', 'ok')).toEqual(['name-format']);
    expect(ids('-a', 'ok')).toEqual(['name-format']);
    expect(ids('a', 'x'.repeat(1025))).toEqual(['description-length']);
    expect(ids('a', 'see <summary> here')).toEqual(['description-xml']);
    expect(ids('a', 'This file does x')).toEqual(['description-filler']);
    expect(ids('Bad_Name', '<b>x</b>')).toEqual(['name-format', 'description-xml']);
    expect(ids('a', 'x'.repeat(1024))).toEqual([]);
  });
  it('rejects unwrappable descriptions with description-wrap', () => {
    const r = stamp('x\n', '//', 'a', 'w'.repeat(150));
    expect('rules' in r && r.rules[0]?.id).toBe('description-wrap');
  });
});

describe('hash', () => {
  it('ignores line endings and leading blanks; known vector', () => {
    expect(bodyHash('a\nb\n')).toBe(bodyHash('a\r\nb\r\n'));
    expect(bodyHash('\n\na\n')).toBe(bodyHash('a\n'));
    expect(bodyHash('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
  it('LF to CRLF does not change freshness', () => {
    const lf = ok(stamp('a\nb\n', '//', 'x', 'Does x.'));
    expect(inspect(lf.replace(/\n/g, '\r\n'), '//').state).toBe('fresh');
  });
});

describe('formatting', () => {
  it('wraps long descriptions within 100 chars and round-trips', () => {
    const desc = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ');
    const text = ok(stamp('x\n', '//', 'a', desc));
    expect(text.split('\n').every((l) => l.length <= 100)).toBe(true);
    expect(text).toContain('// description: >-');
    expect(parseHeader(splitLines(text), '//')?.description).toBe(desc);
  });
  it('derives names', () => {
    expect(deriveName('src/UserService.ts')).toBe('user-service');
    expect(deriveName('a/auth_middleware.py')).toBe('auth-middleware');
    expect(deriveName('HTTPServer.go')).toBe('http-server');
  });
  it('keeps body byte-identical and replaces rather than duplicates', () => {
    const body = 'export const a = 1;\n\n\nexport const b = 2;\n';
    const one = ok(stamp(body, '//', 'a', 'First.'));
    const two = ok(stamp(one, '//', 'a', 'Second.'));
    expect(two.match(/--- *$/gm)?.length).toBe(2);
    expect(two).toContain('Second.');
    expect(two).not.toContain('First.');
    expect(two.endsWith(`\n\n${body}`)).toBe(true);
  });
  it('preserves CRLF files', () => {
    const text = ok(stamp('a\r\nb\r\n', '//', 'x', 'Does x.'));
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });
});

describe('invalid headers', () => {
  it('detects malformed headers', () => {
    expect(inspect('// ---\n// name: a\n// description: x\n', '//').state).toBe('invalid');
    expect(inspect('// ---\n// name: a\n// foo: x\n// ---\n', '//').state).toBe('invalid');
  });
});

async function setup(): Promise<TestEnv> {
  const env = createEnv();
  await env.cli(['init']);
  env.write('src/a.ts', 'export const a = 1;\n');
  env.write('config/app.json', '{}');
  await env.cli(['add', 'src', 'config']);
  return env;
}

describe('ctxhead write', () => {
  it('writes TS and Python headers, preserves shebang', async () => {
    const env = await setup();
    await env.cli(['enable']);
    env.write('src/auth.ts', 'x\n');
    env.write('src/tool.py', 'print(1)\n');
    env.write('src/run.js', '#!/usr/bin/env node\nrun();\n');
    const r = await env.cli([
      'write',
      'src/auth.ts',
      '--name',
      'auth-middleware',
      '--description',
      'Verifies JWTs. Open when changing auth.',
    ]);
    expect(r.code).toBe(0);
    const ts = readFileSync(join(env.repo, 'src/auth.ts'), 'utf8').split('\n');
    expect(ts.slice(0, 5).map((l) => l.replace(/[0-9a-f]{64}/, '<h>'))).toEqual([
      '// ---',
      '// name: auth-middleware',
      '// description: Verifies JWTs. Open when changing auth.',
      '// ctxhead: v1 sha256:<h>',
      '// ---',
    ]);
    await env.cli(['write', 'src/tool.py', '--description', 'Runs tool.']);
    expect(
      readFileSync(join(env.repo, 'src/tool.py'), 'utf8')
        .split('\n')
        .slice(0, 5)
        .every((l) => l.startsWith('# ')),
    ).toBe(true);
    await env.cli(['write', 'src/run.js', '--description', 'Runs it.']);
    const js = readFileSync(join(env.repo, 'src/run.js'), 'utf8').split('\n');
    expect(js[0]).toBe('#!/usr/bin/env node');
    expect(js[1]).toBe('// ---');
  });
  it('rejects with exit 2 and rule lines, file unchanged', async () => {
    const env = await setup();
    await env.cli(['enable']);
    const before = readFileSync(join(env.repo, 'src/a.ts'), 'utf8');
    const r = await env.cli([
      'write',
      'src/a.ts',
      '--name',
      'Bad_Name',
      '--description',
      '<b>x</b>',
    ]);
    expect(r.code).toBe(2);
    expect(r.err.match(/^rule /gm)?.length).toBe(2);
    expect(readFileSync(join(env.repo, 'src/a.ts'), 'utf8')).toBe(before);
  });
  it('refuses while disabled', async () => {
    const env = await setup();
    const r = await env.cli(['write', 'src/a.ts', '--description', 'x.']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('disabled');
  });
  it('refuses unsupported file types', async () => {
    const env = await setup();
    await env.cli(['enable']);
    const r = await env.cli(['write', 'config/app.json', '--description', 'x.']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('unsupported-language');
  });
});

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stamp } from '../src/header/inspect.js';
import { createEnv, gitCommitAll, type TestEnv } from './helpers/env.js';

const FIXTURES = join(import.meta.dirname, 'fixtures', 'hooks');
const FIXTURE_ROOT = '/home/user/project';

/** Loads a fixture and points its cwd and file paths at the temp repo. */
function payload(env: TestEnv, name: string, file = 'src/auth.ts'): string {
  const raw = readFileSync(join(FIXTURES, `${name}.json`), 'utf8');
  return raw
    .replaceAll(`${FIXTURE_ROOT}/a.ts`, join(env.repo, file))
    .replaceAll('"EndLine": 1', '"EndLine": 50')
    .replaceAll('cat b.ts', `cat ${file}`)
    .replaceAll(FIXTURE_ROOT, env.repo);
}

async function setup(): Promise<TestEnv> {
  const env = createEnv();
  await env.cli(['init']);
  env.write('src/auth.ts', 'export const token = 1;\nexport const user = 2;\n');
  await env.cli(['add', 'src']);
  await env.cli(['enable']);
  await env.cli(['write', 'src/auth.ts', '--description', 'Describes src/auth.ts.']);
  gitCommitAll(env.repo);
  return env;
}

const guard = (env: TestEnv, agent: string, event: string, stdin: string) =>
  env.cli(['guard', '--agent', agent, '--event', event], { stdin });

describe('ctxhead guard', () => {
  it('claude: denies the first read, then stays silent on the repeat', async () => {
    const env = await setup();
    const stdin = payload(env, 'claude-read');
    const first = await guard(env, 'claude', 'read', stdin);
    expect(first.code).toBe(0);
    const out = JSON.parse(first.out);
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(out.hookSpecificOutput.permissionDecisionReason).toContain('Describes src/auth.ts.');
    const second = await guard(env, 'claude', 'read', stdin);
    expect(second).toMatchObject({ code: 0, out: '' });
  });

  it('gemini: denies with the gemini shape', async () => {
    const env = await setup();
    const r = await guard(env, 'gemini', 'read', payload(env, 'gemini-read.doc-derived'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).decision).toBe('deny');
  });

  it('codex: denies a shell cat', async () => {
    const env = await setup();
    const r = await guard(env, 'codex', 'read', payload(env, 'codex-shell.doc-derived'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('permissionDecision');
    expect(r.out).toContain('deny');
  });

  it('antigravity: denies with the antigravity shape', async () => {
    const env = await setup();
    const r = await guard(env, 'antigravity', 'read', payload(env, 'antigravity-read'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).decision).toBe('deny');
  });

  it('claude: halts on a stale file', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const x = 3;\n');
    const r = await guard(env, 'claude', 'read', payload(env, 'claude-read'));
    expect(r.code).toBe(0);
    const out = JSON.parse(r.out);
    expect(out.continue).toBe(false);
    expect(out.stopReason).toContain('src/auth.ts (stale)');
  });

  it('claude: blocks finish while an edited file is stale', async () => {
    const env = await setup();
    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const x = 3;\n');
    const r = await guard(env, 'claude', 'finish', payload(env, 'claude-finish'));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.out).decision).toBe('block');
  });

  it('fails open with empty output and exit 0', async () => {
    const env = await setup();
    const good = payload(env, 'claude-read');
    const cases: [string[], string][] = [
      [['guard', '--agent', 'claude', '--event', 'read'], '{not json'],
      [['guard', '--agent', 'claude', '--event', 'read'], ''],
      [['guard', '--agent', 'nope', '--event', 'read'], good],
      [['guard', '--event', 'read'], good],
      [['guard', '--agent', 'claude'], good],
      [['guard', '--agent', 'claude', '--event', 'later'], good],
      [['guard', '--agent', 'claude', '--event', 'read', '--bogus'], '[]'],
    ];
    for (const [args, stdin] of cases) {
      const r = await env.cli(args, { stdin });
      expect(r, args.join(' ')).toMatchObject({ code: 0, out: '', err: '' });
    }
  });

  it('answers a read event on a 200-file repository within the loose ceiling', async () => {
    const env = createEnv();
    await env.cli(['init']);
    for (let i = 0; i < 200; i++) {
      const file = `src/m${i}/f${i}.ts`;
      mkdirSync(join(env.repo, `src/m${i}`), { recursive: true });
      const stamped = stamp(`export const v${i} = ${i};\n`, '//', `f${i}`, `Describes f${i}.`);
      if (!('text' in stamped)) throw new Error('stamp failed');
      writeFileSync(join(env.repo, file), stamped.text);
    }
    await env.cli(['add', 'src']);
    await env.cli(['enable']);
    gitCommitAll(env.repo);
    const stdin = payload(env, 'claude-read', 'src/m199/f199.ts');
    const start = performance.now();
    const r = await guard(env, 'claude', 'read', stdin);
    const ms = Math.round(performance.now() - start);
    console.log(`guard read latency (200 files): ${ms} ms (budget 100 ms, ceiling 1000 ms)`);
    expect(JSON.parse(r.out).hookSpecificOutput.permissionDecision).toBe('deny');
    expect(ms).toBeLessThan(1000);
  });
});

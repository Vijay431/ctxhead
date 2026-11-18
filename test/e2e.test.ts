import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEnv } from './helpers/env.js';

interface Handler {
  command?: string;
}
interface Group {
  matcher?: string;
  hooks?: Handler[];
}

/** First handler command in `event` that starts with `ctxhead guard`. */
function guardCommand(settings: { hooks: Record<string, Group[]> }, event: string): string {
  const commands = (settings.hooks[event] ?? [])
    .flatMap((group) => group.hooks ?? [])
    .map((handler) => handler.command ?? '')
    .filter((command) => command.startsWith('ctxhead guard'));
  expect(commands).toHaveLength(1);
  return commands[0] as string;
}

describe('end to end', () => {
  it('install -> init -> add -> enable -> stale -> write -> check', async () => {
    const env = createEnv();
    env.write('src/a.ts', 'export const a = 1;\n');
    env.write('src/b.py', 'b = 2\n');
    env.write('src/c.json', '{}');
    env.write('docs/readme.ts', 'x\n');

    expect((await env.cli(['install', '--project', '--tools', 'claude'])).code).toBe(0);
    expect((await env.cli(['init'])).code).toBe(0);
    expect((await env.cli(['add', 'src'])).code).toBe(0);
    expect((await env.cli(['enable'])).code).toBe(0);
    expect((await env.cli(['check'])).code).toBe(1);

    const listed = JSON.parse((await env.cli(['stale', '--json'])).out);
    expect(listed.files.map((f: { path: string }) => f.path)).toEqual(['src/a.ts', 'src/b.py']);
    for (const { path } of listed.files) {
      const r = await env.cli([
        'write',
        path,
        '--description',
        `Describes ${path}. Open when testing.`,
      ]);
      expect(r.code).toBe(0);
    }
    expect(JSON.parse((await env.cli(['stale', '--json'])).out).files).toEqual([]);
    expect((await env.cli(['check'])).code).toBe(0);
  });

  it('installed hook commands drive read -> deny -> allow -> halt -> stale -> allow', async () => {
    const env = createEnv();
    expect((await env.cli(['install', '--project', '--tools', 'claude'])).code).toBe(0);
    expect((await env.cli(['init'])).code).toBe(0);
    env.write('src/auth.ts', 'export const token = 1;\n');
    expect((await env.cli(['add', 'src'])).code).toBe(0);
    expect((await env.cli(['enable'])).code).toBe(0);
    const description = 'Describes the auth token. Open when changing login.';
    expect((await env.cli(['write', 'src/auth.ts', '--description', description])).code).toBe(0);

    const settings = JSON.parse(readFileSync(join(env.repo, '.claude/settings.json'), 'utf8'));
    const readCommand = guardCommand(settings, 'PreToolUse');
    const finishCommand = guardCommand(settings, 'Stop');
    expect(readCommand.startsWith('ctxhead guard')).toBe(true);
    expect(finishCommand.startsWith('ctxhead guard')).toBe(true);
    const argv = readCommand.split(' ').slice(1);
    expect(argv[0]).toBe('guard');

    const base = { session_id: 'e2e-session', cwd: env.repo, hook_event_name: 'PreToolUse' };
    const read = JSON.stringify({
      ...base,
      tool_name: 'Read',
      tool_input: { file_path: join(env.repo, 'src/auth.ts') },
    });
    const bash = JSON.stringify({
      ...base,
      tool_name: 'Bash',
      tool_input: { command: 'ctxhead stale' },
    });
    const hook = (stdin: string) => env.cli(argv, { stdin });

    const denied = await hook(read);
    expect(denied.code).toBe(0);
    const deny = JSON.parse(denied.out);
    expect(deny.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(deny.hookSpecificOutput.permissionDecisionReason).toContain(description);

    expect(await hook(read)).toMatchObject({ code: 0, out: '' });

    appendFileSync(join(env.repo, 'src/auth.ts'), 'export const user = 2;\n');
    const halted = await hook(read);
    expect(halted.code).toBe(0);
    const halt = JSON.parse(halted.out);
    expect(halt.continue).toBe(false);
    expect(halt.stopReason).toContain('src/auth.ts');

    expect(await hook(bash)).toMatchObject({ code: 0, out: '' });
    expect(await hook(read)).toMatchObject({ code: 0, out: '' });

    const status = execFileSync('git', ['status', '--porcelain', '-uall'], { cwd: env.repo })
      .toString()
      .split('\n')
      .filter(Boolean)
      .map((line) => line.slice(3))
      .sort();
    for (const path of status) {
      expect(path, path).toMatch(
        /^(\.claude\/|\.ctxignore$|\.ctxhead|src\/auth\.ts$|AGENTS\.md$|CLAUDE\.md$)/,
      );
    }
    expect(status.some((path) => path.includes('state'))).toBe(false);
  });
});

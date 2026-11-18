import { describe, expect, it } from 'vitest';
import {
  HookConfigError,
  hasOwnedHooks,
  hookSpecFor,
  removeHooks,
  upsertHooks,
} from '../src/agents/hooks.js';
import { AGENTS } from '../src/agents/registry.js';

const claude = AGENTS.find((a) => a.id === 'claude');
const anti = AGENTS.find((a) => a.id === 'antigravity');
if (!claude || !anti) throw new Error('registry missing agents');
const spec = hookSpecFor(claude, 'project');
const antiSpec = hookSpecFor(anti, 'project');
if (!spec || !antiSpec) throw new Error('missing hook spec');

const userHook = { matcher: 'Edit', hooks: [{ type: 'command', command: 'my-lint' }] };
const userFile = `${JSON.stringify({ permissions: { allow: ['Read'] }, hooks: { PreToolUse: [userHook] } }, null, 2)}\n`;

describe('hook config helpers', () => {
  it('adds to an empty or null file', () => {
    for (const input of [null, '', '  \n']) {
      const out = JSON.parse(upsertHooks(input, spec));
      expect(out.hooks.PreToolUse).toEqual([
        {
          matcher: 'Read|Bash',
          hooks: [{ type: 'command', command: 'ctxhead guard --agent claude --event read' }],
        },
      ]);
      expect(out.hooks.Stop).toEqual([
        { hooks: [{ type: 'command', command: 'ctxhead guard --agent claude --event finish' }] },
      ]);
    }
  });

  it('keeps user hooks and keys, adding ctxhead once', () => {
    const out = JSON.parse(upsertHooks(userFile, spec));
    expect(out.permissions).toEqual({ allow: ['Read'] });
    expect(out.hooks.PreToolUse).toHaveLength(2);
    expect(out.hooks.PreToolUse[0]).toEqual(userHook);
    expect(Object.keys(out)).toEqual(['permissions', 'hooks']);
  });

  it('replaces in place on re-run', () => {
    const once = upsertHooks(userFile, spec);
    expect(upsertHooks(once, spec)).toBe(once);
    expect(hasOwnedHooks(once)).toBe(true);
    expect(hasOwnedHooks(userFile)).toBe(false);
  });

  it('removes owned handlers, keeps user hook, prunes empties', () => {
    const out = JSON.parse(removeHooks(upsertHooks(userFile, spec)) ?? 'null');
    expect(out.hooks).toEqual({ PreToolUse: [userHook] });
    expect(out.permissions).toEqual({ allow: ['Read'] });
  });

  it('returns null when only ctxhead hooks existed', () => {
    expect(removeHooks(upsertHooks(null, spec))).toBeNull();
    expect(removeHooks('{}')).toBeNull();
  });

  it('writes a flat finish handler for antigravity', () => {
    const out = JSON.parse(upsertHooks(null, antiSpec));
    expect(out.hooks.Stop).toEqual([
      { type: 'command', command: 'ctxhead guard --agent antigravity --event finish' },
    ]);
    expect(out.hooks.PreToolUse.map((g: { matcher: string }) => g.matcher)).toEqual([
      'read_file',
      'view_file',
      'run_command',
    ]);
    expect(upsertHooks(JSON.stringify(out), antiSpec)).toBe(`${JSON.stringify(out, null, 2)}\n`);
    expect(removeHooks(JSON.stringify(out))).toBeNull();
  });

  it('throws on invalid JSON or wrong shapes', () => {
    expect(() => upsertHooks('{nope', spec)).toThrow(HookConfigError);
    expect(() => upsertHooks('[]', spec)).toThrow(HookConfigError);
    expect(() => upsertHooks('{"hooks": []}', spec)).toThrow(HookConfigError);
    expect(() => removeHooks('{nope')).toThrow(HookConfigError);
  });

  it('registry has hooks for all agents and scopes', () => {
    expect(AGENTS).toHaveLength(4);
    for (const agent of AGENTS) {
      for (const scope of ['project', 'global'] as const) {
        expect(agent[scope].hooks, `${agent.id} ${scope}`).not.toBeNull();
        expect(hookSpecFor(agent, scope)?.read.command).toContain(`--agent ${agent.id}`);
      }
    }
    expect(anti.global.hooks?.path).toBe('.gemini/config/hooks.json');
  });
});

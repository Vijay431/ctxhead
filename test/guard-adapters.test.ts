import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADAPTER_IDS, render, toInput } from '../src/guard/adapters.js';
import type { Decision, GuardEvent } from '../src/guard/types.js';

const DIR = join(import.meta.dirname, 'fixtures', 'hooks');
const load = (name: string): unknown => JSON.parse(readFileSync(join(DIR, name), 'utf8'));
const SID = '00000000-0000-0000-0000-000000000000';
const CWD = '/home/user/project';
const P = '/home/user/project';

const cases: [string, string, GuardEvent, object][] = [
  ['claude', 'claude-read.json', 'read', { targets: [{ path: `${P}/a.ts` }] }],
  ['claude', 'claude-subagent-read.json', 'read', { targets: [{ path: `${P}/c.ts` }] }],
  ['claude', 'claude-shell.json', 'read', { targets: [], shellCommand: 'cat b.ts' }],
  ['claude', 'claude-finish.json', 'finish', { targets: [] }],
  [
    'codex',
    'codex-read.doc-derived.json',
    'read',
    { targets: [], shellCommand: "sed -n '1,40p' a.ts" },
  ],
  [
    'codex',
    'codex-subagent-read.doc-derived.json',
    'read',
    { targets: [], shellCommand: "sed -n '1,40p' c.ts" },
  ],
  ['codex', 'codex-shell.doc-derived.json', 'read', { targets: [], shellCommand: 'cat b.ts' }],
  ['codex', 'codex-finish.doc-derived.json', 'finish', { targets: [] }],
  [
    'gemini',
    'gemini-read.doc-derived.json',
    'read',
    { targets: [{ path: `${P}/a.ts`, endLine: 20 }] },
  ],
  ['gemini', 'gemini-subagent-read.doc-derived.json', 'read', { targets: [{ path: `${P}/c.ts` }] }],
  ['gemini', 'gemini-read-many-files.doc-derived.json', 'read', { targets: [{ path: 'a.ts' }] }],
  ['gemini', 'gemini-shell.doc-derived.json', 'read', { targets: [], shellCommand: 'cat b.ts' }],
  ['gemini', 'gemini-finish.doc-derived.json', 'finish', { targets: [] }],
  [
    'antigravity',
    'antigravity-read.json',
    'read',
    { targets: [{ path: `${P}/a.ts`, endLine: 1 }] },
  ],
  ['antigravity', 'antigravity-shell.json', 'read', { targets: [], shellCommand: 'cat b.ts' }],
  ['antigravity', 'antigravity-finish.json', 'finish', { targets: [] }],
];

describe('toInput fixtures', () => {
  it.each(cases)('%s %s', (agent, file, event, expected) => {
    expect(toInput(agent, event, load(file))).toEqual({ sessionId: SID, cwd: CWD, ...expected });
  });
});

describe('toInput edge cases', () => {
  it('claude Read offset+limit', () => {
    const p = {
      session_id: 's',
      cwd: '/c',
      tool_name: 'Read',
      tool_input: { file_path: '/c/a', offset: 10, limit: 5 },
    };
    expect(toInput('claude', 'read', p)?.targets).toEqual([{ path: '/c/a', endLine: 14 }]);
    const q = { ...p, tool_input: { file_path: '/c/a', limit: 5 } };
    expect(toInput('claude', 'read', q)?.targets).toEqual([{ path: '/c/a', endLine: 5 }]);
  });
  it('codex array commands', () => {
    const mk = (command: unknown, tool = 'exec_command') => ({
      session_id: 's',
      cwd: '/c',
      tool_name: tool,
      tool_input: { command },
    });
    expect(toInput('codex', 'read', mk(['bash', '-lc', 'cat a.ts']))?.shellCommand).toBe(
      'cat a.ts',
    );
    expect(toInput('codex', 'read', mk(['cat', 'a.ts']))?.shellCommand).toBe('cat a.ts');
  });
  it('gemini read_file without limit has no endLine', () => {
    const p = {
      session_id: 's',
      cwd: '/c',
      tool_name: 'read_file',
      tool_input: { file_path: '/c/a' },
    };
    expect(toInput('gemini', 'read', p)?.targets).toEqual([{ path: '/c/a' }]);
  });
  it('antigravity view_file', () => {
    const p = {
      conversationId: 's',
      cwd: '/c',
      toolCall: { name: 'view_file', args: { AbsolutePath: '/c/a', StartLine: 1, EndLine: 9 } },
    };
    expect(toInput('antigravity', 'read', p)?.targets).toEqual([{ path: '/c/a', endLine: 9 }]);
  });
  it.each([
    ['claude', { session_id: 's', cwd: '/c', tool_name: 'Grep', tool_input: {} }],
    ['codex', { session_id: 's', cwd: '/c', tool_name: 'apply_patch', tool_input: {} }],
    ['gemini', { session_id: 's', cwd: '/c', tool_name: 'glob', tool_input: {} }],
    ['antigravity', { conversationId: 's', cwd: '/c', toolCall: { name: 'list_dir', args: {} } }],
  ])('%s unknown tool -> null', (agent, payload) => {
    expect(toInput(agent, 'read', payload)).toBeNull();
  });
  it.each(ADAPTER_IDS)('%s garbage -> null', (agent) => {
    for (const g of [42, null, {}, 'x', [], undefined]) {
      expect(toInput(agent, 'read', g)).toBeNull();
      expect(toInput(agent, 'finish', g)).toBeNull();
    }
  });
  it('unknown agent', () => {
    expect(toInput('nope', 'read', load('claude-read.json'))).toBeNull();
    expect(toInput('__proto__', 'read', load('claude-read.json'))).toBeNull();
    expect(render('nope', 'read', { kind: 'deny', reason: 'r' })).toEqual({
      stdout: '',
      exitCode: 0,
    });
  });
  it('lists all agents', () => {
    expect([...ADAPTER_IDS].sort()).toEqual(['antigravity', 'claude', 'codex', 'gemini']);
  });
});

const R = 'why';
const M = 'STOP: do not continue this task.';
const claudeDeny = (reason: string) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
});
const j = (o: object) => `${JSON.stringify(o)}\n`;

describe('render', () => {
  const allow: Decision = { kind: 'allow' };
  const note: Decision = { kind: 'allow', note: 'n' };
  const deny: Decision = { kind: 'deny', reason: R };
  const halt: Decision = { kind: 'halt', message: M };
  const fin: Decision = { kind: 'block-finish', reason: R };

  const expected: Record<string, { note: string; deny: string; halt: string; fin: string }> = {
    claude: {
      note: j({ systemMessage: 'n' }),
      deny: j(claudeDeny(R)),
      halt: j({ ...claudeDeny(M), continue: false, stopReason: M }),
      fin: j({ decision: 'block', reason: R }),
    },
    codex: {
      note: '',
      deny: j(claudeDeny(R)),
      halt: j(claudeDeny(M)),
      fin: j({ decision: 'block', reason: R }),
    },
    gemini: {
      note: j({ systemMessage: 'n' }),
      deny: j({ decision: 'deny', reason: R }),
      halt: j({ decision: 'deny', reason: M, continue: false, stopReason: M }),
      fin: j({ decision: 'deny', reason: R }),
    },
    antigravity: {
      note: '',
      deny: j({ decision: 'deny', reason: R }),
      halt: j({ decision: 'deny', reason: M }),
      fin: j({ decision: 'continue', reason: R }),
    },
  };

  it.each(Object.keys(expected))('%s', (agent) => {
    const e = expected[agent];
    if (!e) throw new Error('missing');
    expect(render(agent, 'read', allow)).toEqual({ stdout: '', exitCode: 0 });
    expect(render(agent, 'finish', note)).toEqual({ stdout: e.note, exitCode: 0 });
    expect(render(agent, 'read', deny)).toEqual({ stdout: e.deny, exitCode: 0 });
    expect(render(agent, 'read', halt)).toEqual({ stdout: e.halt, exitCode: 0 });
    expect(render(agent, 'finish', fin)).toEqual({ stdout: e.fin, exitCode: 0 });
  });
});

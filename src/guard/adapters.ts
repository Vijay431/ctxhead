/** Per-agent hook payload adapters (design D1, D3). Map agent JSON to neutral guard types and back. */

import type { Decision, GuardEvent, GuardInput, Target } from './types.js';

type Obj = Record<string, unknown>;

interface Adapter {
  toInput(event: GuardEvent, payload: Obj): GuardInput | null;
  render(event: GuardEvent, decision: Decision): Obj | null;
}

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);
const int = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isInteger(v) ? v : undefined;
const GLOB_CHARS = /[*?[{]/;

function base(
  sessionId: unknown,
  cwd: unknown,
  extra: Partial<GuardInput> = {},
): GuardInput | null {
  const id = str(sessionId);
  const dir = str(cwd);
  if (!id || !dir) return null;
  return { sessionId: id, cwd: dir, targets: [], ...extra };
}

function shell(cmd: unknown, joinArrays: boolean): string | undefined {
  if (typeof cmd === 'string') return str(cmd);
  if (!joinArrays || !Array.isArray(cmd) || cmd.length === 0) return undefined;
  const parts = cmd.filter((p): p is string => typeof p === 'string');
  if (parts.length !== cmd.length) return undefined;
  const isShellWrap = parts.length >= 3 && /(^|\/)(ba|z|da)?sh$/.test(parts[0] ?? '');
  return str(isShellWrap ? parts[parts.length - 1] : parts.join(' '));
}

/** Claude and Codex share field names; Codex also has exec_command and array commands. */
function claudeLike(shellTools: string[], codex: boolean): Adapter['toInput'] {
  return (event, p) => {
    if (event === 'finish') return base(p.session_id, p.cwd);
    const name = p.tool_name;
    const input = isObj(p.tool_input) ? p.tool_input : {};
    if (name === 'Read' && !codex) {
      const path = str(input.file_path);
      if (!path) return null;
      const limit = int(input.limit);
      const offset = int(input.offset);
      const target: Target = { path };
      if (limit !== undefined && limit > 0) target.endLine = (offset ?? 1) + limit - 1;
      return base(p.session_id, p.cwd, { targets: [target] });
    }
    if (typeof name === 'string' && shellTools.includes(name)) {
      const cmd = shell(input.command ?? input.cmd, codex);
      return cmd ? base(p.session_id, p.cwd, { shellCommand: cmd }) : null;
    }
    return null;
  };
}

function geminiInput(event: GuardEvent, p: Obj): GuardInput | null {
  if (event === 'finish') return base(p.session_id, p.cwd);
  const input = isObj(p.tool_input) ? p.tool_input : {};
  switch (p.tool_name) {
    case 'read_file': {
      const path = str(input.file_path);
      if (!path) return null;
      const limit = int(input.limit);
      const offset = int(input.offset);
      const target: Target = { path };
      if (limit !== undefined && limit > 0) target.endLine = (offset ?? 0) + limit;
      return base(p.session_id, p.cwd, { targets: [target] });
    }
    case 'read_many_files': {
      if (!Array.isArray(input.include)) return null;
      const targets = input.include
        .filter((e): e is string => typeof e === 'string' && e !== '' && !GLOB_CHARS.test(e))
        .map((path) => ({ path }));
      return base(p.session_id, p.cwd, { targets });
    }
    case 'run_shell_command': {
      const cmd = str(input.command);
      return cmd ? base(p.session_id, p.cwd, { shellCommand: cmd }) : null;
    }
    default:
      return null;
  }
}

function antigravityInput(event: GuardEvent, p: Obj): GuardInput | null {
  if (event === 'finish') return base(p.conversationId, p.cwd);
  const call = isObj(p.toolCall) ? p.toolCall : null;
  if (!call) return null;
  const args = isObj(call.args) ? call.args : {};
  switch (call.name) {
    case 'read_file':
    case 'view_file': {
      const path = str(call.name === 'read_file' ? args.Path : args.AbsolutePath);
      if (!path) return null;
      const end = int(args.EndLine);
      const target: Target = { path };
      if (end !== undefined && end > 0) target.endLine = end;
      return base(p.conversationId, p.cwd, { targets: [target] });
    }
    case 'run_command': {
      const cmd = str(args.CommandLine);
      return cmd ? base(p.conversationId, p.cwd, { shellCommand: cmd }) : null;
    }
    default:
      return null;
  }
}

const claudeDeny = (reason: string): Obj => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: reason,
  },
});

const systemMessage = (d: Decision): Obj | null =>
  d.kind === 'allow' && d.note ? { systemMessage: d.note } : null;

const claude: Adapter = {
  toInput: claudeLike(['Bash'], false),
  render(_e, d) {
    switch (d.kind) {
      case 'allow':
        return systemMessage(d);
      case 'deny':
        return claudeDeny(d.reason);
      case 'halt':
        return { ...claudeDeny(d.message), continue: false, stopReason: d.message };
      case 'block-finish':
        return { decision: 'block', reason: d.reason };
    }
  },
};

const codex: Adapter = {
  toInput: claudeLike(['Bash', 'exec_command'], true),
  render(_e, d) {
    switch (d.kind) {
      case 'allow':
        return null;
      case 'deny':
        return claudeDeny(d.reason);
      case 'halt':
        return claudeDeny(d.message);
      case 'block-finish':
        return { decision: 'block', reason: d.reason };
    }
  },
};

const gemini: Adapter = {
  toInput: geminiInput,
  render(_e, d) {
    switch (d.kind) {
      case 'allow':
        return systemMessage(d);
      case 'deny':
        return { decision: 'deny', reason: d.reason };
      case 'halt':
        return { decision: 'deny', reason: d.message, continue: false, stopReason: d.message };
      case 'block-finish':
        return { decision: 'deny', reason: d.reason };
    }
  },
};

const antigravity: Adapter = {
  toInput: antigravityInput,
  render(_e, d) {
    switch (d.kind) {
      case 'allow':
        return null;
      case 'deny':
        return { decision: 'deny', reason: d.reason };
      case 'halt':
        return { decision: 'deny', reason: d.message };
      case 'block-finish':
        return { decision: 'continue', reason: d.reason };
    }
  },
};

const ADAPTERS: Record<string, Adapter> = { claude, codex, gemini, antigravity };

export const ADAPTER_IDS: string[] = Object.keys(ADAPTERS);

function find(agent: string): Adapter | undefined {
  return Object.hasOwn(ADAPTERS, agent) ? ADAPTERS[agent] : undefined;
}

/** null = payload not understood or tool not gated (caller allows). */
export function toInput(agent: string, event: GuardEvent, payload: unknown): GuardInput | null {
  const adapter = find(agent);
  if (!adapter || !isObj(payload)) return null;
  try {
    return adapter.toInput(event, payload);
  } catch {
    return null;
  }
}

/** Text to print on stdout ('' prints nothing) and process exit code (always 0). */
export function render(
  agent: string,
  event: GuardEvent,
  decision: Decision,
): { stdout: string; exitCode: 0 } {
  const obj = find(agent)?.render(event, decision);
  return { stdout: obj ? `${JSON.stringify(obj)}\n` : '', exitCode: 0 };
}

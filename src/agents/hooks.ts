import type { Agent, Scope } from './registry.js';

/** Raised when an existing hook config cannot be edited safely. The caller adds the path. */
export class HookConfigError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'HookConfigError';
  }
}

export interface HookSpec {
  format: 'nested' | 'flat-finish';
  read: { event: string; matcher: string; command: string };
  finish: { event: string; command: string };
}

type Json = Record<string, unknown>;

const OWNED_PREFIX = 'ctxhead guard';

/** Handlers and commands for one agent and scope, or null when it has no hook config. */
export function hookSpecFor(agent: Agent, scope: Scope): HookSpec | null {
  const hooks = agent[scope].hooks;
  if (!hooks) return null;
  const command = (event: string) => `ctxhead guard --agent ${agent.id} --event ${event}`;
  return {
    format: hooks.format,
    read: { ...hooks.read, command: command('read') },
    finish: { event: hooks.finish.event, command: command('finish') },
  };
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOwned(handler: unknown): boolean {
  return (
    isObject(handler) &&
    typeof handler.command === 'string' &&
    handler.command.startsWith(OWNED_PREFIX)
  );
}

function parseRoot(text: string | null): Json {
  if (text === null || text.trim() === '') return {};
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new HookConfigError('invalid JSON');
  }
  if (!isObject(root)) throw new HookConfigError('top-level value is not an object');
  if (root.hooks !== undefined && !isObject(root.hooks)) {
    throw new HookConfigError('"hooks" is not an object');
  }
  return root;
}

/** Drop owned handlers (nested groups or flat handlers), pruning empties. Mutates `root`. */
function stripOwned(root: Json): void {
  const hooks = root.hooks;
  if (!isObject(hooks)) return;
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    const kept: unknown[] = [];
    for (const entry of groups) {
      if (isOwned(entry)) continue;
      if (isObject(entry) && Array.isArray(entry.hooks)) {
        const inner = entry.hooks.filter((h) => !isOwned(h));
        if (inner.length === 0 && entry.hooks.length > 0) continue;
        if (inner.length !== entry.hooks.length) entry.hooks = inner;
      }
      kept.push(entry);
    }
    if (kept.length === 0) delete hooks[event];
    else hooks[event] = kept;
  }
  if (Object.keys(hooks).length === 0) delete root.hooks;
}

function serialize(root: Json): string {
  return `${JSON.stringify(root, null, 2)}\n`;
}

function append(hooks: Json, event: string, entry: unknown): void {
  const list = hooks[event];
  if (Array.isArray(list)) list.push(entry);
  else hooks[event] = [entry];
}

/** Insert ctxhead's handlers, replacing any it owned before; user entries are never edited. */
export function upsertHooks(text: string | null, spec: HookSpec): string {
  const root = parseRoot(text);
  stripOwned(root);
  const hooks = isObject(root.hooks) ? root.hooks : {};
  root.hooks = hooks;
  const handler = (command: string) => ({ type: 'command', command });
  append(hooks, spec.read.event, {
    matcher: spec.read.matcher,
    hooks: [handler(spec.read.command)],
  });
  append(
    hooks,
    spec.finish.event,
    spec.format === 'flat-finish'
      ? handler(spec.finish.command)
      : { hooks: [handler(spec.finish.command)] },
  );
  return serialize(root);
}

/** Remove ctxhead's handlers. Returns null when nothing is left, so the caller deletes the file. */
export function removeHooks(text: string): string | null {
  const root = parseRoot(text);
  stripOwned(root);
  return Object.keys(root).length === 0 ? null : serialize(root);
}

export function hasOwnedHooks(text: string): boolean {
  let root: Json;
  try {
    root = parseRoot(text);
  } catch {
    return false;
  }
  const before = JSON.stringify(root);
  stripOwned(root);
  return JSON.stringify(root) !== before;
}

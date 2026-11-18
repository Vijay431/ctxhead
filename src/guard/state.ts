import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { SessionState } from './types.js';

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function emptyState(): SessionState {
  return { shown: [], window: [], finishBlocks: 0 };
}

/** State base directory: `$XDG_STATE_HOME` when absolute, else `~/.local/state`. */
export function defaultStateBase(env: NodeJS.ProcessEnv, home: string): string {
  const xdg = env.XDG_STATE_HOME;
  if (xdg && isAbsolute(xdg)) return xdg;
  return join(home, '.local', 'state');
}

/** Path of the state file for one agent session; the session id is stored only as a hash. */
export function sessionFile(stateBase: string, agent: string, sessionId: string): string {
  const hash = createHash('sha256').update(sessionId).digest('hex');
  return join(stateBase, 'ctxhead', 'sessions', `${agent}-${hash}.json`);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Loads session state; a missing, corrupt, or wrongly shaped file yields empty state. */
export function loadState(stateBase: string, agent: string, sessionId: string): SessionState {
  try {
    const parsed: unknown = JSON.parse(
      readFileSync(sessionFile(stateBase, agent, sessionId), 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return emptyState();
    const { shown, window, finishBlocks } = parsed as Record<string, unknown>;
    if (!isStringArray(shown) || !isStringArray(window)) return emptyState();
    if (typeof finishBlocks !== 'number' || !Number.isFinite(finishBlocks)) return emptyState();
    return { shown, window, finishBlocks };
  } catch {
    return emptyState();
  }
}

/** Saves state atomically (temp file + rename), then prunes session files older than 7 days. */
export function saveState(
  stateBase: string,
  agent: string,
  sessionId: string,
  state: SessionState,
  now = Date.now(),
): void {
  const file = sessionFile(stateBase, agent, sessionId);
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.${now}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
  prune(dir, file, now);
}

function prune(dir: string, keep: string, now: number): void {
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      const path = join(dir, name);
      if (path === keep) continue;
      try {
        if (now - statSync(path).mtimeMs > MAX_AGE_MS) unlinkSync(path);
      } catch {
        // ignore: pruning is best effort
      }
    }
  } catch {
    // ignore: pruning is best effort
  }
}

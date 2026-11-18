import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { type HeaderState, inspect } from '../header/inspect.js';
import { commentPrefix } from '../header/syntax.js';
import type { Config } from '../repo/config.js';
import { statusPaths } from '../repo/git.js';
import { buildScope } from '../repo/scope.js';
import type { Decision, SessionState } from './types.js';

/** Consecutive blocked finishes before the guard lets the agent finish anyway (design D6). */
export const FINISH_BLOCK_LIMIT = 3;

interface StaleFile {
  path: string;
  state: HeaderState;
}

async function staleChanged(root: string, config: Config): Promise<StaleFile[]> {
  const scope = buildScope(root, config);
  const found: StaleFile[] = [];
  for (const path of (await statusPaths(root)).sort()) {
    const prefix = commentPrefix(path);
    if (prefix === null || scope.reasonFor(path) !== null) continue;
    const abs = join(root, path);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const { state } = inspect(readFileSync(abs, 'utf8'), prefix);
    if (state !== 'fresh') found.push({ path, state });
  }
  return found;
}

/**
 * Finish gate (design D6). Reads `git status` and files only; never writes in the repository.
 * Blocks while changed in-scope files have non-fresh headers, up to FINISH_BLOCK_LIMIT times.
 */
export async function gateFinish(
  root: string,
  config: Config,
  state: SessionState,
): Promise<{ decision: Decision; state: SessionState }> {
  const stale = await staleChanged(root, config);
  const list = stale.map((f) => `${f.path} (${f.state})`);
  if (stale.length === 0) {
    return { decision: { kind: 'allow' }, state: { ...state, finishBlocks: 0 } };
  }
  if (state.finishBlocks < FINISH_BLOCK_LIMIT) {
    const reason = [
      'ctxhead: these changed files have a missing, invalid, or stale header:',
      ...list,
      'Refresh them by following the ctxhead skill (run `ctxhead stale`, then `ctxhead write`) before finishing.',
    ].join('\n');
    return {
      decision: { kind: 'block-finish', reason },
      state: { ...state, finishBlocks: state.finishBlocks + 1 },
    };
  }
  return {
    decision: {
      kind: 'allow',
      note: `ctxhead: finishing with stale headers after ${FINISH_BLOCK_LIMIT} blocked attempts: ${list.join(', ')}`,
    },
    state: { ...state, finishBlocks: 0 },
  };
}

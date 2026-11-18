import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_FILE, configExists, parseConfig } from '../repo/config.js';
import { findRepoRoot } from '../repo/git.js';
import { gateFinish } from './finish.js';
import { gateRead } from './gate.js';
import { loadState, saveState } from './state.js';
import type { Decision, GuardEvent, GuardInput } from './types.js';

/** Parses a hook payload; null when the text is not valid JSON. */
export function parsePayload(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Fail-open entry point (design D1/D2). Never throws: any fault yields allow.
 * `input` null means the payload could not be parsed or adapted.
 */
export async function evaluate(
  agent: string,
  event: GuardEvent,
  input: GuardInput | null,
  stateBase: string,
): Promise<Decision> {
  try {
    if (!input) return { kind: 'allow' };
    const root = await findRepoRoot(input.cwd);
    if (!root || !configExists(root)) return { kind: 'allow' };
    const config = parseConfig(readFileSync(join(root, CONFIG_FILE), 'utf8'));
    if (!config.enabled) return { kind: 'allow' };
    const state = loadState(stateBase, agent, input.sessionId);
    const result =
      event === 'read'
        ? await gateRead(input, root, config, state)
        : await gateFinish(root, config, state);
    try {
      saveState(stateBase, agent, input.sessionId, result.state);
    } catch {
      // A state write failure must not change the decision.
    }
    return result.decision;
  } catch {
    return { kind: 'allow' };
  }
}

import { parseArgs } from 'node:util';
import { ADAPTER_IDS, render, toInput } from '../guard/adapters.js';
import { evaluate, parsePayload } from '../guard/evaluate.js';
import type { GuardEvent } from '../guard/types.js';
import type { Io } from '../io.js';

const EVENTS: readonly string[] = ['read', 'finish'];

/**
 * Agent hook entry point. Fails open (design D1): any problem prints nothing and exits 0,
 * because Claude, Codex, and Gemini treat exit 2 as a block. Never throws.
 */
export async function guard(args: string[], io: Io): Promise<void> {
  try {
    const { values } = parseArgs({
      args,
      strict: false,
      options: { agent: { type: 'string' }, event: { type: 'string' } },
    });
    const agent = values.agent;
    const event = values.event;
    if (typeof agent !== 'string' || !(ADAPTER_IDS as readonly string[]).includes(agent)) return;
    if (typeof event !== 'string' || !EVENTS.includes(event)) return;

    const payload = parsePayload(await io.readStdin());
    const input = payload === null ? null : toInput(agent, event as GuardEvent, payload);
    const decision = await evaluate(agent, event as GuardEvent, input, io.stateBase);
    const { stdout } = render(agent, event as GuardEvent, decision);
    if (stdout) io.out(stdout);
  } catch {
    // Fail open: print nothing.
  }
}

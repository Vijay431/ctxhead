import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseHeader, splitLines } from '../header/header.js';
import { type HeaderState, inspect } from '../header/inspect.js';
import { commentPrefix } from '../header/syntax.js';
import type { Config } from '../repo/config.js';
import { buildScope, toRepoPath } from '../repo/scope.js';
import { nonFresh, scan } from '../staleness/scan.js';
import { parseShell } from './shell.js';
import type { Decision, GuardInput, SessionState } from './types.js';

interface Halted {
  rel: string;
  state: HeaderState;
}
interface Denied {
  rel: string;
  header: string;
  abs: string;
}

function haltMessage(halts: Halted[]): string {
  const files = halts.map((h) => `${h.rel} (${h.state})`).join('\n');
  return [
    'STOP: do not continue this task.',
    'These files have a stale, invalid, or missing ctxhead header:',
    files,
    'Ask the user to refresh these headers (run the ctxhead skill or `ctxhead stale`), then tell you to resume.',
  ].join('\n');
}

function denyReason(denies: Denied[]): string {
  const shown = denies
    .map((d) => `ctxhead: showing the header of ${d.rel} instead of its body.\n${d.header}`)
    .join('\n\n');
  return `${shown}\n\nRe-issue the read only if the header does not settle your question.`;
}

/**
 * Read-first gate (design D2). Pure over the repo: reads files, never writes in the repo.
 * Returns a new state; `state` is not mutated. Callers fail open for no repo, no config,
 * disabled, or bad payload, and load/save state.
 *
 * A halt beats a deny. When a call halts, files that would have been denied in the same call
 * are not added to `shown`, so the agent still sees their headers on the next attempt.
 */
export async function gateRead(
  input: GuardInput,
  root: string,
  config: Config,
  state: SessionState,
): Promise<{ decision: Decision; state: SessionState }> {
  const next: SessionState = {
    shown: [...state.shown],
    window: [...state.window],
    finishBlocks: state.finishBlocks,
  };
  const allow = (): { decision: Decision; state: SessionState } => ({
    decision: { kind: 'allow' },
    state: next,
  });

  let targets = input.targets;
  if (input.shellCommand !== undefined) {
    const parsed = parseShell(input.shellCommand);
    if (parsed === null) return allow();
    if (parsed.staleRun) {
      const stale = nonFresh(await scan(root, config, true));
      for (const file of stale) {
        const abs = join(root, file.path);
        if (!next.window.includes(abs)) next.window.push(abs);
      }
    }
    targets = [...targets, ...parsed.targets];
  }

  const scope = buildScope(root, config);
  const halts: Halted[] = [];
  const denies: Denied[] = [];

  for (const target of targets) {
    const rel = toRepoPath(root, input.cwd, target.path);
    if (rel === null || scope.reasonFor(rel) !== null) continue;
    const abs = join(root, rel);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const prefix = commentPrefix(rel);
    if (prefix === null) continue;

    const text = readFileSync(abs, 'utf8');
    const { state: headerState } = inspect(text, prefix);

    if (next.window.includes(abs)) {
      if (headerState === 'fresh') {
        next.window = next.window.filter((p) => p !== abs);
        if (!next.shown.includes(abs)) next.shown.push(abs);
      }
      continue;
    }
    if (headerState !== 'fresh') {
      if (!halts.some((h) => h.rel === rel)) halts.push({ rel, state: headerState });
      continue;
    }
    if (next.shown.includes(abs)) continue;

    const lines = splitLines(text);
    const header = parseHeader(lines, prefix);
    if (header === null) continue;
    if (target.endLine !== undefined && target.endLine <= header.end) {
      next.shown.push(abs);
      continue;
    }
    if (!denies.some((d) => d.abs === abs)) {
      denies.push({ rel, abs, header: lines.slice(header.start, header.end).join('\n') });
    }
  }

  if (halts.length > 0) {
    return { decision: { kind: 'halt', message: haltMessage(halts) }, state: next };
  }
  if (denies.length > 0) {
    for (const d of denies) if (!next.shown.includes(d.abs)) next.shown.push(d.abs);
    return { decision: { kind: 'deny', reason: denyReason(denies) }, state: next };
  }
  return allow();
}

import { parseArgs } from 'node:util';
import { CliError } from '../errors.js';
import type { Io } from '../io.js';
import { type Config, writeConfig } from '../repo/config.js';
import { loadRepo } from '../repo/context.js';
import { estimateTokens, type FileResult, nonFresh, scan } from '../staleness/scan.js';

const DISABLED = 'ctxhead is disabled in this repository. Run `ctxhead enable` to turn it on.\n';

function describe(file: FileResult): string {
  const detail = file.rules.map((rule) => `  [${rule.id}] ${rule.message}`).join('\n');
  return `${file.state.padEnd(8)} ${file.path}${detail ? `\n${detail}` : ''}`;
}

export async function stale(args: string[], io: Io): Promise<void> {
  const { values } = parseArgs({ args, options: { json: { type: 'boolean' } } });
  const { root, config } = await loadRepo(io.cwd);

  if (!config.enabled) {
    if (values.json)
      io.out(`${JSON.stringify({ enabled: false, files: [], estimatedTokens: 0 })}\n`);
    else io.out(DISABLED);
    return;
  }

  const result = await scan(root, config, true);
  const pending = nonFresh(result);
  const estimatedTokens = estimateTokens(pending);

  if (pending.length === 0) {
    if (result.head && config.lastRunSha !== result.head) {
      const updated: Config = { ...config, lastRunSha: result.head };
      writeConfig(root, updated);
    }
  }

  if (values.json) {
    const files = pending.map(({ path, state, rules }) => ({ path, state, rules }));
    io.out(`${JSON.stringify({ enabled: true, files, estimatedTokens })}\n`);
  } else if (pending.length === 0) {
    io.out('All headers are fresh.\n');
  } else {
    io.out(`${pending.map(describe).join('\n')}\n\n`);
    io.out(
      `${pending.length} file(s) need a header (estimate: ~${estimatedTokens} tokens to read and refresh).\n`,
    );
  }
}

export async function check(_args: string[], io: Io): Promise<void> {
  const { root, config } = await loadRepo(io.cwd);
  if (!config.enabled) {
    io.out(DISABLED);
    return;
  }
  const result = await scan(root, config, false);
  const problems = nonFresh(result);
  if (problems.length === 0) {
    io.out(`OK: ${result.inScope} file(s) checked, all headers fresh.\n`);
    return;
  }
  io.out(`${problems.map(describe).join('\n')}\n`);
  throw new CliError(
    `${problems.length} of ${result.inScope} file(s) have missing, invalid, or stale headers.`,
  );
}

export async function status(_args: string[], io: Io): Promise<void> {
  const { root, config } = await loadRepo(io.cwd);
  const lines = [
    `ctxhead: ${config.enabled ? 'enabled' : 'disabled'}`,
    `include: ${config.include.length > 0 ? config.include.join(', ') : '(none)'}`,
  ];
  const result = await scan(root, config, false);
  const count = (state: string) => result.files.filter((file) => file.state === state).length;
  lines.push(
    `in scope: ${result.inScope} file(s)`,
    `missing: ${count('missing')}  stale: ${count('stale')}  invalid: ${count('invalid')}`,
  );
  io.out(`${lines.join('\n')}\n`);
}

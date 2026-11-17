import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CliError } from '../errors.js';
import type { Io } from '../io.js';
import { writeConfig } from '../repo/config.js';
import { loadRepo } from '../repo/context.js';
import { toRepoPath } from '../repo/scope.js';

function requirePaths(args: string[], verb: string): string[] {
  const paths = args.filter((arg) => !arg.startsWith('-'));
  if (paths.length === 0) throw new CliError(`Usage: ctxhead ${verb} <path...>`);
  return paths;
}

export async function add(args: string[], io: Io): Promise<void> {
  const inputs = requirePaths(args, 'add');
  const { root, config } = await loadRepo(io.cwd);

  const additions: string[] = [];
  for (const input of inputs) {
    const path = toRepoPath(root, io.cwd, input);
    if (path === null) throw new CliError(`${input} is outside the repository.`);
    if (!existsSync(join(root, path))) throw new CliError(`${input} does not exist.`);
    const entry = path === '' ? '.' : path;
    if (!config.include.includes(entry) && !additions.includes(entry)) additions.push(entry);
  }

  if (additions.length > 0) {
    config.include = [...config.include, ...additions].sort();
    writeConfig(root, config);
  }
  for (const entry of additions) io.out(`added    ${entry}\n`);
  if (additions.length === 0) io.out('Nothing to add; already included.\n');
}

export async function remove(args: string[], io: Io): Promise<void> {
  const inputs = requirePaths(args, 'remove');
  const { root, config } = await loadRepo(io.cwd);

  const removals = new Set<string>();
  for (const input of inputs) {
    const path = toRepoPath(root, io.cwd, input);
    if (path === null) throw new CliError(`${input} is outside the repository.`);
    const entry = path === '' ? '.' : path;
    if (config.include.includes(entry)) removals.add(entry);
    else io.err(`${input} is not in the include list.\n`);
  }

  if (removals.size > 0) {
    config.include = config.include.filter((entry) => !removals.has(entry));
    writeConfig(root, config);
  }
  for (const entry of removals) io.out(`removed  ${entry}\n`);
}

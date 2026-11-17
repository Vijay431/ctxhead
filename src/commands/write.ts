import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CliError } from '../errors.js';
import { deriveName } from '../header/header.js';
import { stamp } from '../header/inspect.js';
import { commentPrefix } from '../header/syntax.js';
import type { Io } from '../io.js';
import { loadRepo } from '../repo/context.js';
import { buildScope, toRepoPath } from '../repo/scope.js';

const REFUSALS: Record<string, string> = {
  'outside-repository': 'the file is outside the repository',
  'unsupported-language': 'the file type has no supported line-comment syntax',
  ignored: 'the file is excluded by .ctxignore or .gitignore',
  'not-included': 'the file is not under a path added with `ctxhead add`',
};

export async function write(args: string[], io: Io): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { name: { type: 'string' }, description: { type: 'string' } },
  });
  const [input] = positionals;
  if (positionals.length !== 1 || input === undefined || values.description === undefined) {
    throw new CliError('Usage: ctxhead write <file> [--name <name>] --description <text>');
  }

  const { root, config } = await loadRepo(io.cwd);
  if (!config.enabled) {
    throw new CliError('ctxhead is disabled in this repository. Run `ctxhead enable` first.');
  }

  const path = toRepoPath(root, io.cwd, input) ?? '..';
  const reason = buildScope(root, config).reasonFor(path);
  if (reason) throw new CliError(`refused ${input}: ${reason} (${REFUSALS[reason]})`);
  if (!existsSync(join(root, path))) throw new CliError(`${input} does not exist.`);

  const file = join(root, path);
  const description = values.description.replace(/\s+/g, ' ').trim();
  const name = values.name ?? deriveName(path);
  const result = stamp(
    readFileSync(file, 'utf8'),
    commentPrefix(path) as string,
    name,
    description,
  );

  if ('rules' in result) {
    for (const rule of result.rules) io.err(`rule ${rule.id}: ${rule.message}\n`);
    throw new CliError(`${input} was not changed.`, 2);
  }
  writeFileSync(file, result.text);
  io.out(`wrote    ${path}\n`);
}

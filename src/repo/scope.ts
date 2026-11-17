import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { commentPrefix } from '../header/syntax.js';
import type { Config } from './config.js';
import { candidateFiles } from './git.js';

export const CTXIGNORE_FILE = '.ctxignore';

export type OutOfScopeReason =
  | 'outside-repository'
  | 'unsupported-language'
  | 'ignored'
  | 'not-included';

export interface Scope {
  /** Why `path` is out of scope, or null when it is in scope. `path` is repo-relative, posix. */
  reasonFor(path: string): OutOfScopeReason | null;
}

function loadIgnore(root: string, name: string): Ignore {
  const matcher = ignore();
  const path = join(root, name);
  if (existsSync(path)) matcher.add(readFileSync(path, 'utf8'));
  return matcher;
}

/** Converts a user path (relative to `cwd`) to a repo-relative posix path, or null if outside. */
export function toRepoPath(root: string, cwd: string, input: string): string | null {
  const rel = relative(root, resolve(cwd, input));
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return rel.split(sep).join('/');
}

/** In scope = included path, not in .ctxignore, not in .gitignore, supported comment syntax. */
export function buildScope(root: string, config: Config): Scope {
  const ctxignore = loadIgnore(root, CTXIGNORE_FILE);
  const gitignore = loadIgnore(root, '.gitignore');
  const includes = config.include.map((entry) => entry.replace(/\/+$/, ''));

  return {
    reasonFor(path) {
      if (path === '' || path.startsWith('../') || isAbsolute(path)) return 'outside-repository';
      if (commentPrefix(path) === null) return 'unsupported-language';
      if (path.startsWith('.git/') || ctxignore.ignores(path) || gitignore.ignores(path)) {
        return 'ignored';
      }
      const included = includes.some(
        (entry) => entry === '.' || path === entry || path.startsWith(`${entry}/`),
      );
      return included ? null : 'not-included';
    },
  };
}

/** Every in-scope file that exists in the working tree, repo-relative and sorted. */
export async function listInScope(root: string, config: Config): Promise<string[]> {
  const scope = buildScope(root, config);
  const files = await candidateFiles(root);
  return files
    .filter((file) => scope.reasonFor(file) === null && existsSync(join(root, file)))
    .sort();
}

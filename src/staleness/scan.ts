import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Rule } from '../header/header.js';
import { type HeaderState, hasHeader, inspect } from '../header/inspect.js';
import { commentPrefix } from '../header/syntax.js';
import type { Config } from '../repo/config.js';
import { changedSince, headSha, isAncestorOfHead, untrackedFiles } from '../repo/git.js';
import { listInScope } from '../repo/scope.js';

export interface FileResult {
  path: string;
  state: HeaderState;
  rules: Rule[];
  bytes: number;
}

export interface ScanResult {
  inScope: number;
  files: FileResult[];
  head: string | null;
}

/** Tokens an agent spends per file to write the description back (estimate). */
export const DESCRIPTION_ALLOWANCE_TOKENS = 60;

export function estimateTokens(files: FileResult[]): number {
  return files.reduce(
    (sum, file) => sum + Math.ceil(file.bytes / 4) + DESCRIPTION_ALLOWANCE_TOKENS,
    0,
  );
}

/**
 * Classifies in-scope files. With `narrow`, files unchanged since a reachable `lastRunSha`
 * are only checked for a missing header; everything else gets the full classification.
 */
export async function scan(root: string, config: Config, narrow: boolean): Promise<ScanResult> {
  const paths = await listInScope(root, config);
  const head = await headSha(root);

  let changed: Set<string> | null = null;
  if (narrow && config.lastRunSha && (await isAncestorOfHead(root, config.lastRunSha))) {
    changed = new Set([
      ...(await changedSince(root, config.lastRunSha)),
      ...(await untrackedFiles(root)),
    ]);
  }

  const files: FileResult[] = [];
  for (const path of paths) {
    const text = readFileSync(join(root, path), 'utf8');
    const prefix = commentPrefix(path) as string;
    const bytes = Buffer.byteLength(text);
    if (changed && !changed.has(path)) {
      if (!hasHeader(text, prefix)) files.push({ path, state: 'missing', rules: [], bytes });
      continue;
    }
    files.push({ path, ...inspect(text, prefix), bytes });
  }
  return { inScope: paths.length, files, head };
}

export function nonFresh(result: ScanResult): FileResult[] {
  return result.files.filter((file) => file.state !== 'fresh');
}

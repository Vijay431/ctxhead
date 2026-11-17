import { type Config, readConfig } from './config.js';
import { requireRepoRoot } from './git.js';

export interface RepoContext {
  root: string;
  config: Config;
}

/** Resolves the git root and loads `.ctxhead.json`; fails with a `ctxhead init` hint when missing. */
export async function loadRepo(cwd: string): Promise<RepoContext> {
  const root = await requireRepoRoot(cwd);
  return { root, config: readConfig(root) };
}

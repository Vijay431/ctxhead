import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import { CliError } from '../errors.js';

const execFileAsync = promisify(execFile);

interface GitResult {
  ok: boolean;
  stdout: string;
}

async function git(cwd: string, args: string[]): Promise<GitResult> {
  try {
    const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 256 * 1024 * 1024 });
    return { ok: true, stdout };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new CliError('git is required but was not found on PATH.');
    }
    return { ok: false, stdout: '' };
  }
}

/** Returns the git repository root containing `cwd`, or null outside a repository. */
export async function findRepoRoot(cwd: string): Promise<string | null> {
  const result = await git(cwd, ['rev-parse', '--show-toplevel']);
  return result.ok ? realpathSync(result.stdout.trim()) : null;
}

export async function requireRepoRoot(cwd: string): Promise<string> {
  const root = await findRepoRoot(cwd);
  if (!root) throw new CliError('Not inside a git repository.');
  return root;
}

/** HEAD commit, or null when the repository has no commits. */
export async function headSha(root: string): Promise<string | null> {
  const result = await git(root, ['rev-parse', '--verify', '-q', 'HEAD']);
  return result.ok ? result.stdout.trim() : null;
}

export async function isAncestorOfHead(root: string, sha: string): Promise<boolean> {
  const result = await git(root, ['merge-base', '--is-ancestor', sha, 'HEAD']);
  return result.ok;
}

function splitNul(output: string): string[] {
  return output.split('\0').filter((entry) => entry.length > 0);
}

/** Paths changed between `sha` and the working tree (repo-relative). */
export async function changedSince(root: string, sha: string): Promise<string[]> {
  const result = await git(root, ['diff', '--name-only', '-z', sha]);
  return splitNul(result.stdout);
}

/** Untracked files that are not gitignored. */
export async function untrackedFiles(root: string): Promise<string[]> {
  const result = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  return splitNul(result.stdout);
}

/** Tracked plus untracked-but-not-ignored files. */
export async function candidateFiles(root: string): Promise<string[]> {
  const result = await git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  return [...new Set(splitNul(result.stdout))];
}

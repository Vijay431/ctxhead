import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { run } from '../../src/app.js';
import type { Choice, Io } from '../../src/io.js';

export interface TestEnv {
  /** Temporary git repository root. */
  repo: string;
  /** Temporary HOME. */
  home: string;
  /** Temporary guard state directory. */
  stateBase: string;
  /** Runs the CLI in-process from `cwd` (default: repo root). */
  cli(args: string[], options?: CliOptions): Promise<CliResult>;
  write(path: string, content: string): void;
}

export interface CliOptions {
  cwd?: string;
  interactive?: boolean;
  /** Ids the injected picker returns; receives the preselected ids through `picked.preselected`. */
  pick?: string[];
  /** Text the injected stdin yields (default empty). */
  stdin?: string;
}

export interface CliResult {
  code: number;
  out: string;
  err: string;
  preselected: string[] | null;
  offered: string[] | null;
}

export function tempDir(prefix = 'ctxhead-'): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

export function gitInit(dir: string): void {
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
}

export function gitCommitAll(dir: string, message = 'commit'): string {
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', message], { cwd: dir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir }).toString().trim();
}

export function createEnv(): TestEnv {
  const repo = tempDir('ctxhead-repo-');
  const home = tempDir('ctxhead-home-');
  const stateBase = tempDir('ctxhead-state-');
  gitInit(repo);

  const write = (path: string, content: string) => {
    const full = join(repo, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  };

  return {
    repo,
    home,
    stateBase,
    write,
    async cli(args, options = {}) {
      let out = '';
      let err = '';
      const result: CliResult = { code: 0, out: '', err: '', preselected: null, offered: null };
      const io: Io = {
        cwd: options.cwd ?? repo,
        home,
        interactive: options.interactive ?? false,
        stateBase,
        readStdin: async () => options.stdin ?? '',
        out: (text) => {
          out += text;
        },
        err: (text) => {
          err += text;
        },
        async pick(_message: string, choices: Choice[], preselected: string[]) {
          result.preselected = preselected;
          result.offered = choices.map((choice) => choice.id);
          return options.pick ?? preselected;
        },
      };
      result.code = await run(args, io);
      result.out = out;
      result.err = err;
      return result;
    },
  };
}

import { init } from './commands/init.js';
import { install, uninstall, update } from './commands/install.js';
import { add, remove } from './commands/paths.js';
import { check, stale, status } from './commands/staleness.js';
import { setEnabled } from './commands/toggle.js';
import { write } from './commands/write.js';
import { CliError } from './errors.js';
import type { Io } from './io.js';
import { packageVersion } from './version.js';

type Command = (args: string[], io: Io) => Promise<void>;

const COMMANDS: Record<string, Command> = {
  install,
  update,
  uninstall,
  init,
  add,
  remove,
  enable: (_args, io) => setEnabled(true, io),
  disable: (_args, io) => setEnabled(false, io),
  status,
  stale,
  write,
  check,
};

export const HELP = `ctxhead - short file headers so AI agents read ~15 lines instead of whole files

Usage: ctxhead <command> [options]

Agent setup (exactly one of --global or --project):
  install --global|--project [--tools claude,codex,gemini,antigravity]
  update --global|--project  regenerate installed files
  uninstall --global|--project  remove ctxhead-owned files and blocks

Repository setup:
  init                       create .ctxignore and .ctxhead.json
  add <path...>              choose files or folders that get headers
  remove <path...>           stop adding headers under these paths
  enable | disable           allow or block header writes
  status                     show scope and header health

Used by agent skills:
  stale [--json]             list files whose header is missing, invalid, or stale
  write <file> [--name <n>] --description <text>
                             validate and stamp a header
  check                      read-only gate for CI (exit 1 on problems)

Options:
  -h, --help                 show this help
  -v, --version              show the version

Exit codes: 0 success, 1 failure, 2 validation rejected by write.
`;

/** Runs the CLI and returns the process exit code. */
export async function run(argv: string[], io: Io): Promise<number> {
  const [first, ...rest] = argv;
  try {
    if (first === undefined || first === '--help' || first === '-h' || first === 'help') {
      io.out(HELP);
      return 0;
    }
    if (first === '--version' || first === '-v') {
      io.out(`${packageVersion()}\n`);
      return 0;
    }
    const command = Object.hasOwn(COMMANDS, first) ? COMMANDS[first] : undefined;
    if (!command) {
      throw new CliError(`Unknown command: ${first}\nRun \`ctxhead --help\` for usage.`);
    }
    if (rest.includes('--help') || rest.includes('-h')) {
      io.out(HELP);
      return 0;
    }
    await command(rest, io);
    return 0;
  } catch (error) {
    if (error instanceof CliError) {
      io.err(`${error.message}\n`);
      return error.exitCode;
    }
    if ((error as NodeJS.ErrnoException).code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      io.err(`${(error as Error).message}\n`);
      return 1;
    }
    io.err(`Unexpected error: ${(error as Error).message}\n`);
    return 1;
  }
}

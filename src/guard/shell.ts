import type { Target } from './types.js';

/** What a shell command reads (design D9) and whether it runs `ctxhead stale` (design D4). */
export interface ShellParse {
  targets: Target[];
  staleRun: boolean;
}

const READERS = new Set(['cat', 'head', 'tail', 'sed', 'less', 'more', 'bat', 'awk', 'nl']);
const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Split a command into simple commands (word lists). Null when it holds anything we cannot parse. */
function tokenize(input: string): string[][] | null {
  const commands: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let skipNext = false; // next word is a redirect target, not a read

  const endWord = (): void => {
    if (inWord) {
      if (skipNext) skipNext = false;
      else words.push(word);
    }
    word = '';
    inWord = false;
  };
  const endCommand = (): void => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i] as string;
    const next = input[i + 1];
    if (c === "'") {
      const end = input.indexOf("'", i + 1);
      if (end < 0) return null;
      word += input.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (c === '"') {
      inWord = true;
      i++;
      while (i < input.length && input[i] !== '"') {
        const d = input[i] as string;
        if (d === '`' || (d === '$' && input[i + 1] === '(')) return null;
        if (d === '\\' && i + 1 < input.length && '"\\$`'.includes(input[i + 1] as string)) {
          word += input[++i];
        } else {
          word += d;
        }
        i++;
      }
      if (i >= input.length) return null;
    } else if (c === '\\') {
      if (next === undefined) return null;
      word += next;
      inWord = true;
      i++;
    } else if (c === '`' || c === '(' || c === ')' || c === '<') {
      return null;
    } else if (c === '$' && next === '(') {
      return null;
    } else if (c === '|' || c === ';' || c === '\n' || c === '&') {
      if (c === '&' && next === '>') {
        i++; // `&>` redirect
        if (input[i + 1] === '>') i++;
        endWord();
        skipNext = true;
        continue;
      }
      endCommand();
      if ((c === '|' || c === '&') && next === c) i++;
    } else if (c === '>') {
      if (inWord && /^\d+$/.test(word)) {
        word = ''; // `2>` file descriptor prefix
        inWord = false;
      } else {
        endWord();
      }
      if (next === '>') i++;
      if (input[i + 1] === '&') i++; // `2>&1`
      skipNext = true;
    } else if (c === ' ' || c === '\t') {
      endWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  endCommand();
  return commands;
}

const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

/** `ctxhead stale`, `npx [-y] ctxhead stale`, `pnpm exec|dlx ctxhead stale`. */
function isStale(argv: string[]): boolean {
  let rest = argv.slice(1);
  const prog = basename(argv[0] ?? '');
  if (prog === 'npx' || prog === 'pnpx') {
    while (rest[0]?.startsWith('-')) rest = rest.slice(1);
  } else if (prog === 'pnpm' && (rest[0] === 'exec' || rest[0] === 'dlx')) {
    rest = rest.slice(1);
    while (rest[0]?.startsWith('-')) rest = rest.slice(1);
  } else if (prog !== 'ctxhead') {
    return false;
  }
  if (prog !== 'ctxhead') {
    if (rest[0] !== 'ctxhead') return false;
    rest = rest.slice(1);
  }
  return rest[0] === 'stale';
}

/** Files one reader command opens. `args` excludes the program name. */
function readTargets(prog: string, args: string[]): Target[] {
  const targets: Target[] = [];
  let endLine: number | undefined;
  let scriptGiven = prog !== 'sed' && prog !== 'awk';
  let flagsDone = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (flagsDone || a === '-' || !a.startsWith('-')) {
      if (!scriptGiven)
        scriptGiven = true; // first positional is the sed/awk script
      else if (a !== '-' && a !== '') targets.push({ path: a });
      continue;
    }
    if (a === '--') {
      flagsDone = true;
    } else if ((prog === 'head' || prog === 'tail') && /^-\d+$/.test(a)) {
      if (prog === 'head') endLine = Number(a.slice(1));
    } else if ((prog === 'head' || prog === 'tail') && /^(-n|-c|--lines=|--bytes=)/.test(a)) {
      const m = /^(-n|-c|--lines=|--bytes=)(.*)$/.exec(a);
      const attached = m?.[2] ?? '';
      const value = attached || (args[++i] ?? '');
      if (prog === 'head' && /^(-n|--lines=)$/.test(m?.[1] ?? '') && /^\d+$/.test(value)) {
        endLine = Number(value);
      }
    } else if (prog === 'sed' && /^-[a-zA-Z]*[ef]$/.test(a)) {
      scriptGiven = true; // value is the script (or script file); not a read target
      i++;
    } else if (prog === 'awk' && (a === '-f' || a === '-F' || a === '-v')) {
      if (a === '-f') scriptGiven = true;
      i++;
    }
  }
  return targets.map((t) => (endLine === undefined ? t : { ...t, endLine }));
}

/** Parse a shell command. Null means unparseable; the caller allows it. */
export function parseShell(command: string): ShellParse | null {
  const commands = tokenize(command);
  if (commands === null) return null;
  const targets: Target[] = [];
  let staleRun = false;

  for (const words of commands) {
    let argv = words;
    while (argv.length > 0 && (ENV_ASSIGN.test(argv[0] as string) || argv[0] === 'sudo')) {
      argv = argv.slice(1);
    }
    if (argv.length === 0) continue;
    if (isStale(argv)) staleRun = true;
    const prog = basename(argv[0] as string);
    if (READERS.has(prog)) targets.push(...readTargets(prog, argv.slice(1)));
  }
  return { targets, staleRun };
}

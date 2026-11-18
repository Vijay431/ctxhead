import { describe, expect, it } from 'vitest';
import { parseShell, type ShellParse } from '../src/guard/shell.js';

const paths = (...ps: string[]): ShellParse => ({
  targets: ps.map((path) => ({ path })),
  staleRun: false,
});
const none = paths();
const stale: ShellParse = { targets: [], staleRun: true };

describe('parseShell', () => {
  it.each<[string, ShellParse | null]>([
    ['cat a | grep x', paths('a')],
    ['head -n 5 a', { targets: [{ path: 'a', endLine: 5 }], staleRun: false }],
    ['head -5 a', { targets: [{ path: 'a', endLine: 5 }], staleRun: false }],
    ['sed -n 1,9p a', paths('a')],
    ["awk '{print}' a", paths('a')],
    ['cat "my file.ts"', paths('my file.ts')],
    ["cat 'a b'", paths('a b')],
    ['cat a\\ b', paths('a b')],
    ['FOO=1 cat a', paths('a')],
    ['/bin/cat a', paths('a')],
    ['sudo cat a', paths('a')],
    [
      'cat a && head -3 b',
      {
        targets: [{ path: 'a' }, { path: 'b', endLine: 3 }],
        staleRun: false,
      },
    ],
    ['tail -n 5 a', paths('a')],
    ['cat a > out.txt', paths('a')],
    ['cat a 2>/dev/null', paths('a')],
    ['sed -e 1p a', paths('a')],
    ['awk -f prog.awk a', paths('a')],
    ['pnpm test', none],
    ['ctxhead stale', stale],
    ['npx ctxhead stale', stale],
    ['ctxhead stale --json', stale],
    ['npx ctxhead stale --json', stale],
    ['npx -y ctxhead stale', stale],
    ['pnpm exec ctxhead stale', stale],
    ['ctxhead write a --description x', none],
    ['git stale', none],
    ['echo $(cat a)', null],
    ['echo `cat a`', null],
    ['cat <<EOF', null],
    ['cat <(ls)', null],
    ['cat "unbalanced', null],
  ])('%s', (command, expected) => {
    expect(parseShell(command)).toEqual(expected);
  });
});

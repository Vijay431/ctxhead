import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED = new Set(['package.json', 'README.md', 'LICENSE', 'NOTICE']);

interface PackResult {
  files: { path: string }[];
}

function packDryRun(): PackResult {
  const stdout = execFileSync('pnpm', ['pack', '--dry-run', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const start = stdout.search(/^[{[]/m);
  expect(start).toBeGreaterThanOrEqual(0);
  const parsed: PackResult | PackResult[] = JSON.parse(stdout.slice(start));
  return Array.isArray(parsed) ? (parsed[0] as PackResult) : parsed;
}

describe('npm package contents', () => {
  it('ships only dist/, package.json, README.md, LICENSE and NOTICE', () => {
    const paths = packDryRun().files.map((f) => f.path);
    expect(paths).toContain('LICENSE');
    expect(paths).toContain('NOTICE');
    const unexpected = paths.filter((p) => !ALLOWED.has(p) && !p.startsWith('dist/'));
    expect(unexpected).toEqual([]);
  }, 120_000);
});

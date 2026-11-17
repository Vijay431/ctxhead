import { readFileSync } from 'node:fs';

/** Package version, read from the package.json next to `src/` or `dist/`. */
export function packageVersion(): string {
  const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  return (JSON.parse(raw) as { version: string }).version;
}

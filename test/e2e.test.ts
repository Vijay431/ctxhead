import { describe, expect, it } from 'vitest';
import { createEnv } from './helpers/env.js';

describe('end to end', () => {
  it('install -> init -> add -> enable -> stale -> write -> check', async () => {
    const env = createEnv();
    env.write('src/a.ts', 'export const a = 1;\n');
    env.write('src/b.py', 'b = 2\n');
    env.write('src/c.json', '{}');
    env.write('docs/readme.ts', 'x\n');

    expect((await env.cli(['install', '--project', '--tools', 'claude'])).code).toBe(0);
    expect((await env.cli(['init'])).code).toBe(0);
    expect((await env.cli(['add', 'src'])).code).toBe(0);
    expect((await env.cli(['enable'])).code).toBe(0);
    expect((await env.cli(['check'])).code).toBe(1);

    const listed = JSON.parse((await env.cli(['stale', '--json'])).out);
    expect(listed.files.map((f: { path: string }) => f.path)).toEqual(['src/a.ts', 'src/b.py']);
    for (const { path } of listed.files) {
      const r = await env.cli([
        'write',
        path,
        '--description',
        `Describes ${path}. Open when testing.`,
      ]);
      expect(r.code).toBe(0);
    }
    expect(JSON.parse((await env.cli(['stale', '--json'])).out).files).toEqual([]);
    expect((await env.cli(['check'])).code).toBe(0);
  });
});

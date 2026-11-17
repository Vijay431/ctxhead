import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEnv } from './helpers/env.js';

const BODIES: Record<string, { ext: string; body: string }> = {
  ts: { ext: 'ts', body: 'export const x = 1;\n' },
  python: { ext: 'py', body: 'x = 1\n' },
};

describe('docs/header-format.md', () => {
  it('every example header passes ctxhead check as written', async () => {
    const doc = readFileSync(new URL('../docs/header-format.md', import.meta.url), 'utf8');
    const examples = [...doc.matchAll(/```(ts|python)\n([\s\S]*?)```/g)];
    expect(examples.length).toBeGreaterThanOrEqual(2);

    const env = createEnv();
    await env.cli(['init']);
    await env.cli(['add', '.']);
    await env.cli(['enable']);
    examples.forEach(([, lang, header], i) => {
      const { ext, body } = BODIES[lang as string] as { ext: string; body: string };
      env.write(`ex${i}.${ext}`, `${(header as string).trimEnd()}\n\n${body}`);
    });
    const result = await env.cli(['check']);
    expect(result.out).toContain(`OK: ${examples.length} file(s)`);
    expect(result.code).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import { createEnv } from './helpers/env.js';

describe('test helper', () => {
  it('creates a git repo and temporary HOME and runs the CLI in-process', async () => {
    const env = createEnv();
    const result = await env.cli(['--help']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Usage: ctxhead');
    expect(env.repo).not.toBe(env.home);
  });
});

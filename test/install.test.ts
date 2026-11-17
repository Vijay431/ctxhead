import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasBlock, removeBlock, upsertBlock } from '../src/agents/blocks.js';
import { CLAUDE_COMMAND, COMMAND_BODY, SKILL } from '../src/templates/index.js';
import { createEnv } from './helpers/env.js';

const read = (dir: string, p: string) => readFileSync(join(dir, p), 'utf8');

describe('templates', () => {
  it('skill has valid Agent Skills frontmatter', () => {
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(SKILL)?.[1] ?? '';
    const name = /^name: (.+)$/m.exec(fm)?.[1] ?? '';
    const desc = /^description: (.+)$/m.exec(fm)?.[1] ?? '';
    expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(desc.length).toBeGreaterThan(0);
    expect(desc.length).toBeLessThanOrEqual(1024);
    expect(fm).toContain('ctxhead-managed: v1');
  });
  it('command only defers to the skill', () => {
    expect(CLAUDE_COMMAND).toContain(COMMAND_BODY);
    expect(COMMAND_BODY).toMatch(/ctxhead skill/);
    expect(CLAUDE_COMMAND).not.toContain('ctxhead write');
  });
});

describe('block editor', () => {
  it('appends once, replaces in place, preserves outside bytes, removes cleanly', () => {
    const user = '# Mine\n\nrules here\n';
    const one = upsertBlock(user, 'A');
    expect(one.startsWith(user)).toBe(true);
    const two = upsertBlock(`${one}tail\n`, 'B');
    expect(two.match(/ctxhead:start/g)).toHaveLength(1);
    expect(two).toContain('B');
    expect(two.endsWith('tail\n')).toBe(true);
    expect(removeBlock(one)).toBe(user);
    expect(removeBlock(two)).toBe(`${user}\ntail\n`);
    expect(hasBlock(removeBlock(two))).toBe(false);
  });
});

describe('install', () => {
  it('rejects unknown tools without writing', async () => {
    const env = createEnv();
    const r = await env.cli(['install', '--project', '--tools', 'claude,cursor']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('cursor');
    expect(r.err).toContain('claude');
    expect(existsSync(join(env.repo, '.claude'))).toBe(false);
  });
  it('requires --tools when non-interactive', async () => {
    const env = createEnv();
    const r = await env.cli(['install', '--project']);
    expect(r.code).toBe(1);
    expect(r.err).toContain('--tools');
  });
  it('requires exactly one scope', async () => {
    const env = createEnv();
    expect((await env.cli(['install', '--tools', 'claude'])).code).toBe(1);
    expect((await env.cli(['install', '--global', '--project', '--tools', 'claude'])).code).toBe(1);
  });
  it('fails outside a git repository', async () => {
    const env = createEnv();
    const { tempDir } = await import('./helpers/env.js');
    const r = await env.cli(['install', '--project', '--tools', 'claude'], {
      cwd: tempDir('nogit-'),
    });
    expect(r.code).toBe(1);
  });
  it('installs at repo root from a subfolder, with shim and summary', async () => {
    const env = createEnv();
    mkdirSync(join(env.repo, 'src/lib'), { recursive: true });
    env.write('CLAUDE.md', '# Mine\n');
    const r = await env.cli(['install', '--project', '--tools', 'claude'], {
      cwd: join(env.repo, 'src/lib'),
    });
    expect(r.code).toBe(0);
    expect(existsSync(join(env.repo, '.claude/skills/ctxhead/SKILL.md'))).toBe(true);
    expect(existsSync(join(env.repo, '.claude/commands/ctxhead.md'))).toBe(true);
    expect(read(env.repo, 'AGENTS.md')).toContain('ctxhead:start');
    expect(read(env.repo, 'CLAUDE.md')).toMatch(/^# Mine\n[\s\S]*@AGENTS\.md/);
    expect(r.out).toContain('.claude/skills/ctxhead/SKILL.md');
    expect(r.out).not.toContain(env.repo);
  });
  it('installs only the selected agent; codex gets no command', async () => {
    const env = createEnv();
    await env.cli(['install', '--project', '--tools', 'gemini']);
    expect(existsSync(join(env.repo, '.gemini/skills/ctxhead/SKILL.md'))).toBe(true);
    expect(existsSync(join(env.repo, '.gemini/commands/ctxhead.toml'))).toBe(true);
    expect(existsSync(join(env.repo, '.claude'))).toBe(false);
    expect(existsSync(join(env.repo, '.agents'))).toBe(false);
    const env2 = createEnv();
    await env2.cli(['install', '--project', '--tools', 'codex']);
    expect(existsSync(join(env2.repo, '.agents/skills/ctxhead/SKILL.md'))).toBe(true);
    expect(existsSync(join(env2.repo, '.agents/workflows'))).toBe(false);
    expect(existsSync(join(env2.repo, '.codex'))).toBe(false);
  });
  it('preselects detected agents in the picker; bare .agents does not detect antigravity', async () => {
    const env = createEnv();
    mkdirSync(join(env.repo, '.claude'));
    mkdirSync(join(env.repo, '.agents'));
    const r = await env.cli(['install', '--project'], { interactive: true });
    expect(r.preselected).toEqual(['claude']);
    expect(r.offered).toEqual(['claude', 'codex', 'gemini', 'antigravity']);
    expect(existsSync(join(env.repo, '.claude/skills/ctxhead/SKILL.md'))).toBe(true);
  });
  it('re-install keeps one block and reports unchanged', async () => {
    const env = createEnv();
    env.write('AGENTS.md', 'user content\n');
    await env.cli(['install', '--project', '--tools', 'codex']);
    const r = await env.cli(['install', '--project', '--tools', 'codex']);
    expect(read(env.repo, 'AGENTS.md').match(/ctxhead:start/g)).toHaveLength(1);
    expect(read(env.repo, 'AGENTS.md').startsWith('user content\n')).toBe(true);
    expect(r.out).toContain('unchanged');
  });
  it('refuses to overwrite a skill file ctxhead does not own', async () => {
    const env = createEnv();
    env.write('.claude/skills/ctxhead/SKILL.md', 'mine');
    const r = await env.cli(['install', '--project', '--tools', 'claude']);
    expect(r.code).toBe(1);
    expect(read(env.repo, '.claude/skills/ctxhead/SKILL.md')).toBe('mine');
    expect(existsSync(join(env.repo, 'AGENTS.md'))).toBe(false);
  });
  it('Gemini project install adds a GEMINI.md import of AGENTS.md and removes it on uninstall', async () => {
    const env = createEnv();
    env.write('GEMINI.md', '# Mine\n');
    await env.cli(['install', '--project', '--tools', 'gemini']);
    expect(read(env.repo, 'GEMINI.md')).toMatch(/^# Mine\n[\s\S]*@AGENTS\.md/);
    await env.cli(['uninstall', '--project']);
    expect(read(env.repo, 'GEMINI.md')).toBe('# Mine\n');
  });
  it('skips the shim when the user already imports AGENTS.md', async () => {
    const env = createEnv();
    env.write('CLAUDE.md', '@AGENTS.md\n');
    await env.cli(['install', '--project', '--tools', 'claude']);
    expect(read(env.repo, 'CLAUDE.md')).toBe('@AGENTS.md\n');
  });
  it('global install writes under HOME only', async () => {
    const env = createEnv();
    const r = await env.cli(['install', '--global', '--tools', 'claude,antigravity']);
    expect(r.code).toBe(0);
    expect(existsSync(join(env.home, '.claude/skills/ctxhead/SKILL.md'))).toBe(true);
    expect(read(env.home, '.claude/CLAUDE.md')).toContain('ctxhead:start');
    expect(existsSync(join(env.home, '.gemini/config/skills/ctxhead/SKILL.md'))).toBe(true);
    expect(existsSync(join(env.repo, 'AGENTS.md'))).toBe(false);
    expect(r.out).toContain('~/.claude/skills/ctxhead/SKILL.md');
  });
});

describe('update and uninstall', () => {
  it('uninstall keeps user content and removes owned files', async () => {
    const env = createEnv();
    env.write('AGENTS.md', 'user content\n');
    env.write('CLAUDE.md', '# Mine\n');
    await env.cli(['install', '--project', '--tools', 'claude,codex']);
    const r = await env.cli(['uninstall', '--project']);
    expect(r.code).toBe(0);
    expect(read(env.repo, 'AGENTS.md')).toBe('user content\n');
    expect(read(env.repo, 'CLAUDE.md')).toBe('# Mine\n');
    expect(existsSync(join(env.repo, '.claude/skills/ctxhead'))).toBe(false);
    expect(existsSync(join(env.repo, '.claude/commands/ctxhead.md'))).toBe(false);
    expect(existsSync(join(env.repo, '.agents/skills/ctxhead'))).toBe(false);
  });
  it('uninstall deletes files that only held the block, and leaves unowned files', async () => {
    const env = createEnv();
    await env.cli(['install', '--global', '--tools', 'claude']);
    writeFileSync(join(env.home, '.claude/commands/other.md'), 'x');
    await env.cli(['uninstall', '--global']);
    expect(existsSync(join(env.home, '.claude/CLAUDE.md'))).toBe(false);
    expect(existsSync(join(env.home, '.claude/commands/other.md'))).toBe(true);
  });
  it('update regenerates owned files from current templates, only where installed', async () => {
    const env = createEnv();
    await env.cli(['install', '--global', '--tools', 'claude']);
    const skill = join(env.home, '.claude/skills/ctxhead/SKILL.md');
    writeFileSync(
      skill,
      readFileSync(skill, 'utf8').replace('ctxhead-managed: v1', 'ctxhead-managed: v0'),
    );
    const r = await env.cli(['update', '--global']);
    expect(r.code).toBe(0);
    expect(readFileSync(skill, 'utf8')).toBe(SKILL);
    expect(existsSync(join(env.home, '.gemini'))).toBe(false);
  });
});

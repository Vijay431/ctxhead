import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasBlock, removeBlock, upsertBlock } from '../src/agents/blocks.js';
import { CLAUDE_COMMAND, COMMAND_BODY, RULES_BODY, SKILL } from '../src/templates/index.js';
import { createEnv, tempDir } from './helpers/env.js';

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
  it('rules say to stop and ask the user to refresh a header with a wrong description', () => {
    expect(RULES_BODY).toMatch(/description.*wrong/is);
    expect(RULES_BODY).toMatch(/stop/i);
    expect(RULES_BODY).toMatch(/resum/i);
  });
  it('rules describe the STOP: halt', () => {
    expect(RULES_BODY).toContain('STOP: do not continue this task.');
  });
  it('skill notes that ctxhead stale lets the agent read listed files during a refresh', () => {
    expect(SKILL).toMatch(/ctxhead stale.*read the listed files/is);
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
    expect(existsSync(join(env2.repo, '.codex/hooks.json'))).toBe(true);
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

describe('enforcement hooks', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const json = (dir: string, p: string) => JSON.parse(read(dir, p));
  const owned = (text: string) => text.match(/ctxhead guard/g)?.length ?? 0;

  it('default install adds read and finish hooks and lists the file', async () => {
    const env = createEnv();
    const r = await env.cli(['install', '--project', '--tools', 'claude']);
    expect(r.code).toBe(0);
    const hooks = json(env.repo, '.claude/settings.json').hooks;
    expect(hooks.PreToolUse[0].matcher).toBe('Read|Bash');
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('ctxhead guard --agent claude');
    expect(hooks.Stop[0].hooks[0].command).toContain('--event finish');
    expect(r.out).toContain('.claude/settings.json');
  });
  it('--no-enforce creates no hook config', async () => {
    const env = createEnv();
    const r = await env.cli(['install', '--project', '--tools', 'claude,codex', '--no-enforce']);
    expect(r.code).toBe(0);
    expect(existsSync(join(env.repo, '.claude/settings.json'))).toBe(false);
    expect(existsSync(join(env.repo, '.codex'))).toBe(false);
    expect(r.out).not.toContain('settings.json');
    expect(r.out).not.toContain('/hooks');
  });
  it('keeps user hooks and keys, adds ours once, and re-runs unchanged', async () => {
    const env = createEnv();
    const user = { type: 'command', command: 'echo mine' };
    env.write(
      '.claude/settings.json',
      JSON.stringify({
        permissions: { allow: ['Bash(ls)'] },
        hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [user] }] },
      }),
    );
    await env.cli(['install', '--project', '--tools', 'claude']);
    const first = read(env.repo, '.claude/settings.json');
    const cfg = JSON.parse(first);
    expect(cfg.permissions).toEqual({ allow: ['Bash(ls)'] });
    expect(cfg.hooks.PreToolUse[0]).toEqual({ matcher: 'Edit', hooks: [user] });
    expect(owned(first)).toBe(2);
    const r = await env.cli(['install', '--project', '--tools', 'claude']);
    expect(read(env.repo, '.claude/settings.json')).toBe(first);
    expect(r.out).toMatch(/unchanged\s+\.claude\/settings\.json/);
  });
  it('invalid hook JSON fails, names the file, and writes nothing', async () => {
    const env = createEnv();
    env.write('.gemini/settings.json', '{ not json');
    const r = await env.cli(['install', '--project', '--tools', 'gemini']);
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('.gemini/settings.json');
    expect(read(env.repo, '.gemini/settings.json')).toBe('{ not json');
    expect(existsSync(join(env.repo, '.gemini/skills'))).toBe(false);
    expect(existsSync(join(env.repo, '.gemini/commands'))).toBe(false);
    expect(existsSync(join(env.repo, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(env.repo, 'GEMINI.md'))).toBe(false);
  });
  it('uninstall keeps user hooks', async () => {
    const env = createEnv();
    const user = { type: 'command', command: 'echo mine' };
    env.write(
      '.claude/settings.json',
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [user] }] } }),
    );
    await env.cli(['install', '--project', '--tools', 'claude']);
    const r = await env.cli(['uninstall', '--project']);
    expect(r.code).toBe(0);
    expect(json(env.repo, '.claude/settings.json')).toEqual({
      hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [user] }] },
    });
    expect(r.out).toMatch(/removed\s+\.claude\/settings\.json/);
  });
  it('uninstall deletes a hook file holding only ctxhead hooks', async () => {
    const env = createEnv();
    await env.cli(['install', '--project', '--tools', 'antigravity']);
    expect(existsSync(join(env.repo, '.agents/hooks.json'))).toBe(true);
    await env.cli(['uninstall', '--project']);
    expect(existsSync(join(env.repo, '.agents/hooks.json'))).toBe(false);
  });
  it('tells the user to trust Codex project hooks with /hooks', async () => {
    const env = createEnv();
    const r = await env.cli(['install', '--project', '--tools', 'codex']);
    expect(r.out).toContain('/hooks');
    expect(existsSync(join(env.repo, '.codex/hooks.json'))).toBe(true);
  });
  it('warns when ctxhead is not on PATH and stays quiet when it is', async () => {
    const env = createEnv();
    const env2 = createEnv();
    const empty = tempDir('ctxhead-path-');
    vi.stubEnv('PATH', empty);
    const missing = await env.cli(['install', '--global', '--tools', 'claude']);
    expect(missing.code).toBe(0);
    expect(missing.err).toContain('npm i -g ctxhead');

    const bin = tempDir('ctxhead-bin-');
    const exe = join(bin, process.platform === 'win32' ? 'ctxhead.cmd' : 'ctxhead');
    writeFileSync(exe, '#!/bin/sh\n');
    chmodSync(exe, 0o755);
    vi.stubEnv('PATH', bin);
    const found = await env2.cli(['install', '--global', '--tools', 'claude']);
    expect(found.code).toBe(0);
    expect(found.err).not.toContain('PATH');
  });
  it('update regenerates a hand-edited owned hook entry', async () => {
    const env = createEnv();
    await env.cli(['install', '--project', '--tools', 'claude']);
    const good = read(env.repo, '.claude/settings.json');
    const cfg = JSON.parse(good);
    cfg.hooks.Stop[0].hooks[0].command = 'ctxhead guard --agent claude --event wrong';
    writeFileSync(join(env.repo, '.claude/settings.json'), JSON.stringify(cfg));
    const r = await env.cli(['update', '--project']);
    expect(r.code).toBe(0);
    expect(read(env.repo, '.claude/settings.json')).toBe(good);
    expect(r.out).toMatch(/updated\s+\.claude\/settings\.json/);
  });
});

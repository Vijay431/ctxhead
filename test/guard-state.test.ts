import { existsSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultStateBase, loadState, saveState, sessionFile } from '../src/guard/state.js';
import { tempDir } from './helpers/env.js';

const EMPTY = { shown: [], window: [], finishBlocks: 0 };
const DAY_MS = 24 * 60 * 60 * 1000;

function writeRaw(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

describe('guard session state', () => {
  it('round-trips state', () => {
    const base = tempDir();
    const state = { shown: ['/r/a.ts'], window: ['/r/b.ts', '/r/c.ts'], finishBlocks: 2 };
    saveState(base, 'claude', 's1', state);
    expect(loadState(base, 'claude', 's1')).toEqual(state);
  });

  it('returns empty state when no file exists', () => {
    expect(loadState(tempDir(), 'claude', 'nope')).toEqual(EMPTY);
  });

  it('returns empty state for corrupt JSON', () => {
    const base = tempDir();
    writeRaw(sessionFile(base, 'claude', 's1'), '{not json');
    expect(loadState(base, 'claude', 's1')).toEqual(EMPTY);
  });

  it('returns empty state for wrong shape', () => {
    const base = tempDir();
    const file = sessionFile(base, 'claude', 's1');
    writeRaw(file, JSON.stringify({ shown: 'x', window: [], finishBlocks: 0 }));
    expect(loadState(base, 'claude', 's1')).toEqual(EMPTY);
    writeRaw(file, JSON.stringify({ shown: [], window: [1], finishBlocks: 0 }));
    expect(loadState(base, 'claude', 's1')).toEqual(EMPTY);
    writeRaw(file, JSON.stringify({ shown: [], window: [], finishBlocks: 'a' }));
    expect(loadState(base, 'claude', 's1')).toEqual(EMPTY);
    writeRaw(file, 'null');
    expect(loadState(base, 'claude', 's1')).toEqual(EMPTY);
  });

  it('maps session ids and agents to different files without the raw id', () => {
    const base = tempDir();
    const a = sessionFile(base, 'claude', 'secret-session-id');
    const b = sessionFile(base, 'claude', 'other-session-id');
    const c = sessionFile(base, 'codex', 'secret-session-id');
    expect(new Set([a, b, c]).size).toBe(3);
    expect(basename(a)).not.toContain('secret-session-id');
    expect(basename(a).startsWith('claude-')).toBe(true);
    expect(a.startsWith(join(base, 'ctxhead', 'sessions'))).toBe(true);
  });

  it('prunes files older than 7 days on save and keeps newer ones', () => {
    const base = tempDir();
    const now = Date.now();
    saveState(base, 'claude', 'old', EMPTY, now);
    saveState(base, 'claude', 'recent', EMPTY, now);
    const oldFile = sessionFile(base, 'claude', 'old');
    const recentFile = sessionFile(base, 'claude', 'recent');
    utimesSync(oldFile, new Date(now - 8 * DAY_MS), new Date(now - 8 * DAY_MS));
    utimesSync(recentFile, new Date(now - DAY_MS), new Date(now - DAY_MS));

    saveState(base, 'claude', 'current', { shown: ['/x'], window: [], finishBlocks: 1 }, now);

    expect(existsSync(oldFile)).toBe(false);
    expect(existsSync(recentFile)).toBe(true);
    expect(loadState(base, 'claude', 'current').shown).toEqual(['/x']);
  });

  it('defaultStateBase honors an absolute XDG_STATE_HOME and falls back otherwise', () => {
    expect(defaultStateBase({ XDG_STATE_HOME: '/xdg/state' }, '/home/u')).toBe('/xdg/state');
    expect(defaultStateBase({}, '/home/u')).toBe(join('/home/u', '.local', 'state'));
    expect(defaultStateBase({ XDG_STATE_HOME: '' }, '/home/u')).toBe(
      join('/home/u', '.local', 'state'),
    );
    expect(defaultStateBase({ XDG_STATE_HOME: 'relative/dir' }, '/home/u')).toBe(
      join('/home/u', '.local', 'state'),
    );
  });
});

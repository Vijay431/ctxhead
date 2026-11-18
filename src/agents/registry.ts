import {
  CLAUDE_COMMAND,
  GEMINI_COMMAND,
  RULES_BODY,
  SHIM_BODY,
  SKILL,
  WORKFLOW_COMMAND,
} from '../templates/index.js';
import { type HookSpec, hookSpecFor } from './hooks.js';

export type Scope = 'project' | 'global';

/** One file or block ctxhead owns. Paths are relative to the scope base (repo root or HOME). */
export interface Artifact {
  kind: 'file' | 'block' | 'hooks';
  path: string;
  /** Empty for `hooks`, which carry `hooks` instead. */
  content: string;
  /** Hook handlers to merge into the config at `path` (kind 'hooks'). */
  hooks?: HookSpec;
  /** Agent that owns a hooks artifact. */
  agent?: string;
  /** Block that points the agent's own rules file at AGENTS.md; skipped if the user already did. */
  shim?: boolean;
}

export interface HookTargets {
  path: string;
  /** 'nested': every event holds matcher groups. 'flat-finish': the finish event holds handlers directly. */
  format: 'nested' | 'flat-finish';
  /** One matcher group per entry; a list keeps exact tool names where regex support is unverified. */
  read: { event: string; matcher: string | string[] };
  finish: { event: string };
}

interface ScopeTargets {
  /** Paths whose presence means the agent is in use at this scope. */
  detect: string[];
  skill: string;
  command: { path: string; content: string } | null;
  rules: string;
  /** Agent-specific rules file that must import AGENTS.md (project scope only). */
  shim?: string;
  /** Hook config ctxhead upserts into (design D8); null when the agent has no hook support here. */
  hooks: HookTargets | null;
}

export interface Agent {
  id: string;
  label: string;
  project: ScopeTargets;
  global: ScopeTargets;
}

const SKILL_FILE = 'ctxhead/SKILL.md';

/** Design D3. One row per agent; all per-agent differences live here as data. */
export const AGENTS: Agent[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    project: {
      detect: ['.claude'],
      skill: `.claude/skills/${SKILL_FILE}`,
      command: { path: '.claude/commands/ctxhead.md', content: CLAUDE_COMMAND },
      rules: 'AGENTS.md',
      shim: 'CLAUDE.md',
      hooks: {
        path: '.claude/settings.json',
        format: 'nested',
        read: { event: 'PreToolUse', matcher: 'Read|Bash' },
        finish: { event: 'Stop' },
      },
    },
    global: {
      detect: ['.claude'],
      skill: `.claude/skills/${SKILL_FILE}`,
      command: { path: '.claude/commands/ctxhead.md', content: CLAUDE_COMMAND },
      rules: '.claude/CLAUDE.md',
      hooks: {
        path: '.claude/settings.json',
        format: 'nested',
        read: { event: 'PreToolUse', matcher: 'Read|Bash' },
        finish: { event: 'Stop' },
      },
    },
  },
  {
    id: 'codex',
    label: 'Codex',
    project: {
      detect: ['.codex', '.agents/skills'],
      skill: `.agents/skills/${SKILL_FILE}`,
      command: null,
      rules: 'AGENTS.md',
      hooks: {
        path: '.codex/hooks.json',
        format: 'nested',
        read: { event: 'PreToolUse', matcher: 'Bash|exec_command' },
        finish: { event: 'Stop' },
      },
    },
    global: {
      detect: ['.codex', '.agents/skills'],
      skill: `.agents/skills/${SKILL_FILE}`,
      command: null,
      rules: '.codex/AGENTS.md',
      hooks: {
        path: '.codex/hooks.json',
        format: 'nested',
        read: { event: 'PreToolUse', matcher: 'Bash|exec_command' },
        finish: { event: 'Stop' },
      },
    },
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    project: {
      detect: ['.gemini'],
      skill: `.gemini/skills/${SKILL_FILE}`,
      command: { path: '.gemini/commands/ctxhead.toml', content: GEMINI_COMMAND },
      rules: 'AGENTS.md',
      shim: 'GEMINI.md',
      hooks: {
        path: '.gemini/settings.json',
        format: 'nested',
        read: { event: 'BeforeTool', matcher: 'read_file|read_many_files|run_shell_command' },
        finish: { event: 'AfterAgent' },
      },
    },
    global: {
      detect: ['.gemini'],
      skill: `.gemini/skills/${SKILL_FILE}`,
      command: { path: '.gemini/commands/ctxhead.toml', content: GEMINI_COMMAND },
      rules: '.gemini/GEMINI.md',
      hooks: {
        path: '.gemini/settings.json',
        format: 'nested',
        read: { event: 'BeforeTool', matcher: 'read_file|read_many_files|run_shell_command' },
        finish: { event: 'AfterAgent' },
      },
    },
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    project: {
      detect: ['.agent', '.agents/workflows'],
      skill: `.agents/skills/${SKILL_FILE}`,
      command: { path: '.agents/workflows/ctxhead.md', content: WORKFLOW_COMMAND },
      rules: 'AGENTS.md',
      hooks: {
        path: '.agents/hooks.json',
        format: 'flat-finish',
        read: { event: 'PreToolUse', matcher: ['read_file', 'view_file', 'run_command'] },
        finish: { event: 'Stop' },
      },
    },
    global: {
      detect: ['.gemini/config'],
      skill: `.gemini/config/skills/${SKILL_FILE}`,
      command: null,
      rules: '.gemini/AGENTS.md',
      hooks: {
        path: '.gemini/config/hooks.json',
        format: 'flat-finish',
        read: { event: 'PreToolUse', matcher: ['read_file', 'view_file', 'run_command'] },
        finish: { event: 'Stop' },
      },
    },
  },
];

export const AGENT_IDS = AGENTS.map((agent) => agent.id);

export interface ArtifactOptions {
  /** Include hook configs (default true). */
  enforce?: boolean;
}

export function artifactsFor(
  agent: Agent,
  scope: Scope,
  { enforce = true }: ArtifactOptions = {},
): Artifact[] {
  const targets = agent[scope];
  const list: Artifact[] = [
    { kind: 'file', path: targets.skill, content: SKILL },
    { kind: 'block', path: targets.rules, content: RULES_BODY },
  ];
  if (targets.command) {
    list.push({ kind: 'file', path: targets.command.path, content: targets.command.content });
  }
  if (targets.shim)
    list.push({ kind: 'block', path: targets.shim, content: SHIM_BODY, shim: true });
  const spec = enforce ? hookSpecFor(agent, scope) : null;
  if (spec && targets.hooks) {
    list.push({
      kind: 'hooks',
      path: targets.hooks.path,
      content: '',
      hooks: spec,
      agent: agent.id,
    });
  }
  return list;
}

/** Artifacts for several agents, with duplicate paths (shared `.agents/skills`, `AGENTS.md`) merged. */
export function artifactsForAll(
  agents: Agent[],
  scope: Scope,
  options?: ArtifactOptions,
): Artifact[] {
  const byPath = new Map<string, Artifact>();
  for (const agent of agents) {
    for (const artifact of artifactsFor(agent, scope, options)) {
      byPath.set(`${artifact.kind}:${artifact.path}`, artifact);
    }
  }
  return [...byPath.values()];
}

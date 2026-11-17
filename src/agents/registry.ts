import {
  CLAUDE_COMMAND,
  GEMINI_COMMAND,
  RULES_BODY,
  SHIM_BODY,
  SKILL,
  WORKFLOW_COMMAND,
} from '../templates/index.js';

export type Scope = 'project' | 'global';

/** One file or block ctxhead owns. Paths are relative to the scope base (repo root or HOME). */
export interface Artifact {
  kind: 'file' | 'block';
  path: string;
  content: string;
  /** Block that points the agent's own rules file at AGENTS.md; skipped if the user already did. */
  shim?: boolean;
}

interface ScopeTargets {
  /** Paths whose presence means the agent is in use at this scope. */
  detect: string[];
  skill: string;
  command: { path: string; content: string } | null;
  rules: string;
  /** Agent-specific rules file that must import AGENTS.md (project scope only). */
  shim?: string;
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
    },
    global: {
      detect: ['.claude'],
      skill: `.claude/skills/${SKILL_FILE}`,
      command: { path: '.claude/commands/ctxhead.md', content: CLAUDE_COMMAND },
      rules: '.claude/CLAUDE.md',
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
    },
    global: {
      detect: ['.codex', '.agents/skills'],
      skill: `.agents/skills/${SKILL_FILE}`,
      command: null,
      rules: '.codex/AGENTS.md',
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
    },
    global: {
      detect: ['.gemini'],
      skill: `.gemini/skills/${SKILL_FILE}`,
      command: { path: '.gemini/commands/ctxhead.toml', content: GEMINI_COMMAND },
      rules: '.gemini/GEMINI.md',
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
    },
    global: {
      detect: ['.gemini/config'],
      skill: `.gemini/config/skills/${SKILL_FILE}`,
      command: null,
      rules: '.gemini/AGENTS.md',
    },
  },
];

export const AGENT_IDS = AGENTS.map((agent) => agent.id);

export function artifactsFor(agent: Agent, scope: Scope): Artifact[] {
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
  return list;
}

/** Artifacts for several agents, with duplicate paths (shared `.agents/skills`, `AGENTS.md`) merged. */
export function artifactsForAll(agents: Agent[], scope: Scope): Artifact[] {
  const byPath = new Map<string, Artifact>();
  for (const agent of agents) {
    for (const artifact of artifactsFor(agent, scope)) {
      byPath.set(`${artifact.kind}:${artifact.path}`, artifact);
    }
  }
  return [...byPath.values()];
}

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { hasBlock, removeBlock, upsertBlock } from '../agents/blocks.js';
import {
  AGENT_IDS,
  AGENTS,
  type Agent,
  type Artifact,
  artifactsForAll,
  type Scope,
} from '../agents/registry.js';
import { CliError } from '../errors.js';
import type { Io } from '../io.js';
import { requireRepoRoot } from '../repo/git.js';
import { MARKER_PATTERN } from '../templates/index.js';

type Action = 'created' | 'updated' | 'unchanged' | 'removed';

interface Base {
  scope: Scope;
  dir: string;
}

function parseScope(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      global: { type: 'boolean' },
      project: { type: 'boolean' },
      tools: { type: 'string' },
    },
  });
  if (Boolean(values.global) === Boolean(values.project)) {
    throw new CliError('Exactly one of --global or --project is required.');
  }
  return { scope: (values.global ? 'global' : 'project') as Scope, tools: values.tools };
}

async function resolveBase(scope: Scope, io: Io): Promise<Base> {
  return { scope, dir: scope === 'global' ? io.home : await requireRepoRoot(io.cwd) };
}

function display(base: Base, path: string): string {
  return base.scope === 'global' ? `~/${path}` : path;
}

function read(base: Base, path: string): string | null {
  const full = join(base.dir, path);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

function save(base: Base, path: string, text: string): void {
  const full = join(base.dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

function report(io: Io, base: Base, results: [Action, string][]): void {
  if (results.length === 0) io.out('Nothing to do.\n');
  for (const [action, path] of results) io.out(`${action.padEnd(9)} ${display(base, path)}\n`);
}

const ownsFile = (text: string | null) => text !== null && MARKER_PATTERN.test(text);

/** The user's own `@AGENTS.md` line, outside any ctxhead block, makes the shim unnecessary. */
function userImportsAgents(text: string | null): boolean {
  return text !== null && /^@AGENTS\.md\s*$/m.test(removeBlock(text));
}

export async function install(args: string[], io: Io): Promise<void> {
  const { scope, tools } = parseScope(args);

  let agents: Agent[];
  if (tools !== undefined) {
    const ids = tools
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    const unknown = ids.filter((id) => !AGENT_IDS.includes(id));
    if (unknown.length > 0) {
      throw new CliError(
        `Unsupported tool(s): ${unknown.join(', ')}. Supported: ${AGENT_IDS.join(', ')}.`,
      );
    }
    agents = AGENTS.filter((agent) => ids.includes(agent.id));
  } else if (!io.interactive) {
    throw new CliError(
      '--tools is required in non-interactive mode (for example --tools claude,codex).',
    );
  } else {
    // resolved after the base is known, below
    agents = [];
  }

  const base = await resolveBase(scope, io);

  if (tools === undefined) {
    const detected = AGENTS.filter((agent) =>
      agent[scope].detect.some((path) => existsSync(join(base.dir, path))),
    ).map((agent) => agent.id);
    const chosen = await io.pick(
      'Which agents should ctxhead install into?',
      AGENTS.map((agent) => ({ id: agent.id, label: agent.label })),
      detected,
    );
    agents = AGENTS.filter((agent) => chosen.includes(agent.id));
    if (agents.length === 0) throw new CliError('No agents selected; nothing installed.');
  }

  const artifacts = artifactsForAll(agents, scope);
  const conflicts = artifacts
    .filter(
      (a) => a.kind === 'file' && read(base, a.path) !== null && !ownsFile(read(base, a.path)),
    )
    .map((a) => display(base, a.path));
  if (conflicts.length > 0) {
    throw new CliError(
      `Refusing to overwrite files not created by ctxhead:\n  ${conflicts.join('\n  ')}\nMove or delete them, then re-run.`,
    );
  }

  const results: [Action, string][] = [];
  for (const artifact of artifacts) {
    if (artifact.shim && userImportsAgents(read(base, artifact.path))) continue;
    results.push(applyArtifact(base, artifact));
  }
  report(io, base, results);
}

function applyArtifact(base: Base, artifact: Artifact): [Action, string] {
  const existing = read(base, artifact.path);
  const next =
    artifact.kind === 'file' ? artifact.content : upsertBlock(existing ?? '', artifact.content);
  if (existing === next) return ['unchanged', artifact.path];
  save(base, artifact.path, next);
  return [existing === null ? 'created' : 'updated', artifact.path];
}

/** Every artifact of every agent at this scope; update/uninstall find owned ones by marker. */
function allArtifacts(scope: Scope): Artifact[] {
  return artifactsForAll(AGENTS, scope);
}

export async function update(args: string[], io: Io): Promise<void> {
  const { scope } = parseScope(args);
  const base = await resolveBase(scope, io);
  const results: [Action, string][] = [];
  for (const artifact of allArtifacts(scope)) {
    const existing = read(base, artifact.path);
    const owned =
      artifact.kind === 'file' ? ownsFile(existing) : existing !== null && hasBlock(existing);
    if (owned) results.push(applyArtifact(base, artifact));
  }
  report(io, base, results);
}

function pruneEmptyParent(base: Base, path: string): void {
  const dir = join(base.dir, dirname(path));
  if (existsSync(dir) && readdirSync(dir).length === 0) rmdirSync(dir);
}

export async function uninstall(args: string[], io: Io): Promise<void> {
  const { scope } = parseScope(args);
  const base = await resolveBase(scope, io);
  const results: [Action, string][] = [];
  for (const artifact of allArtifacts(scope)) {
    const existing = read(base, artifact.path);
    if (existing === null) continue;
    if (artifact.kind === 'file') {
      if (!ownsFile(existing)) continue;
      rmSync(join(base.dir, artifact.path));
      if (artifact.path.endsWith('/SKILL.md')) pruneEmptyParent(base, artifact.path);
      results.push(['removed', artifact.path]);
    } else if (hasBlock(existing)) {
      const next = removeBlock(existing);
      if (next.trim() === '') rmSync(join(base.dir, artifact.path));
      else save(base, artifact.path, next);
      results.push(['removed', artifact.path]);
    }
  }
  report(io, base, results);
}

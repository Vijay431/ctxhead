import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { hasBlock, removeBlock, upsertBlock } from '../agents/blocks.js';
import { HookConfigError, hasOwnedHooks, removeHooks, upsertHooks } from '../agents/hooks.js';
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
      'no-enforce': { type: 'boolean' },
    },
  });
  if (Boolean(values.global) === Boolean(values.project)) {
    throw new CliError('Exactly one of --global or --project is required.');
  }
  return {
    scope: (values.global ? 'global' : 'project') as Scope,
    tools: values.tools,
    enforce: !values['no-enforce'],
  };
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
  const { scope, tools, enforce } = parseScope(args);

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

  const artifacts = artifactsForAll(agents, scope, { enforce });
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

  const invalid: string[] = [];
  for (const a of artifacts) {
    if (a.kind !== 'hooks') continue;
    try {
      nextHooks(base, a);
    } catch (error) {
      if (!(error instanceof HookConfigError)) throw error;
      invalid.push(`${display(base, a.path)}: ${error.message}`);
    }
  }
  if (invalid.length > 0) {
    throw new CliError(
      `Cannot edit hook config; fix or remove it, then re-run (nothing was written):\n  ${invalid.join('\n  ')}`,
    );
  }

  const results: [Action, string][] = [];
  const hookResults: [Action, Artifact][] = [];
  for (const artifact of artifacts) {
    if (artifact.shim && userImportsAgents(read(base, artifact.path))) continue;
    const result = applyArtifact(base, artifact);
    results.push(result);
    if (artifact.kind === 'hooks') hookResults.push([result[0], artifact]);
  }
  report(io, base, results);
  hookNotices(io, scope, hookResults);
}

function hookNotices(io: Io, scope: Scope, written: [Action, Artifact][]): void {
  if (written.length === 0) return;
  if (!onPath('ctxhead')) {
    io.err(
      'warning: ctxhead was not found on PATH. The installed hooks call `ctxhead` by name, so install it globally (npm i -g ctxhead).\n',
    );
  }
  const codex = written.some(([action, a]) => a.agent === 'codex' && action !== 'unchanged');
  if (codex && scope === 'project') {
    io.out('Codex: review and trust the new hooks with /hooks in Codex.\n');
  }
}

/** True when an executable named `name` is in a PATH directory. */
function onPath(name: string): boolean {
  const names = process.platform === 'win32' ? [name, `${name}.cmd`, `${name}.exe`] : [name];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const n of names) {
      try {
        const full = join(dir, n);
        if (!statSync(full).isFile()) continue;
        accessSync(full, constants.X_OK);
        return true;
      } catch {
        // not here
      }
    }
  }
  return false;
}

/** The hook config text install would write; throws HookConfigError on unusable JSON. */
function nextHooks(base: Base, artifact: Artifact): string {
  if (!artifact.hooks) throw new Error('hooks artifact without spec');
  return upsertHooks(read(base, artifact.path), artifact.hooks);
}

function applyArtifact(base: Base, artifact: Artifact): [Action, string] {
  const existing = read(base, artifact.path);
  const next =
    artifact.kind === 'file'
      ? artifact.content
      : artifact.kind === 'hooks'
        ? nextHooks(base, artifact)
        : upsertBlock(existing ?? '', artifact.content);
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
      artifact.kind === 'file'
        ? ownsFile(existing)
        : artifact.kind === 'hooks'
          ? existing !== null && hasOwnedHooks(existing)
          : existing !== null && hasBlock(existing);
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
    } else if (artifact.kind === 'hooks') {
      if (!hasOwnedHooks(existing)) continue;
      const next = removeHooks(existing);
      if (next === null) rmSync(join(base.dir, artifact.path));
      else save(base, artifact.path, next);
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

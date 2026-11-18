/** Agent-neutral guard types (design D1). Adapters map each agent's hook JSON to and from these. */

export type GuardEvent = 'read' | 'finish';

/** One file a tool call would read. `path` is as given by the agent (absolute or cwd-relative). */
export interface Target {
  path: string;
  /** Last line (1-based, inclusive) the read returns; undefined means the whole file. */
  endLine?: number;
}

export interface GuardInput {
  sessionId: string;
  cwd: string;
  /** Files a read tool or a parsed shell command would read. */
  targets: Target[];
  /** Raw shell command, when the tool call is a shell call. */
  shellCommand?: string;
}

export type Decision =
  | { kind: 'allow'; note?: string }
  | { kind: 'deny'; reason: string }
  | { kind: 'halt'; message: string }
  | { kind: 'block-finish'; reason: string };

/** Per-session state (design D5). Paths are repo-absolute. */
export interface SessionState {
  shown: string[];
  window: string[];
  finishBlocks: number;
}

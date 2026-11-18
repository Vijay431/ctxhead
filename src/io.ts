export interface Choice {
  id: string;
  label: string;
}

/** Everything a command needs from the outside world, so tests can inject it. */
export interface Io {
  cwd: string;
  home: string;
  interactive: boolean;
  /** Directory for per-session guard state. */
  stateBase: string;
  /** Reads all of stdin as text; empty when stdin is a TTY. */
  readStdin(): Promise<string>;
  out(text: string): void;
  err(text: string): void;
  /** Multi-select picker; returns the chosen ids. */
  pick(message: string, choices: Choice[], preselected: string[]): Promise<string[]>;
}

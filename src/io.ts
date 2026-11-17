export interface Choice {
  id: string;
  label: string;
}

/** Everything a command needs from the outside world, so tests can inject it. */
export interface Io {
  cwd: string;
  home: string;
  interactive: boolean;
  out(text: string): void;
  err(text: string): void;
  /** Multi-select picker; returns the chosen ids. */
  pick(message: string, choices: Choice[], preselected: string[]): Promise<string[]>;
}

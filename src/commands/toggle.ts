import type { Io } from '../io.js';
import { writeConfig } from '../repo/config.js';
import { loadRepo } from '../repo/context.js';

export async function setEnabled(enabled: boolean, io: Io): Promise<void> {
  const { root, config } = await loadRepo(io.cwd);
  config.enabled = enabled;
  writeConfig(root, config);
  io.out(`ctxhead is now ${enabled ? 'enabled' : 'disabled'} in this repository.\n`);
}

import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Io } from '../io.js';
import { CONFIG_FILE, configExists, defaultConfig, writeConfig } from '../repo/config.js';
import { requireRepoRoot } from '../repo/git.js';
import { CTXIGNORE_FILE } from '../repo/scope.js';

export const DEFAULT_CTXIGNORE = `# Files ctxhead never writes headers to. Syntax is the same as .gitignore.
# Everything matched by this repository's .gitignore is excluded as well.

# Dependencies
node_modules/
vendor/
.venv/
venv/
__pycache__/

# Build output
dist/
build/
out/
target/
coverage/
.next/
.nuxt/

# Generated and minified files
*.min.js
*.min.css
*.generated.*
*.gen.*
*.pb.go
*.pb.ts
*_pb2.py

# Lockfiles
pnpm-lock.yaml
package-lock.json
yarn.lock
Cargo.lock
poetry.lock
Gemfile.lock
composer.lock
`;

export async function init(_args: string[], io: Io): Promise<void> {
  const root = await requireRepoRoot(io.cwd);

  if (existsSync(join(root, CTXIGNORE_FILE))) {
    io.out(`kept     ${CTXIGNORE_FILE} (already exists)\n`);
  } else {
    writeFileSync(join(root, CTXIGNORE_FILE), DEFAULT_CTXIGNORE);
    io.out(`created  ${CTXIGNORE_FILE}\n`);
  }

  if (configExists(root)) {
    io.out(`kept     ${CONFIG_FILE} (already exists)\n`);
  } else {
    writeConfig(root, defaultConfig());
    io.out(`created  ${CONFIG_FILE}\n`);
  }

  io.out(
    '\nNext steps:\n' +
      '  1. ctxhead add <path>   choose the files or folders that get headers\n' +
      '  2. ctxhead enable       allow agents to write headers in this repository\n',
  );
}

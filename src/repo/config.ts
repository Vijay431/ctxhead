import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError } from '../errors.js';

export const CONFIG_FILE = '.ctxhead.json';

export interface Config {
  version: 1;
  enabled: boolean;
  include: string[];
  lastRunSha: string | null;
}

export function defaultConfig(): Config {
  return { version: 1, enabled: false, include: [], lastRunSha: null };
}

export function configExists(root: string): boolean {
  return existsSync(join(root, CONFIG_FILE));
}

function invalid(reason: string): CliError {
  return new CliError(`${CONFIG_FILE} is invalid: ${reason}`);
}

export function parseConfig(text: string): Config {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw invalid('not valid JSON');
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw invalid('expected a JSON object');
  }
  const record = data as Record<string, unknown>;
  if (record.version !== 1) throw invalid(`unsupported version ${JSON.stringify(record.version)}`);
  if (typeof record.enabled !== 'boolean') throw invalid('"enabled" must be a boolean');
  if (!Array.isArray(record.include) || !record.include.every((p) => typeof p === 'string')) {
    throw invalid('"include" must be an array of strings');
  }
  if (record.lastRunSha !== null && typeof record.lastRunSha !== 'string') {
    throw invalid('"lastRunSha" must be a string or null');
  }
  return {
    version: 1,
    enabled: record.enabled,
    include: record.include as string[],
    lastRunSha: record.lastRunSha as string | null,
  };
}

/** Reads the config, or throws a message that names `ctxhead init` when it is missing. */
export function readConfig(root: string): Config {
  const path = join(root, CONFIG_FILE);
  if (!existsSync(path)) {
    throw new CliError(`${CONFIG_FILE} not found. Run \`ctxhead init\` first.`);
  }
  return parseConfig(readFileSync(path, 'utf8'));
}

/** Writes via a temporary file and rename so readers never see a partial file. */
export function writeConfig(root: string, config: Config): void {
  const path = join(root, CONFIG_FILE);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(temp, path);
}

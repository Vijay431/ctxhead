import { extname } from 'node:path';

/** Line-comment prefixes by file extension (design D7). */
const SYNTAX: Record<string, string> = {};

const groups: Record<string, string[]> = {
  '//': [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.kts',
    '.swift',
    '.c',
    '.h',
    '.cc',
    '.cpp',
    '.hpp',
    '.cs',
    '.scala',
    '.dart',
    '.php',
  ],
  '#': ['.py', '.rb', '.sh', '.bash', '.zsh', '.pl', '.r', '.ex', '.exs', '.yaml', '.yml', '.toml'],
  '--': ['.sql', '.lua', '.hs'],
};

for (const [prefix, extensions] of Object.entries(groups)) {
  for (const extension of extensions) SYNTAX[extension] = prefix;
}

/** Comment prefix for a file path, or null when the language is unsupported. */
export function commentPrefix(path: string): string | null {
  return SYNTAX[extname(path).toLowerCase()] ?? null;
}

import {
  bodyHash,
  detectEol,
  formatHeader,
  headerPosition,
  MAX_LINE,
  type ParsedHeader,
  parseHeader,
  type Rule,
  splitLines,
  validateFields,
} from './header.js';

export type HeaderState = 'missing' | 'invalid' | 'stale' | 'fresh';

export interface Inspection {
  state: HeaderState;
  rules: Rule[];
}

function bodyAfter(lines: string[], header: ParsedHeader): string {
  return lines.slice(header.end).join('\n');
}

/** Whether the file has a header at all, without hashing (cheap path for unchanged files). */
export function hasHeader(text: string, prefix: string): boolean {
  return parseHeader(splitLines(text), prefix) !== null;
}

export function inspect(text: string, prefix: string): Inspection {
  const lines = splitLines(text);
  const header = parseHeader(lines, prefix);
  if (!header) return { state: 'missing', rules: [] };

  const rules = [...header.problems];
  if (header.name !== null && header.description !== null) {
    rules.push(...validateFields(header.name, header.description));
  }
  if (rules.length > 0) return { state: 'invalid', rules };

  return bodyHash(bodyAfter(lines, header)) === header.hash
    ? { state: 'fresh', rules: [] }
    : { state: 'stale', rules: [] };
}

/**
 * Returns `text` with a header for the given fields, replacing any existing header.
 * The body is kept byte for byte, apart from one blank line separating it from the header.
 */
export function stamp(
  text: string,
  prefix: string,
  name: string,
  description: string,
): { text: string } | { rules: Rule[] } {
  const rules = validateFields(name, description);
  if (rules.length > 0) return { rules };

  const eol = detectEol(text);
  const lines = splitLines(text);
  const existing = parseHeader(lines, prefix);
  const position = existing ? existing.start : headerPosition(lines, prefix);
  const before = lines.slice(0, position);
  let rest = lines.slice(existing ? existing.end : position);
  let skip = 0;
  while (skip < rest.length && /^[ \t]*$/.test(rest[skip] ?? '') && skip < rest.length - 1) skip++;
  rest = rest.slice(skip);
  const onlyTrailingNewline = rest.length === 1 && rest[0] === '';
  if (rest.length === 1 && /^[ \t]*$/.test(rest[0] ?? '')) rest = [''];

  const hash = bodyHash(rest.join('\n'));
  const header = formatHeader(prefix, name, description, hash);
  if (header.some((line) => line.length > MAX_LINE)) {
    return {
      rules: [
        {
          id: 'description-wrap',
          message: `description has a word too long to wrap within ${MAX_LINE} characters`,
        },
      ],
    };
  }
  const tail = onlyTrailingNewline || rest.length === 0 ? [''] : ['', ...rest];
  return { text: [...before, ...header, ...tail].join(eol) };
}

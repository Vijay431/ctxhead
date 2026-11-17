import { createHash } from 'node:crypto';

export const HASH_PREFIX = 'ctxhead: v1 sha256:';
export const MAX_LINE = 100;

export type Rule = { id: string; message: string };

export interface ParsedHeader {
  /** Index of the opening `---` line. */
  start: number;
  /** Index one past the closing `---` line (or the end of the comment run when unterminated). */
  end: number;
  name: string | null;
  description: string | null;
  hash: string | null;
  problems: Rule[];
}

export function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

export function detectEol(text: string): '\r\n' | '\n' {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** SHA-256 of the body: CRLF normalised to LF, leading blank lines removed. */
export function bodyHash(body: string): string {
  const normalised = body.replace(/\r\n/g, '\n').replace(/^(?:[ \t]*\n)+/, '');
  return createHash('sha256').update(normalised).digest('hex');
}

/** First line index where the header belongs: after shebang, encoding line, directive prologue, `<?php`. */
export function headerPosition(lines: string[], prefix: string): number {
  let index = 0;
  if (lines[0]?.startsWith('#!')) index = 1;

  if (prefix === '#') {
    for (const offset of [0, 1]) {
      if (/^#.*coding[:=]\s*[-\w.]+/.test(lines[index + offset] ?? '') && index + offset < 2) {
        return index + offset + 1;
      }
    }
    return index;
  }
  if (prefix === '//') {
    if (/^<\?php\s*$/.test(lines[index] ?? '')) return index + 1;
    while (/^\s*(['"])use (?:strict|client|server)\1;?\s*$/.test(lines[index] ?? '')) index++;
  }
  return index;
}

function stripPrefix(line: string, prefix: string): string | null {
  if (!line.startsWith(prefix)) return null;
  const rest = line.slice(prefix.length);
  return rest.startsWith(' ') ? rest.slice(1) : rest;
}

/** Finds and parses the header, or returns null when the file has none. */
export function parseHeader(lines: string[], prefix: string): ParsedHeader | null {
  const start = headerPosition(lines, prefix);
  if (stripPrefix(lines[start] ?? '', prefix)?.trimEnd() !== '---') return null;

  const problems: Rule[] = [];
  const bad = (message: string) => problems.push({ id: 'header-format', message });

  let end = start + 1;
  const content: string[] = [];
  let closed = false;
  while (end < lines.length) {
    const text = stripPrefix(lines[end] ?? '', prefix);
    if (text === null) break;
    end++;
    if (text.trimEnd() === '---') {
      closed = true;
      break;
    }
    content.push(text);
  }
  if (!closed) bad('header is not closed by a `---` line');

  for (let i = start; i < end; i++) {
    if ((lines[i] ?? '').length > MAX_LINE) {
      problems.push({
        id: 'description-wrap',
        message: `line ${i + 1} is longer than ${MAX_LINE} characters`,
      });
    }
  }

  let name: string | null = null;
  let description: string | null = null;
  let hash: string | null = null;
  const order: string[] = [];

  for (let i = 0; i < content.length; i++) {
    const line = content[i] ?? '';
    const field = /^([a-z]+):\s?(.*)$/.exec(line);
    if (!field) {
      bad(`unexpected line: ${line}`);
      continue;
    }
    const [, key, value = ''] = field;
    order.push(key ?? '');
    if (key === 'name') name = value.trim();
    else if (key === 'description') {
      if (/^>-?$/.test(value.trim())) {
        const parts: string[] = [];
        while (i + 1 < content.length && /^\s+\S/.test(content[i + 1] ?? '')) {
          parts.push((content[++i] ?? '').trim());
        }
        description = parts.join(' ');
      } else description = value.trim();
    } else if (key === 'ctxhead') {
      const match = /^v1 sha256:([0-9a-f]{64})$/.exec(value.trim());
      if (match) hash = match[1] ?? null;
      else bad('ctxhead line must be `ctxhead: v1 sha256:<64 hex>`');
    } else bad(`unknown field \`${key}\``);
  }

  if (name === null) bad('missing `name` field');
  if (description === null) bad('missing `description` field');
  if (hash === null && !problems.some((p) => p.message.startsWith('ctxhead line'))) {
    bad('missing `ctxhead` line');
  }
  if (order.join() !== 'name,description,ctxhead' && problems.length === 0) {
    bad('fields must be `name`, `description`, `ctxhead` in that order');
  }

  return { start, end, name, description, hash, problems };
}

/** Limits for `name` and `description` (shared by `write` and `check`). */
export function validateFields(name: string, description: string): Rule[] {
  const rules: Rule[] = [];
  if (name.length < 1 || name.length > 64) {
    rules.push({ id: 'name-length', message: `name must be 1-64 characters (got ${name.length})` });
  } else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    rules.push({
      id: 'name-format',
      message: 'name must use only a-z, 0-9 and single hyphens, and not start or end with a hyphen',
    });
  }
  if (description.length < 1 || description.length > 1024) {
    rules.push({
      id: 'description-length',
      message: `description must be 1-1024 characters (got ${description.length})`,
    });
  }
  if (/<\/?[a-zA-Z][^>]*>/.test(description)) {
    rules.push({ id: 'description-xml', message: 'description must not contain XML or HTML tags' });
  }
  if (/^(?:this|the)\s+(?:file|module|script|class|source)\b/i.test(description)) {
    rules.push({
      id: 'description-filler',
      message: 'description must not start with filler such as "This file"; say what it does',
    });
  }
  return rules;
}

/** Name from a file's stem in kebab-case: `UserService.ts` -> `user-service`. */
export function deriveName(path: string): string {
  const base = path.split('/').pop() ?? path;
  const stem = base.includes('.') ? base.slice(0, base.lastIndexOf('.')) : base;
  const kebab = stem
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
  return kebab || 'file';
}

/** Wraps words into lines of at most `width` characters; a word that cannot fit gets its own line. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(' ')) {
    if (current === '') current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

/** Header lines (without line endings) for the given fields; description must already be validated. */
export function formatHeader(
  prefix: string,
  name: string,
  description: string,
  hash: string,
): string[] {
  const comment = (text: string) => (text === '' ? prefix : `${prefix} ${text}`);
  const single = comment(`description: ${description}`);
  const lines = [comment('---'), comment(`name: ${name}`)];
  if (single.length <= MAX_LINE && /^[A-Za-z0-9][^:#]*$/.test(description)) {
    lines.push(single);
  } else {
    lines.push(comment('description: >-'));
    const width = MAX_LINE - prefix.length - 3;
    for (const chunk of wrap(description, width)) lines.push(comment(`  ${chunk}`));
  }
  lines.push(comment(`${HASH_PREFIX}${hash}`), comment('---'));
  return lines;
}

/** Body text following a parsed header (or the whole file when there is none). */
export function bodyOf(lines: string[], header: ParsedHeader | null, prefix: string): string {
  const from = header ? header.end : headerPosition(lines, prefix);
  return lines.slice(from).join('\n');
}

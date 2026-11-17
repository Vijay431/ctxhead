import { BLOCK_END, BLOCK_START } from '../templates/index.js';

function pattern(): RegExp {
  return new RegExp(`${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`);
}

export function hasBlock(text: string): boolean {
  return pattern().test(text);
}

function render(body: string): string {
  return `${BLOCK_START}\n${body}\n${BLOCK_END}\n`;
}

/** Replaces the ctxhead block in place, or appends one; content outside the markers is untouched. */
export function upsertBlock(text: string, body: string): string {
  if (hasBlock(text)) return text.replace(pattern(), () => render(body));
  if (text.trim() === '') return render(body);
  const separator = text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${separator}${render(body)}`;
}

/** Removes the ctxhead block and the blank line that separated it from its neighbours. */
export function removeBlock(text: string): string {
  return text.replace(
    new RegExp(`\\n?${BLOCK_START}[\\s\\S]*?${BLOCK_END}\\n?`),
    (match: string, offset: number, whole: string) => {
      const after = whole.slice(offset + match.length);
      return offset > 0 && after !== '' ? '\n' : '';
    },
  );
}

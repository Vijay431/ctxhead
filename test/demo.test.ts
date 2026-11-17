import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createEnv } from './helpers/env.js';

const SAMPLE_PATH = 'src/greet.ts';
const SAMPLE_BODY = [
  'export function greet(name: string): string {',
  // biome-ignore lint/suspicious/noTemplateCurlyInString: sample source text, not a template
  '  return `Hello, ${name}!`;',
  '}',
  '',
].join('\n');
const PROMPT = '$ ctxhead ';

interface Step {
  args: string[];
  expected: string;
}

/** Splits a command line into arguments, keeping double-quoted text together. */
function splitArgs(line: string): string[] {
  return [...line.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? (m[2] as string));
}

function parseTranscript(text: string): Step[] {
  const steps: { args: string[]; lines: string[] }[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith(PROMPT)) {
      steps.push({ args: splitArgs(line.slice(PROMPT.length)), lines: [] });
    } else {
      steps.at(-1)?.lines.push(line);
    }
  }
  return steps.map(({ args, lines }) => ({ args, expected: lines.join('\n').trimEnd() }));
}

const ENTITIES: Record<string, string> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

function decode(text: string): string {
  return text.replace(/&(?:#x([0-9a-fA-F]+)|#(\d+)|(\w+));/g, (whole, hex, dec, name) => {
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
    return ENTITIES[name as string] ?? whole;
  });
}

const stripTags = (markup: string) => markup.replace(/<[^>]*>/g, '');

/** Collects each <text> element as one string and each <tspan> separately. */
function svgLines(svg: string): Set<string> {
  const lines = new Set<string>();
  for (const [, inner] of svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)) {
    lines.add(decode(stripTags(inner as string)).trim());
    for (const [, span] of (inner as string).matchAll(/<tspan\b[^>]*>([\s\S]*?)<\/tspan>/g)) {
      lines.add(decode(stripTags(span as string)).trim());
    }
  }
  return lines;
}

const transcript = () => readFileSync(new URL('../assets/demo.txt', import.meta.url), 'utf8');

describe('assets/demo.txt', () => {
  it('matches real CLI output when replayed', async () => {
    const steps = parseTranscript(transcript());
    expect(steps.length).toBeGreaterThan(0);

    const env = createEnv();
    env.write(SAMPLE_PATH, SAMPLE_BODY);
    for (const { args, expected } of steps) {
      const result = await env.cli(args);
      expect(result.code, args.join(' ')).toBe(0);
      expect(`${result.out}${result.err}`.trimEnd(), args.join(' ')).toBe(expected);
    }
  });

  it('assets/demo.svg contains every transcript line', () => {
    const svg = readFileSync(new URL('../assets/demo.svg', import.meta.url), 'utf8');
    const available = svgLines(svg);
    const missing = transcript()
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !available.has(line));
    expect(missing).toEqual([]);
  });
});

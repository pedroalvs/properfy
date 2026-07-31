import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import resolveConfig from 'tailwindcss/resolveConfig';
import tailwindConfig from '../../tailwind.config';

/**
 * `asColor()` drops any colour utility whose alpha is not a key of `theme.opacity` —
 * *before* it looks at the colour at all. Tailwind's default scale is 0,5,…,100, so
 * `bg-white/6`, `text-white/88` and `border-black/8` were as dead as the token classes
 * in #1041, and for an entirely different reason: `white` and `black` are real hexes, so
 * the `token()` helper in `tailwind.config.ts` cannot save them.
 *
 * This is the guard for that second defect. `theme.extend.opacity` lists the steps the
 * source actually uses; if someone writes a new off-scale number, this fails loudly
 * instead of shipping another invisible style.
 */
const SRC = resolve(__dirname, '..');

const COLOR_UTILITIES = [
  'bg',
  'text',
  'border',
  'ring',
  'from',
  'via',
  'to',
  'fill',
  'stroke',
  'divide',
  'outline',
  'shadow',
  'decoration',
  'accent',
  'caret',
  'placeholder',
].join('|');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => resolve(entry.parentPath ?? entry.path, entry.name))
    // Tests quote class names as fixtures — including deliberately off-scale ones — and
    // those strings never reach a stylesheet. Only shipped source counts.
    .filter((path) => !/(^|\/)__tests__\/|\.test\.tsx?$/.test(path));
}

/** Flattened colour names Tailwind knows about — `primary`, `white`, `red-500`, … */
function colorNames(colors: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(colors).flatMap(([key, value]) => {
    const name = prefix ? `${prefix}-${key}` : key;
    return value && typeof value === 'object'
      ? colorNames(value as Record<string, unknown>, name)
      : [name];
  });
}

describe('opacity modifiers stay on the configured scale', () => {
  const theme = resolveConfig(tailwindConfig).theme!;
  const scale = theme.opacity as Record<string, string>;
  // Matching against real colour names is what keeps fraction utilities (`w-1/2`,
  // `top-1/2`, `basis-1/3`) and string literals (`'/v1/appointments'`) out of the results.
  const names = colorNames(theme.colors as unknown as Record<string, unknown>)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const modifier = new RegExp(`\\b(?:${COLOR_UTILITIES})-(?:${names})\\/(\\d+)\\b`, 'g');

  it('every opacity modifier in src/ resolves to a defined scale step', () => {
    const offScale: string[] = [];

    for (const file of sourceFiles(SRC)) {
      const contents = readFileSync(file, 'utf8');
      for (const [match, alpha] of contents.matchAll(modifier)) {
        if (alpha !== undefined && scale[alpha] === undefined) {
          offScale.push(`${file.replace(`${SRC}/`, '')}: ${match}`);
        }
      }
    }

    // A failure here means the class emits nothing at all. Either round the number to a
    // step on the scale, or add the step to `theme.extend.opacity` in tailwind.config.ts.
    expect(offScale).toEqual([]);
  });

  it('extends the scale with exactly the off-default steps the source needs', () => {
    // Guards against the extension quietly growing into a full 0-100 scale, which would
    // make the test above vacuous.
    for (const step of ['4', '6', '8', '12', '14', '78', '88', '92']) {
      expect(scale[step]).toBe(`0.${step.padStart(2, '0')}`);
    }
  });
});

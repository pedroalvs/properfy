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
  // Side- and axis-specific border colours are their own utilities: `border-l-black/20`
  // is live in components/shell/SidebarSubmenu.tsx and a bare `border` alternative
  // does not match it.
  'border(?:-[tblrxyse])?',
  'ring(?:-offset)?',
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
    // Test files are excluded because their class names are deliberate negatives, not
    // because they are inert: `content` globs `./src/**/*.{ts,tsx}`, so a fixture string
    // (or even one inside a comment) really does get compiled into the stylesheet.
    .filter((path) => !/(^|\/)__tests__\/|\.(test|spec)\.tsx?$/.test(path));
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
  // `(\d+(?:\.\d+)?)` and not `(\d+)`: on `bg-white/6.5` the shorter capture takes '6',
  // finds it on the scale and passes, while Tailwind looks up '6.5', finds nothing and
  // drops the class — a false pass in the one test meant to catch exactly that.
  const modifier = new RegExp(
    `\\b(?:${COLOR_UTILITIES})-(?:${names})\\/(\\d+(?:\\.\\d+)?)\\b`,
    'g',
  );

  it('every opacity modifier in src/ resolves to a defined scale step', () => {
    const offScale: string[] = [];
    let matched = 0;
    const files = sourceFiles(SRC);

    // `readdirSync({ recursive: true, withFileTypes: true })` is young enough that an old
    // Node 20 patch can walk it wrongly. If it ever returns nothing (or only the top
    // level), every assertion below passes over an empty set and this guard silently
    // stops guarding — the exact failure mode #1041 was.
    expect(files.length).toBeGreaterThan(100);

    for (const file of files) {
      const contents = readFileSync(file, 'utf8');
      for (const [match, alpha] of contents.matchAll(modifier)) {
        matched++;
        if (alpha !== undefined && scale[alpha] === undefined) {
          offScale.push(`${file.replace(`${SRC}/`, '')}: ${match}`);
        }
      }
    }

    // The colour names come from the resolved theme, so restructuring the map (say, to
    // the nested `primary: { DEFAULT: … }` form) would stop the alternation matching
    // anything at all. `offScale` would then be empty forever and this test would report
    // green while scanning for a pattern that no longer occurs.
    expect(matched).toBeGreaterThan(150);

    // A failure here means the class emits nothing at all. Either round the number to a
    // step on the scale, or add the step to `theme.extend.opacity` in tailwind.config.ts.
    expect(offScale).toEqual([]);
  });

  it('extends the scale with exactly the off-default steps the source needs', () => {
    // Guards against the extension quietly growing into a full 0-100 scale, which would
    // make the test above vacuous. Asserting the *extension* rather than diffing the
    // resolved scale against a hand-copied list of Tailwind's defaults keeps this honest
    // if upstream ever changes those defaults.
    const steps = ['4', '6', '8', '12', '14', '78', '88', '92'];
    const extension = (tailwindConfig.theme?.extend?.opacity ?? {}) as Record<string, string>;
    expect(Object.keys(extension).sort()).toEqual([...steps].sort());
    for (const step of steps) {
      expect(scale[step]).toBe(`0.${step.padStart(2, '0')}`);
    }
  });
});

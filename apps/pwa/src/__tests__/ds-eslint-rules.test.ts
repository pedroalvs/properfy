import { createRequire } from 'node:module';
import { Linter } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { describe, expect, it } from 'vitest';

/**
 * Unit coverage for the shared design-system ESLint guards (no-restricted-syntax
 * selectors in @properfy/frontend-standards/eslint): raw palette colour, arbitrary
 * colour value, and template-literal className — each with a valid + invalid case.
 */
const require = createRequire(import.meta.url);
const properfy = require('@properfy/frontend-standards/eslint') as {
  rules: { 'no-restricted-syntax': unknown[] };
};

const linter = new Linter();
linter.defineParser('ts', tsParser as never);

function lint(code: string): Linter.LintMessage[] {
  return linter.verify(
    code,
    {
      parser: 'ts',
      parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
      rules: { 'no-restricted-syntax': properfy.rules['no-restricted-syntax'] as Linter.RuleEntry },
    },
    { filename: 'sample.tsx' },
  );
}

describe('design-system ESLint guards', () => {
  it('flags a raw palette colour in a className string', () => {
    const msgs = lint('export const C = () => <div className="bg-slate-50 p-2" />;');
    expect(msgs.some((m) => /palette colour/.test(m.message))).toBe(true);
  });

  it('flags a raw palette colour inside cn()', () => {
    const msgs = lint("import { cn } from 'x';\nexport const c = cn('p-2', 'text-green-700');");
    expect(msgs.some((m) => /palette colour/.test(m.message))).toBe(true);
  });

  it('flags an arbitrary colour value', () => {
    const msgs = lint('export const C = () => <div className="text-[#ff0000]" />;');
    expect(msgs.some((m) => /arbitrary colour/.test(m.message))).toBe(true);
  });

  it('flags a template-literal className', () => {
    const msgs = lint('export const C = ({ x }: { x: string }) => <div className={`p-2 ${x}`} />;');
    expect(msgs.some((m) => /template-literal className/.test(m.message))).toBe(true);
  });

  it('accepts design-system token classes', () => {
    const msgs = lint(
      "import { cn } from 'x';\n" +
        'export const C = () => <div className={cn("bg-muted text-success", "border-border")} />;',
    );
    expect(msgs).toHaveLength(0);
  });

  it('accepts a non-colour arbitrary value (e.g. max-h-[85dvh])', () => {
    const msgs = lint('export const C = () => <div className="max-h-[85dvh] text-[11px]" />;');
    expect(msgs).toHaveLength(0);
  });
});

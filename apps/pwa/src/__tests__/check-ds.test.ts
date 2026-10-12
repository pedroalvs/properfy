import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * Coverage for the design-system guard categories added in PR 7 (raw palette,
 * arbitrary z-index, magic setTimeout, hand-rolled fixed-overlay). The script is run
 * against a throwaway fixtures tree via CHECK_DS_SRC so these never touch real src.
 */
const SCRIPT = resolve('scripts/check-ds.sh');
const dirs: string[] = [];

function makeTree(): string {
  const root = mkdtempSync(join(tmpdir(), 'check-ds-'));
  dirs.push(root);
  mkdirSync(join(root, 'features'), { recursive: true });
  return root;
}

/** Run the guard against `src`; returns { code, output }. */
function runGuard(src: string): { code: number; output: string } {
  try {
    const output = execFileSync('bash', [SCRIPT], {
      env: { ...process.env, CHECK_DS_SRC: src },
      encoding: 'utf8',
    });
    return { code: 0, output };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('check:ds extended guards', () => {
  it('passes on a clean tree that uses design-system tokens', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'clean.tsx'),
      `export const C = () => <div className="bg-muted text-success" style={{ zIndex: Z_INDEX.overlay }} />;\n` +
        `setTimeout(() => void 0, TIMING.toastDismiss);\nsetTimeout(() => void 0, 0);\n`,
    );
    writeFileSync(
      join(root, 'features', 'ok.tsx'),
      `export const Overlay = () => <div className="fixed bottom-0 bg-card" />;\n`,
    );
    const { code } = runGuard(root);
    expect(code).toBe(0);
  });

  it('fails on a raw Tailwind palette colour', () => {
    const root = makeTree();
    writeFileSync(join(root, 'bad.tsx'), `export const x = "bg-slate-50 text-green-700";\n`);
    const { code, output } = runGuard(root);
    expect(code).not.toBe(0);
    expect(output).toContain('raw Tailwind palette colour');
  });

  it('fails on an arbitrary z-index', () => {
    const root = makeTree();
    writeFileSync(join(root, 'bad.tsx'), `export const x = <div className="z-[70]" />;\n`);
    const { code, output } = runGuard(root);
    expect(code).not.toBe(0);
    expect(output).toContain('arbitrary z-index');
  });

  it('fails on a bare magic-number setTimeout but not on a 0-delay next-tick', () => {
    const root = makeTree();
    writeFileSync(join(root, 'bad.tsx'), `setTimeout(() => doThing(), 3000);\n`);
    const bad = runGuard(root);
    expect(bad.code).not.toBe(0);
    expect(bad.output).toContain('magic-number setTimeout');

    const clean = makeTree();
    writeFileSync(join(clean, 'ok.tsx'), `setTimeout(() => { p = null; }, 0);\n`);
    expect(runGuard(clean).code).toBe(0);
  });

  it('fails on a hand-rolled fixed inset-0 overlay in feature code', () => {
    const root = makeTree();
    writeFileSync(
      join(root, 'features', 'bad.tsx'),
      `export const M = () => <div className="fixed inset-0 bg-background" />;\n`,
    );
    const { code, output } = runGuard(root);
    expect(code).not.toBe(0);
    expect(output).toContain('fixed inset-0');
  });
});

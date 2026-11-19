/**
 * Read a square travel matrix. Indices are always in range by construction
 * (`matrixIndex` / `originIndex` point at existing rows), so this localizes the
 * single invariant assertion that `noUncheckedIndexedAccess` would otherwise
 * force at every call site.
 */
export function travelAt(travelS: number[][], from: number, to: number): number {
  return travelS[from]![to]!;
}

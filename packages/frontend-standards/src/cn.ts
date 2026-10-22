import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The single class-composition helper for all Properfy frontends.
 *
 * Merges conditional class values (clsx) and de-duplicates conflicting Tailwind
 * utilities (tailwind-merge), so the last-wins rule is honoured. This is the ONLY
 * sanctioned way to build a `className` — never hand-concatenate template literals.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };

import { isPlottablePoint } from '@properfy/shared';

/**
 * Builds a turn-by-turn navigation deep link. Apple Maps on iOS/iPadOS, Google
 * Maps elsewhere. Pure: platform detection reads the injected `env`, never a
 * global, so it is fully testable. When the point is not plottable the full
 * address is URL-encoded in place of the coordinates.
 */

export interface NavigationTarget {
  lat: number | null | undefined;
  lng: number | null | undefined;
  address: string;
}

export interface NavigationEnv {
  userAgent: string;
  maxTouchPoints: number;
}

/** iOS/iPadOS: iPhone/iPad/iPod UA, or a desktop `Macintosh` UA with touch (iPadOS). */
export function isApplePlatform(env: NavigationEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

function resolveEnv(env?: Partial<NavigationEnv>): NavigationEnv {
  return {
    userAgent: env?.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    maxTouchPoints:
      env?.maxTouchPoints ?? (typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0),
  };
}

export function buildNavigationUrl(target: NavigationTarget, env?: Partial<NavigationEnv>): string {
  const resolved = resolveEnv(env);
  const apple = isApplePlatform(resolved);
  const plottable = isPlottablePoint({ latitude: target.lat, longitude: target.lng });
  const destination = plottable
    ? `${target.lat},${target.lng}`
    : encodeURIComponent(target.address);

  return apple
    ? `https://maps.apple.com/?daddr=${destination}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}

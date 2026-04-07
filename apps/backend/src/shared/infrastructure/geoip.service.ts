/**
 * Interface for resolving IP addresses to country codes.
 * Can be swapped for a real provider (MaxMind, ipinfo.io) later.
 */
export interface IGeoIpService {
  resolveCountry(ip: string): Promise<string | null>;
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^::1$/,
  /^0\.0\.0\.0$/,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(ip));
}

/**
 * Stub implementation that returns null for private IPs and 'XX' for all others.
 * Replace with a real provider for production geo-IP resolution.
 */
export class StubGeoIpService implements IGeoIpService {
  async resolveCountry(ip: string): Promise<string | null> {
    if (!ip || isPrivateIp(ip)) {
      return null;
    }
    return 'XX';
  }
}

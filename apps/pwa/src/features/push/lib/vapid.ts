/**
 * Helpers for Web Push VAPID keys.
 *
 * `urlBase64ToUint8Array` converts a server VAPID public key (URL-safe base64,
 * unpadded) into the `applicationServerKey` bytes `PushManager.subscribe`
 * expects. `keysEqual` compares the key stored on a live subscription
 * (`subscription.options.applicationServerKey`, an `ArrayBuffer`) with the
 * freshly decoded server key so the client can detect a VAPID rotation
 * (L-F02-04) and re-subscribe.
 */

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

export function keysEqual(
  a: ArrayBuffer | null | undefined,
  b: Uint8Array | null | undefined,
): boolean {
  if (!a || !b) return false;
  const left = new Uint8Array(a);
  if (left.length !== b.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== b[i]) return false;
  }
  return true;
}

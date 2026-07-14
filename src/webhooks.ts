/**
 * Verify signed lifecycle webhooks from Postcept.
 *
 * Postcept signs every delivery:
 *
 *     Postcept-Signature: t=<unix-seconds>,v1=<hex hmac-sha256 over "{t}.{raw body}">
 *
 * During a secret rotation the header carries one `v1` entry per active secret, so
 * a delivery verifies with either the new or the still-valid previous secret.
 * Delivery is at-least-once and unordered: once a delivery verifies, de-duplicate
 * by the `Postcept-Event-Id` header before acting on the event.
 */

export const DEFAULT_TOLERANCE_SECONDS = 300;

/** All values for a key in a `k=v,k=v` header. `v1` can repeat. */
function values(header: string, key: string): string[] {
  const out: string[] = [];
  for (const item of header.split(",")) {
    const eq = item.indexOf("=");
    if (eq === -1) continue;
    if (item.slice(0, eq).trim() === key) out.push(item.slice(eq + 1).trim());
  }
  return out;
}

function hex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Compare two hex digests without leaking where they diverge. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyOptions {
  toleranceSeconds?: number;
  /** Unix seconds. Override only in tests. */
  now?: number;
}

/**
 * True when the signature header matches the raw request body.
 *
 * `payload` must be the exact bytes received, before any JSON parsing or
 * re-serialization: re-encoding a parsed body changes the bytes and the signature
 * will not match. A stale timestamp (outside `toleranceSeconds`), a malformed
 * header, or a mismatched signature returns false rather than throwing.
 */
export async function verifySignature(
  payload: Uint8Array | string,
  header: string,
  secret: string,
  options: VerifyOptions = {}
): Promise<boolean> {
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ?? Date.now() / 1000;

  const timestamps = values(header, "t");
  const signatures = values(header, "v1");
  if (timestamps.length !== 1 || signatures.length === 0) return false;
  if (!/^\d+$/.test(timestamps[0])) return false;
  const timestamp = Number(timestamps[0]);
  if (Math.abs(now - timestamp) > tolerance) return false;

  const body = typeof payload === "string" ? new TextEncoder().encode(payload) : payload;
  const prefix = new TextEncoder().encode(`${timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const expected = hex(await crypto.subtle.sign("HMAC", key, signed));
  return signatures.some((sig) => timingSafeEqual(expected, sig));
}

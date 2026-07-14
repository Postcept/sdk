// Deterministic idempotency keys.
//
// A random key per call is worse than useless: the retry that matters is the one
// where your process died and came back, and that retry generates a fresh random
// key, so the API sees a brand new request and verifies the same action twice.
// Keying off the request body instead means the same logical request maps to the
// same key on any machine, at any time.
//
// The encoding matches the Python SDK byte for byte (sorted keys, no whitespace,
// non-ASCII escaped), so the two clients agree on the key for a given request.

const NON_ASCII = new RegExp("[\\u0080-\\uffff]", "g");

function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(
    NON_ASCII,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

/** Deterministic JSON: keys sorted, no whitespace, non-ASCII escaped. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(obj)
        .sort()
        .map((k) => asciiJson(k) + ":" + canonicalJson(obj[k]))
        .join(",") +
      "}"
    );
  }
  return asciiJson(value);
}

/**
 * The idempotency key for a request body. Identical requests produce identical
 * keys, so a retry is deduped by the API rather than creating a second
 * verification.
 *
 * This dedupes retries of the *verification*. It does not make the underlying
 * customer action exactly-once: that is your system's job, not Postcept's.
 */
export async function requestDigest(body: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(body));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return "req-" + hex.slice(0, 40);
}

/**
 * Standard `postcept.*` attributes for a verification.
 *
 * Returns the attribute map so you can attach it to a span in whatever tracer you
 * run, without pulling OpenTelemetry into this package's dependencies.
 *
 *     import { trace } from "@opentelemetry/api";
 *     import { postceptSpanAttributes } from "@postcept/sdk";
 *
 *     const result = await pc.verifyRefund(...);
 *     trace.getActiveSpan()?.setAttributes(postceptSpanAttributes(result));
 */

/** Stable attribute keys, matching the documented Postcept OTel semantics. */
export const POSTCEPT_OTEL_KEYS = {
  operationId: "postcept.operation.id",
  contractId: "postcept.contract.id",
  contractVersion: "postcept.contract.version",
  result: "postcept.result",
  lifecycle: "postcept.lifecycle",
  safeToClaimComplete: "postcept.safe_to_claim_complete",
  receiptId: "postcept.receipt.id",
  correlationStrength: "postcept.correlation.strength",
  recovery: "postcept.recovery.state",
} as const;

/**
 * The standard `postcept.*` attributes for a verification response. Missing fields
 * are omitted, and every value is a string or boolean, which is what OTel accepts.
 */
export function postceptSpanAttributes(
  verification: Record<string, unknown>
): Record<string, string | boolean> {
  const contract = (verification.contract ?? {}) as Record<string, unknown>;
  const receipt = (verification.receipt ?? {}) as Record<string, unknown>;
  const candidates: Record<string, unknown> = {
    [POSTCEPT_OTEL_KEYS.operationId]: verification.operation_id,
    [POSTCEPT_OTEL_KEYS.contractId]: contract.name,
    [POSTCEPT_OTEL_KEYS.contractVersion]: contract.version,
    [POSTCEPT_OTEL_KEYS.result]: verification.result,
    [POSTCEPT_OTEL_KEYS.lifecycle]: verification.lifecycle,
    [POSTCEPT_OTEL_KEYS.safeToClaimComplete]: verification.safe_to_claim_complete,
    [POSTCEPT_OTEL_KEYS.receiptId]: receipt.id,
    [POSTCEPT_OTEL_KEYS.correlationStrength]: verification.correlation_strength,
    [POSTCEPT_OTEL_KEYS.recovery]: verification.recommended_recovery,
  };
  const out: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(candidates)) {
    if (typeof value === "string" || typeof value === "boolean") out[key] = value;
  }
  return out;
}

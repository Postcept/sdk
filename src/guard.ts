/**
 * Run your action in your own code, then verify it.
 *
 * `guard` calls your function and then verifies completion against the system of
 * record. Postcept never runs the action. You get back a typed result with a
 * status that is safe to show a customer: "processing" while a refund is still
 * pending, and never "done" until it was verified final.
 */

import { PostceptError } from "./agent";

export type CustomerStatus =
  | "completed"
  | "processing"
  | "failed"
  | "unverified"
  | "unreachable";

const MESSAGES: Record<CustomerStatus, string> = {
  completed: "All done. We've confirmed this completed.",
  processing: "This is processing and not final yet. We'll confirm shortly.",
  failed: "This didn't complete as expected. Our team is looking into it.",
  unverified: "We couldn't confirm this completed. Our team is looking into it.",
  unreachable: "We're confirming this now and will update you shortly.",
};

/** A verification (or a failed verify call) mapped to a customer-safe status. */
export function customerStatus(
  verification: Record<string, unknown> | null,
  errored: boolean
): CustomerStatus {
  if (verification === null) return errored ? "unreachable" : "unverified";
  if (verification.safe_to_claim_complete) return "completed";
  const lifecycle = verification.lifecycle;
  const reason = verification.claim_reason;
  if (lifecycle === "pending_finality" || reason === "pending_finality") return "processing";
  if (lifecycle === "unreachable" || lifecycle === "indeterminate") return "unreachable";
  return "unverified";
}

/**
 * The outcome of a guarded action: your action's result, the verification, and a
 * customer-safe status and message you can surface directly.
 */
export interface GuardedResult<T, V> {
  action: T;
  verification: V | null;
  safeToClaimComplete: boolean;
  status: CustomerStatus;
  customerMessage: string;
  error: PostceptError | null;
}

/**
 * Run `action`, then `verify` its completion.
 *
 * A non-verified outcome or an unreachable system of record comes back inside the
 * result rather than being thrown, so the caller has to handle it. A throw from
 * `action` propagates, since the action never ran.
 */
export async function guard<T, V extends Record<string, unknown>>(
  action: () => T | Promise<T>,
  verify: () => Promise<V>
): Promise<GuardedResult<T, V>> {
  const actionResult = await action();
  let verification: V | null = null;
  let error: PostceptError | null = null;
  try {
    verification = await verify();
  } catch (err) {
    if (!(err instanceof PostceptError)) throw err;
    error = err;
  }
  const status = customerStatus(verification, error !== null);
  return {
    action: actionResult,
    verification,
    safeToClaimComplete: Boolean(verification?.safe_to_claim_complete),
    status,
    customerMessage: MESSAGES[status],
    error,
  };
}

// Generated SDK surface: typed functions (createVerification, getVcr, and more) + types.
export * from "./client";
// Client configuration. Create a configured client per request (e.g. with a
// base URL and auth) instead of mutating the shared singleton.
export { createClient, createConfig } from "./client/client";
// Ergonomic agent wrapper.
export {
  PostceptAgent,
  PostceptError,
  type CancellationInput,
  type PostceptAgentOptions,
  type RefundInput,
  type TicketInput,
} from "./agent";
// Run the action yourself, then verify it. Returns a customer-safe status.
export {
  guard,
  customerStatus,
  type CustomerStatus,
  type GuardedResult,
} from "./guard";
// Verify signed lifecycle webhooks.
export {
  verifySignature,
  DEFAULT_TOLERANCE_SECONDS,
  type VerifyOptions,
} from "./webhooks";
// Standard postcept.* span attributes, for whatever tracer you run.
export { postceptSpanAttributes, POSTCEPT_OTEL_KEYS } from "./otel";
// Idempotency keys derived from the request, so retries dedupe across processes.
export { requestDigest, canonicalJson } from "./idempotency";

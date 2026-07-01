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

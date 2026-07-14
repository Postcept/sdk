// Ergonomic wrapper over the generated client for the common agent task:
// submitting verifications with an organization API key.
import {
  createVerification,
  getVerification,
  verifiedCompletionRate,
  type CancellationClaim,
  type ConnectorName,
  type RefundClaim,
  type TicketClaim,
  type Verification,
  type VcrSummary,
} from "./client";
import { type Client, createClient, createConfig } from "./client/client";
import { requestDigest } from "./idempotency";

const DEFAULT_BASE_URL = "https://api.postcept.com";

/** A failed Postcept API call, carrying the HTTP status and the server's detail. */
export class PostceptError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super(`Postcept API ${status}: ${detail}`);
    this.name = "PostceptError";
  }
}

function detailFrom(error: unknown): string {
  if (error && typeof error === "object" && "detail" in error) {
    const d = (error as { detail: unknown }).detail;
    return typeof d === "string" ? d : JSON.stringify(d);
  }
  return "request failed";
}

// Transient failures worth retrying: request timeout, rate limit, and the 5xx
// family. Other 4xx are the caller's request and won't succeed on a retry.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 20_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-jitter exponential backoff, honoring a Retry-After header when present. */
function backoffMs(attempt: number, response?: Response): number {
  const header = response?.headers.get("retry-after");
  if (header) {
    const secs = Number(header);
    if (Number.isFinite(secs)) return Math.min(secs * 1000, 30_000);
  }
  const cap = Math.min(30_000, 200 * 2 ** attempt);
  return Math.random() * cap;
}

export interface PostceptAgentOptions {
  apiKey: string;
  baseUrl?: string;
  /** Max retries on transient errors (408, 429, 5xx, network). Default 3. */
  retries?: number;
  /** Per-attempt request timeout in milliseconds. Default 20000. */
  timeoutMs?: number;
}

interface CommonInput {
  operationId: string;
  agentId: string;
  /** System of record to check (defaults to stripe for refunds/cancellations). */
  connector?: ConnectorName;
  /** Sandbox mode: verify against the deterministic mock, excluded from VCR. */
  test?: boolean;
  idempotencyKey?: string;
}

export interface RefundInput extends CommonInput {
  customer: string;
  amountCents: number;
  currency?: string;
  refundId?: string;
  chargeId?: string;
}

export interface CancellationInput extends CommonInput {
  subscriptionId: string;
  customer: string;
}

export interface TicketInput extends CommonInput {
  ticketId: string;
  status?: string;
  customer?: string;
}

export class PostceptAgent {
  private client: Client;
  private apiKey: string;
  private retries: number;
  private timeoutMs: number;

  constructor(options: PostceptAgentOptions) {
    this.client = createClient(createConfig({ baseUrl: options.baseUrl ?? DEFAULT_BASE_URL }));
    this.apiKey = options.apiKey;
    this.retries = options.retries ?? DEFAULT_RETRIES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private headers(idempotencyKey?: string): Record<string, string> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}` };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    return headers;
  }

  /**
   * Run a client call with a per-attempt timeout and bounded retries on transient
   * failures. POSTs carry an idempotency key (see submit), so a retry can't create a
   * duplicate. The awaits are inherently sequential (each retry depends on the last).
   */
  /* eslint-disable no-await-in-loop */
  private async call<T>(
    fn: (signal: AbortSignal) => Promise<{ data?: T; error?: unknown; response?: Response }>
  ): Promise<T> {
    let lastError: unknown = "request failed";
    let lastStatus = 0;
    for (let attempt = 0; attempt <= this.retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response | undefined;
      try {
        const res = await fn(controller.signal);
        response = res.response;
        if (!res.error && res.data !== undefined) return res.data;
        lastError = res.error;
        lastStatus = res.response?.status ?? 0;
        if (res.response && !RETRYABLE_STATUS.has(res.response.status)) {
          throw new PostceptError(res.response.status, detailFrom(res.error));
        }
      } catch (err) {
        if (err instanceof PostceptError) throw err;
        // A network error or an aborted (timed-out) attempt: fall through and retry.
        lastError = err;
        lastStatus = 0;
      } finally {
        clearTimeout(timer);
      }
      if (attempt < this.retries) await sleep(backoffMs(attempt, response));
    }
    throw new PostceptError(lastStatus, detailFrom(lastError));
  }
  /* eslint-enable no-await-in-loop */

  private async submit(
    input: CommonInput,
    claim: RefundClaim | CancellationClaim | TicketClaim
  ): Promise<Verification> {
    const body = {
      operation_id: input.operationId,
      agent_id: input.agentId,
      connector: input.connector,
      claim,
      test: input.test,
    };
    // Derive the key from the request itself when the caller didn't supply one. A
    // random key would defeat the point: a process that dies and retries would send
    // a new key, and the API would verify the same action a second time.
    const idempotencyKey = input.idempotencyKey ?? (await requestDigest(body));
    return this.call((signal) =>
      createVerification({
        client: this.client,
        headers: this.headers(idempotencyKey),
        signal,
        body,
      })
    );
  }

  /** Verify that a refund actually completed in the system of record. */
  verifyRefund(input: RefundInput): Promise<Verification> {
    return this.submit(input, {
      customer: input.customer,
      amount_cents: input.amountCents,
      currency: input.currency ?? "usd",
      refund_id: input.refundId ?? null,
      charge_id: input.chargeId ?? null,
    });
  }

  /** Verify that a subscription was actually cancelled in the system of record. */
  verifyCancellation(input: CancellationInput): Promise<Verification> {
    return this.submit(input, {
      subscription_id: input.subscriptionId,
      customer: input.customer,
    });
  }

  /** Verify that a support ticket is in the expected state in the system of record. */
  verifyTicket(input: TicketInput): Promise<Verification> {
    return this.submit(input, {
      ticket_id: input.ticketId,
      status: input.status,
      customer: input.customer ?? null,
    });
  }

  getVerification(id: string): Promise<Verification> {
    return this.call((signal) =>
      getVerification({
        client: this.client,
        headers: this.headers(),
        signal,
        path: { verification_id: id },
      })
    );
  }

  verifiedCompletionRate(): Promise<VcrSummary> {
    return this.call((signal) =>
      verifiedCompletionRate({ client: this.client, headers: this.headers(), signal })
    );
  }
}

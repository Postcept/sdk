# @postcept/sdk

Typed TypeScript client for the [Postcept API](https://postcept.com/docs).

Postcept is Proof-of-Completion for AI agents. After an agent takes a high-risk
action (a refund, a cancellation, a ticket resolution), you verify the action
actually happened in the system of record and get back a signed completion
receipt. `"done"` becomes proof, not a claim.

The package ships typed bindings generated from the API's OpenAPI contract, plus a
small `PostceptAgent` wrapper for the common flow. It runs in Node and any runtime
with `fetch`.

## Install

```bash
npm i @postcept/sdk
```

## Quick start

Create an organization API key in the dashboard, then verify a refund:

```ts
import { PostceptAgent } from "@postcept/sdk";

const postcept = new PostceptAgent({ apiKey: process.env.POSTCEPT_API_KEY! });

const result = await postcept.verifyRefund({
  operationId: "refund_8F31", // stable across retries and handoffs
  agentId: "SupportAgent-04",
  refundId: "re_4md82k",
  amountCents: 12000,
  currency: "usd",
  customer: "mara.ellis@example.com",
});

result.result; // "verified" | "incomplete" | "duplicated" | "mismatched" | "policy_failed"
result.receipt; // signed completion receipt
```

If the result is anything other than `verified`, the work is not done. Surface the
gap and recover.

`PostceptAgent` also exposes `verifyCancellation`, `verifyTicket`,
`getVerification`, and `verifiedCompletionRate`. Pass `test: true` on any verify
call to run against the sandbox connector, which is excluded from your Verified
Completion Rate.

## Guarding an action

`guard` runs your action and then verifies it. Postcept never runs the action
itself. You get back your action's result plus a status that is safe to put in
front of a customer, which is the part that is easy to get wrong: a refund that
your code submitted successfully is not a refund the customer has received.

```ts
import { guard } from "@postcept/sdk";

const outcome = await guard(
  () => stripe.refunds.create({ charge: "ch_1", amount: 12000 }),
  () =>
    postcept.verifyRefund({
      operationId: "refund_8F31",
      agentId: "SupportAgent-04",
      refundId: "re_4md82k",
      amountCents: 12000,
      currency: "usd",
    })
);

outcome.safeToClaimComplete; // false while the refund is still pending
outcome.status; // "completed" | "processing" | "failed" | "unverified" | "unreachable"
outcome.customerMessage; // wording that matches the status
```

A failed verification or an unreachable system of record comes back inside
`outcome.error` rather than being thrown, so you have to decide what to do about
it. A throw from the action propagates, since the action never ran.

## Idempotency

Every POST carries an `Idempotency-Key`. When you don't pass one, the SDK derives
it from the request body, so a retry after a crash maps to the same key and the
API returns the original verification instead of verifying the action twice. The
Python SDK derives the same key from the same request.

Pass `idempotencyKey` explicitly to override it. To deliberately re-check an
action, use `reconcile` rather than a fresh key.

## Webhooks

Postcept signs every delivery. Verify the signature against the raw request body,
before any JSON parsing, then de-duplicate on the `Postcept-Event-Id` header:
delivery is at-least-once and unordered.

```ts
import { verifySignature } from "@postcept/sdk";

const raw = await request.text();
const ok = await verifySignature(
  raw,
  request.headers.get("Postcept-Signature")!,
  process.env.POSTCEPT_WEBHOOK_SECRET!
);
```

During a secret rotation the header carries a signature per active secret, so a
delivery verifies with either the new or the previous one.

## Tracing

`postceptSpanAttributes` returns the standard `postcept.*` attributes for a
verification, so you can attach them to a span in whatever tracer you run without
this package depending on OpenTelemetry.

```ts
import { trace } from "@opentelemetry/api";
import { postceptSpanAttributes } from "@postcept/sdk";

trace.getActiveSpan()?.setAttributes(postceptSpanAttributes(result));
```

## Low-level client

Every operation is also a typed function, for full control over the request:

```ts
import { createClient, createConfig, verifiedCompletionRate } from "@postcept/sdk";

const client = createClient(createConfig({ baseUrl: "https://api.postcept.com" }));

const { data } = await verifiedCompletionRate({
  client,
  headers: { Authorization: `Bearer ${process.env.POSTCEPT_API_KEY}` },
});
```

## Verifying receipts

Receipts are Ed25519-signed and verifiable on their own with the open
[`@postcept/receipt`](https://www.npmjs.com/package/@postcept/receipt) package. You
do not need to trust the API to trust a result.

## License

MIT

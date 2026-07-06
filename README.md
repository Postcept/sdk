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
  idempotencyKey: "refund_8F31",
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

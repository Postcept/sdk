// Idempotency keys are derived from the request body, so the same logical request
// maps to the same key on any machine, in any process, in either language. The
// expected keys below were produced by the Python SDK. If this file ever goes red,
// the two clients have drifted and a cross-language retry would double-verify.

import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson, requestDigest } from "../dist/index.js";

const BODY = {
  operation_id: "op_7f3a",
  agent_id: "refund-bot",
  connector: null,
  claim: {
    refund_id: "re_4md82k",
    amount_cents: 12000,
    currency: "usd",
    customer: "mara.ellis@example.com",
  },
  test: false,
};

test("canonical form sorts keys and drops whitespace", () => {
  assert.equal(
    canonicalJson(BODY),
    '{"agent_id":"refund-bot","claim":{"amount_cents":12000,"currency":"usd",' +
      '"customer":"mara.ellis@example.com","refund_id":"re_4md82k"},"connector":null,' +
      '"operation_id":"op_7f3a","test":false}'
  );
});

test("non-ASCII is escaped the way Python's json.dumps escapes it", () => {
  assert.equal(
    canonicalJson({ claim: { customer: "josé@example.com" }, operation_id: "op_ü" }),
    '{"claim":{"customer":"jos\\u00e9@example.com"},"operation_id":"op_\\u00fc"}'
  );
});

test("the key matches the Python SDK for the same request", async () => {
  assert.equal(await requestDigest(BODY), "req-a17dfac909affb00af5533e42cd359f75f71ae6b");
  assert.equal(
    await requestDigest({ claim: { customer: "josé@example.com" }, operation_id: "op_ü" }),
    "req-a5277702dfc3ac3c115c37a6ab91e5da3f568437"
  );
});

test("key order in the source object doesn't change the key", async () => {
  const shuffled = {
    test: false,
    claim: {
      customer: "mara.ellis@example.com",
      currency: "usd",
      refund_id: "re_4md82k",
      amount_cents: 12000,
    },
    agent_id: "refund-bot",
    operation_id: "op_7f3a",
    connector: null,
  };
  assert.equal(await requestDigest(shuffled), await requestDigest(BODY));
});

test("a different amount is a different request", async () => {
  const other = { ...BODY, claim: { ...BODY.claim, amount_cents: 12001 } };
  assert.notEqual(await requestDigest(other), await requestDigest(BODY));
});

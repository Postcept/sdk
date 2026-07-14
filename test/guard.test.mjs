// The guard wrapper and the customer-safe status mapping. Run against the built
// output, so this exercises exactly what consumers import.

import assert from "node:assert/strict";
import { test } from "node:test";

import { PostceptError, customerStatus, guard } from "../dist/index.js";

const VERIFIED = { safe_to_claim_complete: true, lifecycle: "finalized" };
const PENDING = { safe_to_claim_complete: false, lifecycle: "pending_finality" };

test("a verified final action is the only thing that reads as completed", () => {
  assert.equal(customerStatus(VERIFIED, false), "completed");
  assert.equal(customerStatus(PENDING, false), "processing");
  assert.equal(customerStatus({ safe_to_claim_complete: false }, false), "unverified");
});

test("a pending refund never reads as done", () => {
  // The whole point: the action succeeded as far as the caller's code knows, but
  // the money hasn't moved yet, so the customer must not be told it has.
  assert.equal(customerStatus({ ...PENDING, result: "verified" }, false), "processing");
});

test("an unreachable system of record is distinct from an unverified one", () => {
  assert.equal(customerStatus(null, true), "unreachable");
  assert.equal(customerStatus(null, false), "unverified");
  assert.equal(customerStatus({ lifecycle: "indeterminate" }, false), "unreachable");
});

test("guard returns the action result alongside the verification", async () => {
  const result = await guard(
    () => ({ refundId: "re_1" }),
    async () => VERIFIED
  );
  assert.deepEqual(result.action, { refundId: "re_1" });
  assert.equal(result.safeToClaimComplete, true);
  assert.equal(result.status, "completed");
  assert.equal(result.error, null);
});

test("a failed verify call is returned, not thrown, so the caller has to handle it", async () => {
  const result = await guard(
    () => "done",
    async () => {
      throw new PostceptError(503, "system of record unreachable");
    }
  );
  assert.equal(result.action, "done");
  assert.equal(result.verification, null);
  assert.equal(result.safeToClaimComplete, false);
  assert.equal(result.status, "unreachable");
  assert.equal(result.error.status, 503);
});

test("a throw from the action propagates, since the action never ran", async () => {
  await assert.rejects(
    guard(
      () => {
        throw new Error("stripe declined");
      },
      async () => VERIFIED
    ),
    /stripe declined/
  );
});

test("an unexpected error inside verify is not swallowed", async () => {
  await assert.rejects(
    guard(
      () => "done",
      async () => {
        throw new TypeError("bug in the caller's verify function");
      }
    ),
    TypeError
  );
});

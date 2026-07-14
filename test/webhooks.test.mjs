// Webhook signature verification. The vector below was produced by the Python SDK
// against the same secret and body, so both clients accept the same delivery.

import assert from "node:assert/strict";
import { test } from "node:test";

import { verifySignature } from "../dist/index.js";

const SECRET = "whsec_test";
const PAYLOAD = '{"event":"verification.changed"}';
const TS = 1_752_400_000;
const SIG = "d4596129c15579a00b050923317086d866092f4bd70b87e357082aca0a68d94b";
const HEADER = `t=${TS},v1=${SIG}`;
// Verify as though it arrived the moment it was signed.
const NOW = { now: TS };

test("a genuine delivery verifies", async () => {
  assert.equal(await verifySignature(PAYLOAD, HEADER, SECRET, NOW), true);
});

test("raw bytes and the equivalent string verify identically", async () => {
  const bytes = new TextEncoder().encode(PAYLOAD);
  assert.equal(await verifySignature(bytes, HEADER, SECRET, NOW), true);
});

test("a tampered body fails", async () => {
  const forged = '{"event":"verification.changed","amount_cents":1}';
  assert.equal(await verifySignature(forged, HEADER, SECRET, NOW), false);
});

test("the wrong secret fails", async () => {
  assert.equal(await verifySignature(PAYLOAD, HEADER, "whsec_other", NOW), false);
});

test("a replayed delivery outside the tolerance fails", async () => {
  assert.equal(await verifySignature(PAYLOAD, HEADER, SECRET, { now: TS + 3600 }), false);
  // Still inside the window.
  assert.equal(await verifySignature(PAYLOAD, HEADER, SECRET, { now: TS + 60 }), true);
});

test("during a rotation, either active secret verifies", async () => {
  // The header carries one v1 entry per active secret. The old secret's signature
  // sits alongside the new one, so nothing drops on the floor mid-rotation.
  const header = `t=${TS},v1=${"0".repeat(64)},v1=${SIG}`;
  assert.equal(await verifySignature(PAYLOAD, header, SECRET, NOW), true);
});

test("a malformed header returns false rather than throwing", async () => {
  for (const header of ["", "garbage", `t=${TS}`, `v1=${SIG}`, `t=abc,v1=${SIG}`, `t=1,t=2,v1=${SIG}`]) {
    assert.equal(await verifySignature(PAYLOAD, header, SECRET, NOW), false, header);
  }
});

import assert from "node:assert/strict";
import test from "node:test";
import { MemoryRelayStore } from "../src/relay-store.mjs";
import { RelayService, unavailableState } from "../src/relay-service.mjs";

test("fresh successor resumes, then current authority changes ALLOW to HOLD", async () => {
  const store = await new MemoryRelayStore().connect();
  const service = new RelayService({ store });
  await service.agentA();
  const allowed = await service.agentB();
  assert.equal(allowed.decision, "ALLOW");
  assert.equal(allowed.actionCount, 1);
  assert.equal(allowed.checkpoint.completed_steps.includes("inspect_task"), true);
  await service.revoke();
  const held = await service.agentB();
  assert.equal(held.decision, "HOLD");
  assert.equal(held.reason, "STALE_AUTHORITY");
  assert.equal(held.actionCount, 1);
  assert.equal(held.unrelatedCount, 1);
  assert.notEqual(allowed.agentBProcess, held.agentBProcess);
});

test("missing checkpoint fails closed with zero protected actions", async () => {
  const store = await new MemoryRelayStore().connect();
  const service = new RelayService({ store });
  const held = await service.agentB();
  assert.equal(held.decision, "HOLD");
  assert.equal(held.reason, "MISSING_CHECKPOINT");
  assert.equal(held.actionCount, 0);
});

test("database unavailability has an explicit fail-closed API result", () => {
  const held = unavailableState();
  assert.equal(held.mode, "OFFLINE");
  assert.equal(held.decision, "HOLD");
  assert.equal(held.reason, "DB_UNAVAILABLE");
  assert.equal(held.protectedDelta, 0);
  assert.equal(held.actionCount, null);
});

import { createHash } from "node:crypto";
import { MongoClient } from "mongodb";

export const TASK_ID = "TASK-ENID-RELAY-001";
export const ACTION_ID = "WRITE-SYNTHETIC-PLAN-001";
export const AUTHORITY_ID = "ATT-ENID-RELAY-001";

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function cleanDocument(document) {
  if (!document) return null;
  const { _id, ...rest } = document;
  return { id: String(_id), ...rest };
}

export class MongoRelayStore {
  constructor({ uri, database = "enid_mandate_relay" }) {
    if (!uri) throw new Error("MONGODB_URI_REQUIRED");
    this.client = new MongoClient(uri, {
      appName: "enid-mandate-relay-aug13",
      serverSelectionTimeoutMS: 5_000,
      retryWrites: true,
    });
    this.databaseName = database;
  }

  async connect() {
    await this.client.connect();
    this.db = this.client.db(this.databaseName);
    await Promise.all([
      this.db.collection("checkpoints").createIndex({ task_id: 1 }, { unique: true }),
      this.db.collection("authorities").createIndex({ authority_id: 1 }, { unique: true }),
      this.db.collection("receipts").createIndex({ attempt_id: 1 }, { unique: true }),
    ]);
    return this;
  }

  async close() { await this.client.close(); }

  async reset() {
    await Promise.all([
      this.db.collection("checkpoints").deleteMany({}),
      this.db.collection("authorities").deleteMany({}),
      this.db.collection("receipts").deleteMany({}),
      this.db.collection("counters").deleteMany({}),
      this.db.collection("runs").deleteMany({}),
    ]);
    await this.db.collection("authorities").insertOne({
      authority_id: AUTHORITY_ID,
      status: "ACTIVE",
      epoch: 1,
      task_id: TASK_ID,
      updated_at: new Date(),
    });
    await this.db.collection("counters").insertOne({
      _id: "COUNTERS",
      protected_actions: 0,
      unrelated_actions: 0,
    });
  }

  async writeCheckpoint({ processId, runId }) {
    const checkpoint = {
      task_id: TASK_ID,
      checkpoint_id: "CHECKPOINT-001",
      agent: "A",
      run_id: runId,
      process_id: processId,
      completed_steps: ["inspect_task", "reject_unsafe_shortcut"],
      learned_constraint: "protected actions require current authority",
      next_action: ACTION_ID,
      saved_at: new Date(),
    };
    const checkpoint_sha256 = digest(checkpoint);
    await this.db.collection("checkpoints").replaceOne(
      { task_id: TASK_ID },
      { ...checkpoint, checkpoint_sha256 },
      { upsert: true },
    );
    await this.db.collection("runs").insertOne({
      run_id: runId, agent: "A", process_id: processId, exited: true, task_id: TASK_ID,
    });
    return { ...checkpoint, checkpoint_sha256 };
  }

  async attemptAction({ attemptId, processId, runId }) {
    const session = this.client.startSession();
    try {
      return await session.withTransaction(async () => {
        const receipts = this.db.collection("receipts");
        const prior = await receipts.findOne({ attempt_id: attemptId }, { session });
        if (prior) return cleanDocument(prior);

        const checkpoint = await this.db.collection("checkpoints").findOne(
          { task_id: TASK_ID }, { session },
        );
        if (!checkpoint) {
          const receipt = {
            attempt_id: attemptId, task_id: TASK_ID, action_id: ACTION_ID,
            run_id: runId, process_id: processId, decision: "HOLD",
            reason: "MISSING_CHECKPOINT", protected_delta: 0, unrelated_delta: 0,
            created_at: new Date(),
          };
          await receipts.insertOne(receipt, { session });
          return receipt;
        }

        const authorities = this.db.collection("authorities");
        // This conditional write makes the authority check part of the same
        // transaction as the protected counter and receipt. A concurrent
        // revocation therefore either follows this action or forces a retry
        // that observes REVOKED; an old snapshot cannot slip through.
        const currentAuthority = await authorities.findOneAndUpdate(
          { authority_id: AUTHORITY_ID, status: "ACTIVE" },
          { $inc: { gate_checks: 1 }, $set: { last_gate_at: new Date() } },
          { session, returnDocument: "after" },
        );
        const authority = currentAuthority ?? await authorities.findOne(
          { authority_id: AUTHORITY_ID }, { session },
        );
        const allowed = Boolean(currentAuthority);
        const protectedDelta = allowed ? 1 : 0;
        const unrelatedDelta = allowed ? 0 : 1;
        const updated = await this.db.collection("counters").findOneAndUpdate(
          { _id: "COUNTERS" },
          { $inc: { protected_actions: protectedDelta, unrelated_actions: unrelatedDelta } },
          { session, returnDocument: "after" },
        );
        const receipt = {
          attempt_id: attemptId,
          task_id: TASK_ID,
          action_id: ACTION_ID,
          run_id: runId,
          process_id: processId,
          checkpoint_sha256: checkpoint.checkpoint_sha256,
          authority_id: AUTHORITY_ID,
          authority_epoch: authority?.epoch ?? null,
          decision: allowed ? "ALLOW" : "HOLD",
          reason: allowed ? "CURRENT_AUTHORITY" : "STALE_AUTHORITY",
          protected_delta: protectedDelta,
          unrelated_delta: unrelatedDelta,
          protected_actions_after: updated.protected_actions,
          unrelated_actions_after: updated.unrelated_actions,
          created_at: new Date(),
        };
        receipt.receipt_sha256 = digest(receipt);
        await receipts.insertOne(receipt, { session });
        await this.db.collection("runs").insertOne(
          { run_id: runId, agent: "B", process_id: processId, task_id: TASK_ID },
          { session },
        );
        return receipt;
      }, {
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
      });
    } finally {
      await session.endSession();
    }
  }

  async revoke() {
    const result = await this.db.collection("authorities").findOneAndUpdate(
      { authority_id: AUTHORITY_ID },
      { $set: { status: "REVOKED", updated_at: new Date() }, $inc: { epoch: 1 } },
      { returnDocument: "after" },
    );
    if (!result) throw new Error("AUTHORITY_NOT_FOUND");
    return cleanDocument(result);
  }

  async state() {
    const [checkpoint, authority, counters, receipt, runs] = await Promise.all([
      this.db.collection("checkpoints").findOne({ task_id: TASK_ID }),
      this.db.collection("authorities").findOne({ authority_id: AUTHORITY_ID }),
      this.db.collection("counters").findOne({ _id: "COUNTERS" }),
      this.db.collection("receipts").find({ task_id: TASK_ID }).sort({ created_at: -1 }).limit(1).next(),
      this.db.collection("runs").find({ task_id: TASK_ID }).sort({ _id: 1 }).toArray(),
    ]);
    return {
      mode: "LIVE_ATLAS",
      liveAtlas: true,
      taskId: TASK_ID,
      checkpointId: checkpoint?.checkpoint_id ?? null,
      checkpoint: cleanDocument(checkpoint),
      authorityStatus: authority?.status ?? "MISSING",
      authority: cleanDocument(authority),
      decision: receipt?.decision ?? null,
      reason: receipt?.reason ?? null,
      actionCount: counters?.protected_actions ?? 0,
      unrelatedCount: counters?.unrelated_actions ?? 0,
      agentAProcess: runs.find((run) => run.agent === "A")?.process_id ?? null,
      agentBProcess: [...runs].reverse().find((run) => run.agent === "B")?.process_id ?? null,
      documentDigest: checkpoint?.checkpoint_sha256 ?? null,
      latestReceipt: cleanDocument(receipt),
      runs: runs.map(cleanDocument),
    };
  }
}

export class MemoryRelayStore {
  constructor() { this.mode = "LOCAL_FAKE"; }
  async connect() { await this.reset(); return this; }
  async close() {}
  async reset() {
    this.checkpoint = null;
    this.authority = { authority_id: AUTHORITY_ID, status: "ACTIVE", epoch: 1 };
    this.receipts = [];
    this.runs = [];
    this.protected = 0;
    this.unrelated = 0;
  }
  async writeCheckpoint({ processId, runId }) {
    this.checkpoint = { task_id: TASK_ID, checkpoint_id: "CHECKPOINT-001", run_id: runId,
      process_id: processId, completed_steps: ["inspect_task", "reject_unsafe_shortcut"],
      next_action: ACTION_ID, checkpoint_sha256: digest({ task_id: TASK_ID, runId }) };
    this.runs.push({ agent: "A", process_id: processId, run_id: runId, exited: true });
    return this.checkpoint;
  }
  async attemptAction({ attemptId, processId, runId }) {
    const prior = this.receipts.find((item) => item.attempt_id === attemptId);
    if (prior) return prior;
    const allowed = Boolean(this.checkpoint) && this.authority.status === "ACTIVE";
    if (allowed) this.protected += 1; else if (this.checkpoint) this.unrelated += 1;
    const receipt = { attempt_id: attemptId, process_id: processId, run_id: runId,
      decision: allowed ? "ALLOW" : "HOLD",
      reason: !this.checkpoint ? "MISSING_CHECKPOINT" : allowed ? "CURRENT_AUTHORITY" : "STALE_AUTHORITY",
      protected_delta: allowed ? 1 : 0, unrelated_delta: !allowed && this.checkpoint ? 1 : 0,
      protected_actions_after: this.protected, unrelated_actions_after: this.unrelated };
    this.receipts.push(receipt); this.runs.push({ agent: "B", process_id: processId, run_id: runId });
    return receipt;
  }
  async revoke() { this.authority.status = "REVOKED"; this.authority.epoch += 1; return this.authority; }
  async state() {
    const latest = this.receipts.at(-1) ?? null;
    return { mode: "LOCAL_FAKE", localFake: true, taskId: TASK_ID,
      checkpointId: this.checkpoint?.checkpoint_id ?? null, checkpoint: this.checkpoint,
      authorityStatus: this.authority.status, authority: this.authority,
      decision: latest?.decision ?? null, reason: latest?.reason ?? null,
      actionCount: this.protected, unrelatedCount: this.unrelated,
      agentAProcess: this.runs.find((r) => r.agent === "A")?.process_id ?? null,
      agentBProcess: [...this.runs].reverse().find((r) => r.agent === "B")?.process_id ?? null,
      documentDigest: this.checkpoint?.checkpoint_sha256 ?? null, latestReceipt: latest, runs: this.runs };
  }
}

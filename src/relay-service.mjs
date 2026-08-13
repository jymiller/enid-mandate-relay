import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TASK_ID } from "./relay-store.mjs";

const workerPath = fileURLToPath(new URL("./agent-worker.mjs", import.meta.url));

export function unavailableState() {
  return {
    mode: "OFFLINE",
    liveAtlas: false,
    decision: "HOLD",
    reason: "DB_UNAVAILABLE",
    protectedDelta: 0,
    actionCount: null,
  };
}

export function spawnWorker(role, attemptId = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, role, TASK_ID, attemptId], {
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.trim() || `WORKER_EXIT_${code}`));
      try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error("INVALID_WORKER_OUTPUT")); }
    });
  });
}

export class RelayService {
  constructor({ store, worker = null }) { this.store = store; this.worker = worker; this.attempt = 0; }
  async reset() { await this.store.reset(); this.attempt = 0; return this.store.state(); }
  async agentA() {
    if (this.worker) await this.worker("A", "");
    else await this.store.writeCheckpoint({ processId: process.pid + 1, runId: `A-${randomUUID()}` });
    return this.store.state();
  }
  async agentB() {
    this.attempt += 1;
    const attemptId = `ATTEMPT-${this.attempt}`;
    if (this.worker) await this.worker("B", attemptId);
    else await this.store.attemptAction({ attemptId, processId: process.pid + this.attempt + 1, runId: `B-${randomUUID()}` });
    return this.store.state();
  }
  async revoke() { await this.store.revoke(); return this.store.state(); }
  async state() { return this.store.state(); }
}

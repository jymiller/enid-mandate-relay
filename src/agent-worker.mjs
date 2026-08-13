import { randomUUID } from "node:crypto";
import { MongoRelayStore } from "./relay-store.mjs";

const [role, taskId, attemptId] = process.argv.slice(2);
const runId = `${role}-${randomUUID()}`;
if (taskId !== "TASK-ENID-RELAY-001") throw new Error("UNKNOWN_TASK");

const store = await new MongoRelayStore({
  uri: process.env.MONGODB_URI,
  database: process.env.MONGODB_DATABASE || "enid_mandate_relay",
}).connect();
try {
  const result = role === "A"
    ? await store.writeCheckpoint({ processId: process.pid, runId })
    : await store.attemptAction({ attemptId, processId: process.pid, runId });
  process.stdout.write(`${JSON.stringify({ role, runId, processId: process.pid, result })}\n`);
} finally {
  await store.close();
}

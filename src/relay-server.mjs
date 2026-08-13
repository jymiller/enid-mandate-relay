import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MemoryRelayStore, MongoRelayStore } from "./relay-store.mjs";
import { RelayService, spawnWorker } from "./relay-service.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const uri = process.env.MONGODB_URI;
const useFake = process.env.DEMO_MODE === "local-fake";
if (!uri && !useFake) {
  console.error("MONGODB_URI is required. Set DEMO_MODE=local-fake only for rehearsal.");
  process.exit(1);
}
const store = useFake
  ? await new MemoryRelayStore().connect()
  : await new MongoRelayStore({ uri, database: process.env.MONGODB_DATABASE }).connect();
const service = new RelayService({ store, worker: useFake ? null : spawnWorker });
await service.reset();

const routes = new Map([
  ["GET /api/state", () => service.state()],
  ["POST /api/reset", () => service.reset()],
  ["POST /api/agent-a", () => service.agentA()],
  ["POST /api/agent-b", () => service.agentB()],
  ["POST /api/revoke", () => service.revoke()],
]);

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const server = createServer(async (request, response) => {
  try {
    const route = routes.get(`${request.method} ${new URL(request.url, "http://localhost").pathname}`);
    if (route) {
      const payload = await route();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      return response.end(JSON.stringify(payload));
    }
    const pathname = new URL(request.url, "http://localhost").pathname;
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    if (!/^[A-Za-z0-9._/-]+$/.test(relative) || relative.includes("..")) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
    const bytes = await readFile(path.join(root, "public", relative));
    response.writeHead(200, { "content-type": mime[path.extname(relative)] || "application/octet-stream" });
    response.end(bytes);
  } catch (error) {
    const status = error.status || (error.code === "ENOENT" ? 404 : 503);
    response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    response.end(JSON.stringify({ mode: "OFFLINE", liveAtlas: false, decision: "HOLD", reason: status === 404 ? "NOT_FOUND" : "DB_UNAVAILABLE" }));
  }
});

const port = Number(process.env.PORT || 4318);
server.listen(port, "127.0.0.1", () => console.log(`Enid Mandate Relay: http://127.0.0.1:${port}`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { server.close(); await store.close(); process.exit(0); });

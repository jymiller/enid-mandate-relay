# Enid Mandate — Relay proof

**A fresh coding agent resumes a MongoDB checkpoint, then the same action changes from `ALLOW` to `HOLD` when its authority is revoked.**

Built on **August 13, 2026** during SF .local Build Fest. This repository is a new event-time implementation. No code was copied from the private Enid repository; that earlier work was used only to identify the business question worth testing.

| Public repo | One-minute video |
| --- | --- |
| `PUBLIC_REPO_URL_TODO` | `VIDEO_URL_TODO` |

## The proof

1. Agent A writes a checkpoint and exact next action to MongoDB, then exits.
2. A fresh Agent B process starts without Agent A's local memory, reads the checkpoint, and receives `ALLOW`.
3. Authority is revoked in MongoDB.
4. Another fresh Agent B retries the exact action and receives `HOLD`; the action count does not increase.

The page never paints those outcomes in advance. It starts `OFFLINE`, calls the API, and renders returned process IDs, checkpoint evidence, authority, decisions, and action counts. The final `+0 ACTIONS` proof is calculated by comparing server-returned counts before and after the retry.

## Why MongoDB is causal

MongoDB is not a decorative event log. It holds both facts needed to decide what may happen next:

- **continuity:** the checkpoint that lets a new process resume the prior process's work;
- **control:** the current authority record checked immediately before the next action.

Remove the stored checkpoint and Agent B cannot resume. Change the stored authority and the identical next action changes from `ALLOW` to `HOLD`. A failure to read current state fails closed.

## Run locally

Requirements: Node.js 22+ and a MongoDB Atlas connection string.

```sh
npm install
cp .env.example .env
npm start
```

Set `MONGODB_URI` and the other Atlas values documented in `.env.example`, then open the local URL printed by the server. Use a dedicated event database and a least-privilege database user. Do not commit `.env` or a connection string.

The server may also expose an explicit local-fake mode for UI rehearsal. The header must say `LOCAL FAKE` in that mode. Only a successful Atlas-backed run may display `LIVE ATLAS`; an unavailable or unrecognized backend displays `OFFLINE`.

Run all checks:

```sh
npm test
```

## API

| Method | Route | Role |
| --- | --- | --- |
| `GET` | `/api/state` | Return current database-backed proof state |
| `POST` | `/api/reset` | Reset this synthetic demo run |
| `POST` | `/api/agent-a` | Spawn Agent A and persist its checkpoint |
| `POST` | `/api/agent-b` | Spawn a fresh Agent B and attempt the exact next action |
| `POST` | `/api/revoke` | Revoke current authority in MongoDB |

Every business result shown in the UI comes from these responses. Synthetic records only; this demo does not mutate a real repository or approve a real deal.

## Exactly 60-second video script

Record only this repository and the app built today. Keep the live status, process IDs, MongoDB document evidence, and action count visible.

- **00:00–00:05** — Title: “Enid Mandate — MongoDB-backed agent continuity with bounded authority.” Say: “Agents can continue the work without inheriting unlimited authority.”
- **00:05–00:15** — Run Agent A. Show its process ID and new Atlas checkpoint document. Say: “Agent A stores a structured handoff in the Build Fest Atlas sandbox.”
- **00:15–00:22** — Show Agent A exited. Start fresh Agent B with no chat, local checkpoint, browser storage, or in-memory handoff. Say: “Agent A is gone. Agent B starts fresh—no chat or local checkpoint.”
- **00:22–00:35** — Give Agent B only the task ID. Show the MongoDB read, recovered checkpoint, and completed step skipped. Say: “Agent B reconstructs the work from MongoDB and avoids repeating it.”
- **00:35–00:43** — Attempt the protected action. Show `ALLOW`, one receipt, and protected action count `1`. Say: “Current authority allows this exact protected action.”
- **00:43–00:48** — Revoke authority; show stored epoch/status change. Say: “Now the governing attestation changes.”
- **00:48–00:57** — Start an identical fresh attempt. Show `HOLD`, protected count still `1`, and unrelated counter advance. Say: “The same action now holds with zero new protected mutations, while unrelated work continues.”
- **00:57–01:00** — Show public repository and the architecture line. Say: “Built today with MongoDB. Code and run steps are public.”

## Scope

This is a narrow proof of one Enid Mandate rule: durable context does not itself grant permission; a fresh agent must re-check current authority at the point of action. It does not claim production security, general agent autonomy, or integration with the private Enid codebase.

MIT licensed. See [LICENSE](LICENSE).

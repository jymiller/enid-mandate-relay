# Submission draft — Enid Mandate

Do not submit until every placeholder is replaced and the linked demo has completed a real `LIVE ATLAS` run.

## Project name

Enid Mandate

## One-line description

A fresh coding agent resumes another agent's MongoDB checkpoint, while a live authority update changes the identical next action from `ALLOW` to `HOLD` with zero additional actions written.

## Project description

Enid Mandate tests a missing control in long-running coding agents: durable memory should let a new process continue work, but it must never become durable permission.

Agent A stores a checkpoint and exact next action in MongoDB Atlas, then exits. A fresh Agent B starts with no local memory, reconstructs the handoff from MongoDB, and is allowed to perform that one synthetic action. We then revoke the governing authority in MongoDB. A second fresh Agent B resumes the same checkpoint and retries the identical action. This time the system returns `HOLD`, and the action count remains unchanged.

The live page renders API-returned process IDs, MongoDB document evidence, authority status, decisions, and action counts. It starts offline and does not hard-code a successful result. This event-time repository was built on August 13, 2026; no code was copied from the pre-existing private Enid repository.

## How MongoDB is used

- Atlas persists the checkpoint across separate agent processes.
- Atlas persists the current authority independently of the checkpoint.
- Every attempted action re-reads current authority before it may write an action.
- The database evidence makes `ALLOW → HOLD` and the unchanged action count reviewable.
- A database read failure fails closed.

## Partner technology

MongoDB Atlas — using a project and cluster created through the **SF .local Build Fest** Atlas Hackathon Sandbox invitation.

## Links

- Public GitHub repository: <https://github.com/jymiller/enid-mandate-relay>
- One-minute video: <https://github.com/jymiller/enid-mandate-relay/releases/download/demo-2026-08-13/enid-mandate-relay-demo.mp4>

## Final truth gates

- [ ] Atlas organization shown as `SF .local Build Fest`.
- [ ] Header shows `LIVE ATLAS`, not `LOCAL FAKE` or `OFFLINE`.
- [ ] Agent A and each Agent B show distinct returned process/run IDs.
- [ ] MongoDB checkpoint/document evidence is visible.
- [ ] First Agent B returns `ALLOW`.
- [ ] Authority revocation is visible in MongoDB evidence.
- [ ] Second Agent B returns `HOLD`.
- [ ] Action count is unchanged after `HOLD`.
- [ ] Public repository opens in a signed-out browser.
- [ ] Video is exactly one minute and shows only work built today.
- [ ] No secret, private corpus material, or private repository code is published.
- [ ] John gives final confirmation before form submission.

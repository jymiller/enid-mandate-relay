# Enid Mandate — publication checklist

This checklist is for the event-time repository only. It does not authorize accepting an organization invitation, creating an Atlas project or cluster, publishing a repository, uploading a video, or submitting the form. John must make those decisions explicitly.

## Truth gate

- [ ] Every file in this repository was created during the August 13, 2026 event window.
- [ ] No code, copy, CSS, fixture, receipt, screenshot, or document was copied from the prior Enid repository.
- [ ] The running demo uses the MongoDB Atlas project and cluster created through the **SF .local Build Fest** invitation, not a normal Project 0 cluster.
- [ ] Agent B starts as a fresh process with no chat transcript, local checkpoint, browser storage, or in-memory state from Agent A.
- [ ] The checkpoint Agent B resumes is read from MongoDB Atlas.
- [ ] The first protected attempt returns `ALLOW` and records a protected mutation.
- [ ] After the governing attestation changes, an otherwise identical fresh attempt returns `HOLD`, records zero protected mutations, and unrelated work still proceeds.
- [ ] The video shows live terminal/process evidence and an Atlas document/change—not a prerecorded dashboard replay.
- [ ] No Atlas URI, database password, personal email, account menu, machine-local path, or private repository name is visible in the video or repository.
- [ ] `npm test` passes.
- [ ] `npm run release:check` passes after the fresh repository has its event-day commit.
- [ ] The GitHub repository is public when checked from a signed-out browser.
- [ ] The video URL plays from a signed-out browser.
- [ ] John has reviewed the final five fields and explicitly confirmed form submission.

## Exact 60-second video

Keep one continuous story. Use only the event-time repository and live sandbox data. Hide bookmarks, account menus, environment values, and unrelated tabs.

| Time | Picture | Narration / overlay |
|---|---|---|
| 0–5 s | Title over the fresh app: **Enid Mandate — MongoDB-backed agent continuity with bounded authority** | “Agents can continue the work without inheriting unlimited authority.” |
| 5–15 s | Agent A runs. Show its terminal writing one structured checkpoint and learning; briefly show the new Atlas document with `agent: A`, checkpoint, and next step. | “Agent A stores a structured handoff in the Build Fest Atlas sandbox.” |
| 15–22 s | Stop Agent A’s process. Clear/close its terminal and open a new terminal/process labeled **Fresh Agent B**. Show that no state file or transcript is passed. | “Agent A is gone. Agent B starts fresh—no chat or local checkpoint.” |
| 22–35 s | Agent B receives only the task ID, reads MongoDB, displays the recovered checkpoint, and skips the already-completed step. | “Agent B reconstructs the work from MongoDB and avoids repeating it.” |
| 35–43 s | Click **Attempt protected action**. Show `ALLOW`, one receipt, and protected mutation count `1`. | “Current authority allows this exact protected action.” |
| 43–48 s | Change the governing attestation in the app; briefly show the stored authority epoch/status update in Atlas. | “Now the governing attestation changes.” |
| 48–57 s | Start an otherwise identical fresh attempt. Show deterministic `HOLD`, protected mutations still `1`, and an unrelated counter advance. | “The same action now holds with zero new protected mutations, while unrelated work continues.” |
| 57–60 s | Show the public repository root and a tiny architecture line: **Agent A → Atlas checkpoint → Agent B → authority gate → receipt**. | “Built today with MongoDB. Code and run steps are public.” |

Recording rule: if any live step fails, stop and record again. Do not splice in output from the earlier Enid demo.

## Submission fields — ready to paste after verification

**Team Name**

Enid Mandate

**Project Description**

Today’s Enid Mandate submission is a MongoDB-backed proof of agent continuity with bounded authority. Agent A writes a structured checkpoint and learning to the event’s Atlas sandbox. After that process is killed, a fresh Agent B reconstructs the task from MongoDB and avoids repeating completed work. A governing attestation then changes an identical protected action from ALLOW to HOLD; the receipt shows zero additional protected mutations while unrelated work continues.

**Public GitHub Repository**

`PASTE THE VERIFIED PUBLIC REPOSITORY URL`

**Demo Video URL**

`PASTE THE VERIFIED PUBLIC OR UNLISTED 60-SECOND VIDEO URL`

**Partner Technologies**

MongoDB

There is no hosted-app field in the visible submission form. Do not invent one. Do not select ElevenLabs unless voice functionality is actually present in the event-time code and shown in the video.

## Final publication sequence

1. Run the live sandbox proof twice from a clean state and save only redacted receipts.
2. Run `npm test`.
3. Review `git status`, the full diff, and every tracked filename.
4. Create the event-day commit in this repository only.
5. Run `npm run release:check`; it intentionally requires a clean event-day commit.
6. After John authorizes publication, create/push the fresh public repository.
7. Verify the repository from a signed-out browser.
8. Record the exact 60-second sequence above; upload only after John authorizes it.
9. Verify the video from a signed-out browser.
10. Paste the five fields above into the form.
11. Stop before the final submit action and obtain John’s explicit confirmation.

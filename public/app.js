const endpoints = Object.freeze({
  state: "/api/state",
  reset: "/api/reset",
  agentA: "/api/agent-a",
  agentB: "/api/agent-b",
  revoke: "/api/revoke",
});

const $ = (id) => document.getElementById(id);

const ui = {
  badge: $("connectionBadge"),
  connectionText: $("connectionText"),
  checkpoint: $("checkpointValue"),
  authority: $("authorityValue"),
  decision: $("decisionValue"),
  actionCount: $("actionCountValue"),
  agentAProcess: $("agentAProcessValue"),
  agentBProcess: $("agentBProcessValue"),
  documentDigest: $("documentDigestValue"),
  unrelatedCount: $("unrelatedCountValue"),
  rawProof: $("rawProof"),
  requestStatus: $("requestStatus"),
  announcer: $("announcer"),
  reset: $("resetButton"),
  agentA: $("agentAButton"),
  agentB: $("agentBButton"),
  revoke: $("revokeButton"),
  retry: $("retryButton"),
};

const stages = {
  agentA: {
    root: $("stepA"),
    state: $("stepAState"),
    result: $("stepAResult"),
  },
  agentB: {
    root: $("stepB"),
    state: $("stepBState"),
    result: $("stepBResult"),
  },
  revoke: {
    root: $("stepRevoke"),
    state: $("stepRevokeState"),
    result: $("stepRevokeResult"),
  },
  retry: {
    root: $("stepRetry"),
    state: $("stepRetryState"),
    result: $("stepRetryResult"),
  },
};

let currentState = null;
let retryBaseline = null;
let retryUnrelatedBaseline = null;
let busy = false;

function walk(value, predicate, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);

  for (const [key, child] of Object.entries(value)) {
    if (predicate(key, child)) return child;
  }

  for (const child of Object.values(value)) {
    const result = walk(child, predicate, seen);
    if (result !== undefined) return result;
  }

  return undefined;
}

function findByKeys(value, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  return walk(value, (key, child) => wanted.has(key.toLowerCase()) && child !== undefined);
}

function findScalarByKeys(value, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  return walk(
    value,
    (key, child) =>
      wanted.has(key.toLowerCase()) &&
      child !== null &&
      ["string", "number", "boolean"].includes(typeof child),
  );
}

function scalar(value) {
  if (value === null || value === undefined || value === "") return null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  return null;
}

function textValue(value, fallback = "—") {
  const found = scalar(value);
  if (found === null) return fallback;
  return String(found).toUpperCase();
}

function numericValue(value) {
  const found = scalar(value);
  if (found === null) return null;
  const parsed = Number(found);
  return Number.isFinite(parsed) ? parsed : null;
}

function redactForDisplay(value) {
  const sensitiveKey = /(?:password|passwd|secret|token|api.?key|private.?key|connection.?string|mongodb.?uri|database.?uri|email)/i;

  if (Array.isArray(value)) return value.map(redactForDisplay);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sensitiveKey.test(key) ? "[REDACTED]" : redactForDisplay(child),
      ]),
    );
  }
  if (typeof value === "string") {
    return value
      .replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/gi, "[REDACTED_MONGODB_URI]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
  }
  return value;
}

function derive(snapshot) {
  const modeValue = findScalarByKeys(snapshot, [
    "storageMode",
    "storage_mode",
    "backendMode",
    "backend_mode",
    "provider",
    "adapter",
    "persistence",
    "storage",
    "connectionMode",
    "mode",
  ]);
  const modeText = textValue(modeValue, "").toLowerCase();
  const isLive = findScalarByKeys(snapshot, [
    "liveAtlas",
    "live_atlas",
    "atlasConnected",
    "atlas_connected",
    "isAtlas",
    "is_atlas",
  ]);
  const isFake = findScalarByKeys(snapshot, ["localFake", "local_fake", "isFake", "is_fake"]);

  let connection = "offline";
  if (isLive === true || /live.?atlas|mongodb.?atlas|atlas.?live/.test(modeText)) connection = "atlas";
  else if (isFake === true || /fake|memory|local|mock|synthetic/.test(modeText)) connection = "fake";

  const checkpointObject = findByKeys(snapshot, ["checkpoint", "handoff", "checkpointDocument"]);
  const checkpoint = findScalarByKeys(snapshot, [
    "checkpointId",
    "checkpoint_id",
    "sequence",
    "checkpointSequence",
  ]) || findScalarByKeys(checkpointObject, ["id", "_id", "step", "nextStep", "next_step"]);
  const authorityObject = findByKeys(snapshot, ["authority", "mandate", "attestation"]);
  const authority = findScalarByKeys(snapshot, [
    "authorityStatus",
    "authority_status",
    "mandateStatus",
  ]) || findScalarByKeys(authorityObject, ["status", "state"]);
  const decision = findScalarByKeys(snapshot, ["decision", "outcome", "airlockDecision", "airlock_decision"]);
  const actionCount = numericValue(
    findScalarByKeys(snapshot, [
      "protectedMutationCount",
      "protected_mutation_count",
      "actionCount",
      "action_count",
      "actionsWritten",
      "actions_written",
      "mutationCount",
    ]),
  );
  const agentId = findScalarByKeys(snapshot, ["agentRunId", "agent_run_id", "agentId", "agent_id", "runId", "run_id"]);
  const runs = findByKeys(snapshot, ["runs"]);
  const agentARun = Array.isArray(runs)
    ? runs.find((run) => String(run?.agent || run?.role).toUpperCase() === "A")
    : null;
  const agentBRun = Array.isArray(runs)
    ? [...runs].reverse().find((run) => String(run?.agent || run?.role).toUpperCase() === "B")
    : null;
  const agentAPid = findScalarByKeys(snapshot, ["agentAPid", "agent_a_pid", "writerPid", "writer_pid"]);
  const agentBPid = findScalarByKeys(snapshot, [
    "agentBPid",
    "agent_b_pid",
    "readerPid",
    "reader_pid",
  ]);
  const exactAgentAProcess = findScalarByKeys(snapshot, ["agentAProcess", "agent_a_process"]);
  const exactAgentBProcess = findScalarByKeys(snapshot, ["agentBProcess", "agent_b_process"]);
  const latestPid = findScalarByKeys(snapshot, ["processId", "process_id", "pid"]);
  const documentDigest = findScalarByKeys(snapshot, [
    "documentDigest",
    "document_digest",
    "checkpointDigest",
    "checkpoint_digest",
    "digest",
    "documentId",
    "document_id",
    "mongoId",
    "mongo_id",
  ]);
  const unrelatedCount = numericValue(
    findScalarByKeys(snapshot, [
      "unrelatedWorkCount",
      "unrelated_work_count",
      "unrelatedCount",
      "unrelated_count",
      "safeWorkCount",
      "safe_work_count",
    ]),
  );
  const completedSteps = checkpointObject && Array.isArray(checkpointObject.completed_steps)
    ? checkpointObject.completed_steps.length
    : null;

  return {
    connection,
    checkpoint: scalar(checkpoint),
    authority: scalar(authority),
    decision: scalar(decision),
    actionCount,
    agentId: scalar(agentId),
    agentAPid: scalar(exactAgentAProcess ?? agentAPid ?? agentARun?.process_id),
    agentBPid: scalar(exactAgentBProcess ?? agentBPid ?? agentBRun?.process_id),
    agentARunId: scalar(agentARun?.run_id),
    agentBRunId: scalar(agentBRun?.run_id),
    agentAExited: agentARun?.exited === true,
    latestPid: scalar(latestPid),
    documentDigest: scalar(documentDigest),
    unrelatedCount,
    completedSteps,
  };
}

function processProof(pid, runId, exited = false) {
  if (pid === null && runId === null) return "—";
  const pieces = [];
  if (pid !== null) pieces.push(`PID ${pid}`);
  if (runId !== null) pieces.push(String(runId).slice(0, 12));
  if (exited) pieces.push("EXITED");
  return pieces.join(" · ").toUpperCase();
}

function setConnection(connection) {
  document.body.dataset.connection = connection;
  const label = connection === "atlas" ? "LIVE ATLAS" : connection === "fake" ? "LOCAL FAKE" : "OFFLINE";
  ui.connectionText.textContent = label;
}

function setStage(name, state, label, result) {
  const stage = stages[name];
  stage.root.dataset.state = state;
  stage.state.textContent = label;
  if (result !== undefined) stage.result.textContent = result;
}

function announce(message) {
  ui.announcer.textContent = "";
  requestAnimationFrame(() => {
    ui.announcer.textContent = message;
  });
}

function renderEvidence(snapshot, requestLabel) {
  currentState = snapshot;
  const view = derive(snapshot);
  setConnection(view.connection);
  ui.checkpoint.textContent = textValue(view.checkpoint);
  ui.authority.textContent = textValue(view.authority);
  ui.decision.textContent = textValue(view.decision);
  ui.actionCount.textContent = view.actionCount === null ? "—" : String(view.actionCount);
  if (view.agentAPid !== null || view.agentARunId !== null) {
    ui.agentAProcess.textContent = processProof(view.agentAPid, view.agentARunId, view.agentAExited);
  }
  if (view.agentBPid !== null || view.agentId !== null) {
    ui.agentBProcess.textContent = processProof(
      view.agentBPid,
      view.agentBRunId || view.agentId,
    );
  }
  if (view.documentDigest !== null) ui.documentDigest.textContent = textValue(view.documentDigest);
  if (view.unrelatedCount !== null) ui.unrelatedCount.textContent = String(view.unrelatedCount);
  ui.requestStatus.textContent = requestLabel;
  ui.rawProof.textContent = JSON.stringify(redactForDisplay(snapshot), null, 2);
  return view;
}

function setBusy(nextBusy) {
  busy = nextBusy;
  ui.reset.disabled = nextBusy;
  document.body.setAttribute("aria-busy", String(nextBusy));
}

async function request(endpoint, { method = "GET" } = {}) {
  const response = await fetch(endpoint, {
    method,
    headers: { Accept: "application/json" },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : { error: "NON_JSON_RESPONSE", status: response.status };

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function refresh(requestLabel = "GET /api/state") {
  const snapshot = await request(endpoints.state);
  return renderEvidence(snapshot, requestLabel);
}

function showFailure(stageName, endpoint, error) {
  setConnection("offline");
  setStage(stageName, "error", "ERROR", "No verified result");
  ui.requestStatus.textContent = `${endpoint} · FAILED`;
  ui.rawProof.textContent = JSON.stringify(
    redactForDisplay(error.payload || { error: error.message || "REQUEST_FAILED" }),
    null,
    2,
  );
  announce(`${stageName} failed. No result is verified.`);
}

async function runStage(stageName, endpoint, onVerified) {
  if (busy) return;
  setBusy(true);
  setStage(stageName, "active", "RUNNING", "Waiting for server evidence…");
  ui.requestStatus.textContent = `POST ${endpoint}`;

  try {
    const response = await request(endpoint, { method: "POST" });
    const state = await request(endpoints.state);
    const stateView = renderEvidence(
      { operation: response, state },
      `POST ${endpoint} → GET /api/state`,
    );
    onVerified(response, stateView);
  } catch (error) {
    showFailure(stageName, endpoint, error);
  } finally {
    setBusy(false);
  }
}

async function resetRun() {
  if (busy) return;
  setBusy(true);
  ui.requestStatus.textContent = `POST ${endpoints.reset}`;

  try {
    const response = await request(endpoints.reset, { method: "POST" });
    const state = await request(endpoints.state);
    renderEvidence({ operation: response, state }, `POST ${endpoints.reset} → GET /api/state`);
    retryBaseline = null;
    retryUnrelatedBaseline = null;
    ui.agentAProcess.textContent = "—";
    ui.agentBProcess.textContent = "—";
    ui.documentDigest.textContent = "—";
    ui.unrelatedCount.textContent = "—";
    setStage("agentA", "ready", "READY", "Waiting for MongoDB · process must exit");
    setStage("agentB", "waiting", "WAITING", "No chat · no local checkpoint");
    setStage("revoke", "waiting", "WAITING", "Authority is unchanged");
    setStage("retry", "waiting", "WAITING", "Waiting for revocation");
    stages.agentB.root.removeAttribute("data-decision");
    stages.retry.root.removeAttribute("data-decision");
    ui.agentA.disabled = false;
    ui.agentB.disabled = true;
    ui.revoke.disabled = true;
    ui.retry.disabled = true;
    announce("Run reset. Agent A is ready.");
  } catch (error) {
    setConnection("offline");
    ui.requestStatus.textContent = `${endpoints.reset} · FAILED`;
    ui.rawProof.textContent = JSON.stringify(
      redactForDisplay(error.payload || { error: error.message }),
      null,
      2,
    );
    announce("Reset failed. The demo is offline.");
  } finally {
    setBusy(false);
  }
}

ui.agentA.addEventListener("click", () => {
  runStage("agentA", endpoints.agentA, (response, view) => {
    const hasCheckpoint = view.checkpoint !== null;
    const operation = derive(response);
    const agentAPid = operation.agentAPid || operation.latestPid;
    if (agentAPid !== null) {
      ui.agentAProcess.textContent = processProof(agentAPid, operation.agentARunId, view.agentAExited);
    }
    const verified = hasCheckpoint && view.agentAExited;
    setStage(
      "agentA",
      verified ? "complete" : "error",
      verified ? "STORED + EXITED" : "UNVERIFIED",
      verified
        ? `Checkpoint ${textValue(view.checkpoint)} persisted · A PID ${agentAPid}`
        : "Checkpoint plus exited Agent A not verified",
    );
    ui.agentB.disabled = !verified;
    ui.agentA.disabled = verified;
    announce(verified ? "Checkpoint stored and Agent A exited. Fresh Agent B is ready." : "Checkpoint and exit were not verified.");
  });
});

ui.agentB.addEventListener("click", () => {
  runStage("agentB", endpoints.agentB, (response, view) => {
    const decision = textValue(view.decision, "");
    const isAllow = decision === "ALLOW";
    const operation = derive(response);
    const agentBPid = operation.agentBPid || operation.latestPid || view.agentBPid || view.agentId;
    if (agentBPid !== null) {
      ui.agentBProcess.textContent = processProof(agentBPid, operation.agentBRunId || view.agentBRunId || view.agentId);
    }
    stages.agentB.root.dataset.decision = decision.toLowerCase();
    stages.agentB.root.querySelector(".decision-glyph").textContent = decision || "?";
    const freshRunId = view.agentBRunId || view.agentId;
    const identity = freshRunId ? ` · ${String(freshRunId)}` : "";
    setStage(
      "agentB",
      isAllow ? "complete" : "error",
      decision || "UNVERIFIED",
      decision
        ? `Recovered checkpoint · skipped ${view.completedSteps ?? "stored"} completed steps · fresh run${identity} · ${decision}`
        : "No decision returned",
    );
    ui.revoke.disabled = !isAllow;
    ui.agentB.disabled = isAllow;
    announce(isAllow ? "Fresh Agent B resumed and received ALLOW." : "ALLOW was not verified.");
  });
});

ui.revoke.addEventListener("click", () => {
  runStage("revoke", endpoints.revoke, (_response, view) => {
    const authority = textValue(view.authority, "");
    const revoked = /REVOK|STALE|INACTIVE|EXPIRED|VOID/.test(authority);
    setStage(
      "revoke",
      revoked ? "complete" : "error",
      revoked ? "REVOKED" : "UNVERIFIED",
      authority ? `MongoDB authority: ${authority}` : "No authority status returned",
    );
    retryBaseline = view.actionCount;
    retryUnrelatedBaseline = view.unrelatedCount;
    ui.retry.disabled = !revoked;
    ui.revoke.disabled = revoked;
    announce(revoked ? "Authority revoked. A new Agent B can retry." : "Revocation was not verified.");
  });
});

ui.retry.addEventListener("click", () => {
  runStage("retry", endpoints.agentB, (response, view) => {
    const decision = textValue(view.decision, "");
    const isHold = decision === "HOLD";
    const operation = derive(response);
    const agentBPid = operation.agentBPid || operation.latestPid || view.agentBPid || view.agentId;
    if (agentBPid !== null) {
      ui.agentBProcess.textContent = processProof(agentBPid, operation.agentBRunId || view.agentBRunId || view.agentId);
    }
    const hasCounts = retryBaseline !== null && view.actionCount !== null;
    const delta = hasCounts ? view.actionCount - retryBaseline : null;
    const zeroNewActions = delta === 0;
    const unrelatedDelta = retryUnrelatedBaseline !== null && view.unrelatedCount !== null
      ? view.unrelatedCount - retryUnrelatedBaseline
      : null;
    const unrelatedAdvanced = unrelatedDelta !== null && unrelatedDelta > 0;
    const verified = isHold && zeroNewActions && unrelatedAdvanced;
    stages.retry.root.dataset.decision = decision.toLowerCase();
    stages.retry.root.querySelector(".decision-glyph").textContent = decision || "?";
    stages.retry.root.querySelector(".action-glyph").textContent = delta === null ? "+?" : `${delta >= 0 ? "+" : ""}${delta}`;
    setStage(
      "retry",
      verified ? "complete" : "error",
      verified ? "PROVED" : "UNVERIFIED",
      `${decision || "NO DECISION"} · ${delta === null ? "NO COUNT" : `${delta >= 0 ? "+" : ""}${delta} PROTECTED`} · ${unrelatedDelta === null ? "NO UNRELATED COUNT" : `${unrelatedDelta >= 0 ? "+" : ""}${unrelatedDelta} UNRELATED`}`,
    );
    ui.retry.disabled = verified;
    announce(
      verified
        ? "Proof complete. Revoked authority produced HOLD and zero new actions."
        : "HOLD with zero new actions was not verified.",
    );
  });
});

ui.reset.addEventListener("click", resetRun);

async function boot() {
  try {
    const view = await refresh();
    const hasCheckpoint = view.checkpoint !== null;
    const authority = textValue(view.authority, "");
    const revoked = /REVOK|STALE|INACTIVE|EXPIRED|VOID/.test(authority);
    ui.agentB.disabled = !hasCheckpoint;
    ui.retry.disabled = !revoked;
    ui.revoke.disabled = !hasCheckpoint || revoked;
    ui.rawProof.removeAttribute("aria-busy");
  } catch (error) {
    setConnection("offline");
    ui.rawProof.textContent = JSON.stringify(
      { error: "API_UNAVAILABLE", detail: error.message },
      null,
      2,
    );
    ui.requestStatus.textContent = "GET /api/state · FAILED";
    ui.agentA.disabled = true;
    ui.agentB.disabled = true;
    ui.revoke.disabled = true;
    ui.retry.disabled = true;
    announce("Backend offline. No proof is available.");
  }
}

boot();

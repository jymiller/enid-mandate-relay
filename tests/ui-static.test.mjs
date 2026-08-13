import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("page exposes the four-step proof and starts without a claimed result", async () => {
  const html = await read("public/index.html");

  assert.match(html, /data-connection="offline"/);
  assert.match(html, /id="connectionText">OFFLINE</);
  assert.match(html, /id="checkpointValue">—</);
  assert.match(html, /id="authorityValue">—</);
  assert.match(html, /id="decisionValue">—</);
  assert.match(html, /id="agentAButton"/);
  assert.match(html, /id="agentBButton"/);
  assert.match(html, /id="revokeButton"/);
  assert.match(html, /id="retryButton"/);
  assert.match(html, /id="rawProof"/);
});

test("client uses every API and derives rather than presets business outcomes", async () => {
  const source = await read("public/app.js");

  for (const endpoint of ["/api/state", "/api/reset", "/api/agent-a", "/api/agent-b", "/api/revoke"]) {
    assert.ok(source.includes(endpoint), `missing ${endpoint}`);
  }

  assert.match(source, /await fetch\(endpoint/);
  assert.match(source, /const isAllow = decision === "ALLOW"/);
  assert.match(source, /const isHold = decision === "HOLD"/);
  assert.match(source, /const zeroNewActions = delta === 0/);
  assert.match(source, /connection === "atlas" \? "LIVE ATLAS"/);
  assert.match(source, /connection === "fake" \? "LOCAL FAKE"/);
  assert.match(source, /: "OFFLINE"/);
  assert.match(source, /redactForDisplay/);
  assert.match(source, /REDACTED_MONGODB_URI/);
});

test("page includes keyboard, live-region, mobile, and reduced-motion support", async () => {
  const [html, css] = await Promise.all([read("public/index.html"), read("public/styles.css")]);

  assert.match(html, /class="skip-link"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-live="assertive"/);
  assert.match(html, /<button[^>]+type="button"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("README identifies event-time scope and a contiguous 60-second script", async () => {
  const readme = await read("README.md");

  assert.match(readme, /Built on \*\*August 13, 2026\*\*/);
  assert.match(readme, /No code was copied from the private Enid repository/);
  assert.match(readme, /PUBLIC_REPO_URL_TODO/);
  assert.match(readme, /VIDEO_URL_TODO/);

  const stamps = [...readme.matchAll(/\*\*(\d{2}):(\d{2})–(\d{2}):(\d{2})\*\*/g)].map((match) => ({
    start: Number(match[1]) * 60 + Number(match[2]),
    end: Number(match[3]) * 60 + Number(match[4]),
  }));
  assert.equal(stamps.length, 8);
  assert.equal(stamps[0].start, 0);
  assert.equal(stamps.at(-1).end, 60);
  for (let index = 1; index < stamps.length; index += 1) {
    assert.equal(stamps[index - 1].end, stamps[index].start);
  }
});

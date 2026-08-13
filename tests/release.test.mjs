import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditWorkspace,
  isReservedPrivatePath,
  pathFingerprint,
  scanTextForRisks,
} from "../scripts/release-check.mjs";

test("secret scanner catches credentials and machine-local paths", () => {
  const uri = ["mongodb+srv:", "", "user:pass@host/db"].join("/");
  assert.deepEqual(scanTextForRisks(`MONGODB_URI=${uri}`), [
    "MongoDB connection string",
    "filled secret environment variable",
  ]);
  const localPath = ["", "Users", "example", "private", "data.json"].join("/");
  assert.deepEqual(scanTextForRisks(`file: ${localPath}`), [
    "private absolute user path",
  ]);
});

test("private-path fingerprint guard is stable and permits fresh public paths", () => {
  assert.equal(
    pathFingerprint("public/index.html"),
    "c2cc24bc9001b11b6add48a4cd8f893d5d6c6e4d1bd254158bd14ab997f552cd",
  );
  assert.equal(isReservedPrivatePath("src/relay-server.mjs"), false);
  assert.equal(isReservedPrivatePath("public/index.html"), false);
});

test("workspace audit fails closed on a public file containing a secret", () => {
  const root = mkdtempSync(path.join(tmpdir(), "enid-release-check-"));
  mkdirSync(path.join(root, "public"), { recursive: true });

  writeFileSync(path.join(root, "README.md"), "MongoDB Atlas MONGODB_URI npm\n");
  writeFileSync(path.join(root, "LICENSE"), "MIT ".repeat(40));
  writeFileSync(path.join(root, ".gitignore"), "node_modules\n.env\n");
  writeFileSync(path.join(root, ".env.example"), "MONGODB_URI=\n");
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      private: true,
      scripts: { start: "node x", test: "node --test", "release:check": "node y" },
      dependencies: { mongodb: "latest" },
    }),
  );
  writeFileSync(path.join(root, "package-lock.json"), "{}\n");
  writeFileSync(
    path.join(root, "public/index.html"),
    "<title>Demo</title><main><button>Run</button></main>",
  );
  const uri = ["mongodb:", "", "user:pass@host/db"].join("/");
  writeFileSync(path.join(root, "leak.txt"), `MONGODB_URI=${uri}\n`);

  const { failures } = auditWorkspace(root, { checkHistory: false });
  assert.equal(
    failures.some((failure) => failure.includes("leak.txt: contains MongoDB connection string")),
    true,
  );
});

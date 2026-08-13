#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EVENT_BUILD_DATE = process.env.EVENT_BUILD_DATE || "2026-08-13";
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "coverage",
  "dist",
  "node_modules",
]);

// Fingerprints keep private source names out of the public guard itself.
const RESERVED_PRIVATE_PATH_FINGERPRINTS = new Set([
  "b951327c37d8a1ed4d5ed18908681f6aca718ecdfe174aa39cf2237547f92fe7",
  "fd3edf48a550fc1e06e551c9de0928dc1df51b9aef61139df0bed27ed2d9b468",
  "013c61324be8fda276a6b1616cea08c1bd56a8e03c5b37d767ad4eb7d4dc3d46",
  "76d785fa2314ae64c1a9826bc1c1b45103ac027091e639d7180fd7426d22dbe4",
  "e967a274dd12450b1341ed45e9b4fa1b1f348da3e08fbe5826b7da66949eed2d",
  "2215b5bf8ea9ff68996a3806aa4b9b924f82593b79c7bca0d4e3026e6ceac16c",
  "d472b4ef94cd29d6d591eafda8ade1b7832f0371f8bd869b25db7b1dd74e8288",
  "78a063aa14e83814e426a12746d4a64120e308b2025b4af0c715dbe7c9e65144",
  "70593a4e8e8d5d1698b930f704f5202da89467f8f85bce212e64a0a387cbda02",
  "0ae1c8e493a329e27b928b3927cae15372a124dbfbb555558d72e1e1aec264b6",
  "3cd12da9d66aa283eebe28e29c5229c6d240df075c6d9555cbe255edd44eae91",
  "5dba8909592359ceb4c9ec1783bd89d810b3f685541e1445ec480ec767924a2c",
  "15e040065ce6df7bc191f7415d7d3fddbda9bc53bda8df29143367135fe0b8bc",
]);

const RESERVED_PRIVATE_PREFIX_FINGERPRINTS = new Set([
  "3205757c5e149b0a4d15ab357a93e7d48792c4ddc3cb92b236fa37b4acff02ae",
  "756dcfcddff993c7fd6cf14a402d97e7cbd9faafa6339aa722d19eeceb6d1391",
  "c215fc1b221a712b91418494f82a116a85ceb7664be6417534d7610e84f17a82",
  "7cb20cea4f19d1011aca2419cd26f113b6f038c88055e1fc0f930e62a1a6e451",
  "b1b9dfaa1cedc133f5acde4f39780bba6140b3f68261dace5f0127afdd6516ea",
  "90feea24e7b0de54bd1621bb68be868da09113cf6611439d86fe92da913826c2",
  "1c404e6f35993eb33c8ae6fcaebc654aaa76b8f87b83c62f28a04a5e60432b42",
  "358eae39bb7220437ea8ad3b91090345dad5fe5d6d03dad4f0ec917d88e48a00",
  "15ad253c9f26b104ccd36e288aa88dd88151e14aa121cfee5379668a0316b1a3",
  "59da610de3339735c9ab64e2c61673bcd4ee9850279f47703f8bb274ddf3bf94",
  "3fe4c8631e9157b282937b984062d7768f088045c52a5a01ba807cc62f05d7cd",
  "30fa67f739aa036acafe3193d5f9639ed5e303eb42898db68875285d5c9ee81d",
  "1b7ed2c3a19458ea52a8a9939aab62527f108b4b4c4ae28511e993038a1ba6a3",
]);

const SENSITIVE_TOKEN_FINGERPRINTS = new Set([
  "fa2f2471cd1789fc09a450dc7ab1b66cbee243dc5e0d9f315061df8ff5a29874",
  "de600371e25668a9cd7520e7da219f6d737263519e948939c9e95552ff6c7849",
  "2d294c195c182f8d71a6f66fd20de3879f9e1fc0c7fab61f9f877103591c49c4",
]);

const PRIVATE_REMOTE_FINGERPRINT =
  "de600371e25668a9cd7520e7da219f6d737263519e948939c9e95552ff6c7849";

const FORBIDDEN_FILENAMES = [
  /^\.DS_Store$/,
  /^\.env(?:\..+)?$/,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
  /\.(?:key|p12|pfx|pem)$/i,
];

const ALLOWED_ENV_FILE = ".env.example";
const MAX_PUBLIC_FILE_BYTES = 5 * 1024 * 1024;

function normalizeRelative(relativePath) {
  return relativePath.split(path.sep).join("/").replace(/^\.\//, "");
}

export function pathFingerprint(relativePath) {
  return sha256(Buffer.from(normalizeRelative(relativePath).toLowerCase()));
}

export function isReservedPrivatePath(relativePath) {
  const normalized = normalizeRelative(relativePath).toLowerCase();
  if (RESERVED_PRIVATE_PATH_FINGERPRINTS.has(pathFingerprint(normalized))) return true;

  const parts = normalized.split("/");
  for (let index = 1; index < parts.length; index += 1) {
    const prefix = `${parts.slice(0, index).join("/")}/`;
    if (RESERVED_PRIVATE_PREFIX_FINGERPRINTS.has(pathFingerprint(prefix))) return true;
  }

  return false;
}

export function scanTextForRisks(text) {
  const risks = [];

  const checks = [
    ["MongoDB connection string", /mongodb(?:\+srv)?:\/\/[^\s'"<>]+/i],
    ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["GitHub token", /(?:github_pat_|gh[opusr]_)[A-Za-z0-9_]{20,}/],
    ["OpenAI-style API key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ["AWS access key", /\bAKIA[A-Z0-9]{16}\b/],
    ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}\b/],
    ["Slack token", /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/],
    ["private absolute user path", /\/(?:Users|home)\/[A-Za-z0-9._-]+\//],
    ["temporary macOS path", /\/(?:private\/)?var\/folders\//],
    ["filled secret environment variable", /^(?:MONGODB_URI|MONGODB_PASSWORD|API_KEY|SECRET|TOKEN)=[^\s#][^\r\n]*$/im],
  ];

  for (const [label, pattern] of checks) {
    if (pattern.test(text)) risks.push(label);
  }

  const candidates = text.match(/[A-Za-z0-9_.+@/-]+/g) || [];
  if (
    candidates.some((candidate) =>
      SENSITIVE_TOKEN_FINGERPRINTS.has(sha256(Buffer.from(candidate.toLowerCase()))),
    )
  ) {
    risks.push("private event identifier");
  }

  return risks;
}

function walkFiles(root, current = root, results = []) {
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;

    const absolutePath = path.join(current, entry.name);
    const relativePath = normalizeRelative(path.relative(root, absolutePath));

    if (entry.isSymbolicLink()) {
      results.push({ absolutePath, relativePath, symbolicLink: true });
      continue;
    }

    if (entry.isDirectory()) {
      walkFiles(root, absolutePath, results);
    } else if (entry.isFile()) {
      results.push({ absolutePath, relativePath, symbolicLink: false });
    }
  }

  return results;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readJson(filePath, failures) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    failures.push(`${path.basename(filePath)} is not valid JSON: ${error.message}`);
    return null;
  }
}

function checkRequiredFiles(root, failures) {
  const required = [
    "README.md",
    "LICENSE",
    "package.json",
    "package-lock.json",
    ".gitignore",
    ".env.example",
    "public/index.html",
  ];

  for (const relativePath of required) {
    if (!existsSync(path.join(root, relativePath))) {
      failures.push(`missing required public file: ${relativePath}`);
    }
  }

  const readmePath = path.join(root, "README.md");
  if (existsSync(readmePath)) {
    const readme = readFileSync(readmePath, "utf8");
    for (const phrase of ["MongoDB Atlas", "MONGODB_URI", "npm"]) {
      if (!readme.includes(phrase)) failures.push(`README.md must explain ${phrase}`);
    }
  }

  const licensePath = path.join(root, "LICENSE");
  if (existsSync(licensePath) && readFileSync(licensePath).length < 100) {
    failures.push("LICENSE is unexpectedly short");
  }

  const gitignorePath = path.join(root, ".gitignore");
  if (existsSync(gitignorePath)) {
    const gitignore = readFileSync(gitignorePath, "utf8");
    if (!/(^|\n)node_modules\/?($|\n)/.test(gitignore)) {
      failures.push(".gitignore must exclude node_modules");
    }
    if (!/(^|\n)\.env(?:\.\*)?($|\n)/.test(gitignore)) {
      failures.push(".gitignore must exclude local .env files");
    }
  }

  const envExamplePath = path.join(root, ALLOWED_ENV_FILE);
  if (existsSync(envExamplePath)) {
    const envExample = readFileSync(envExamplePath, "utf8");
    if (!/^MONGODB_URI=\s*$/m.test(envExample)) {
      failures.push(".env.example must contain an empty MONGODB_URI=");
    }
  }

  const publicUiPath = path.join(root, "public/index.html");
  if (existsSync(publicUiPath)) {
    const html = readFileSync(publicUiPath, "utf8");
    for (const tag of ["<title", "<main", "<button"]) {
      if (!html.toLowerCase().includes(tag)) {
        failures.push(`public/index.html must include ${tag}>`);
      }
    }
  }

  const packagePath = path.join(root, "package.json");
  if (existsSync(packagePath)) {
    const pkg = readJson(packagePath, failures);
    if (pkg) {
      if (pkg.private !== true) {
        failures.push("package.json must set private: true to prevent accidental npm publication");
      }
      for (const scriptName of ["start", "test", "release:check"]) {
        if (!pkg.scripts?.[scriptName]) {
          failures.push(`package.json is missing scripts.${scriptName}`);
        }
      }
      if (!pkg.dependencies?.mongodb) {
        failures.push("package.json must use the official mongodb driver");
      }
    }
  }
}

function checkFileSafety(root, failures) {
  const files = walkFiles(root);

  for (const file of files) {
    if (file.symbolicLink) {
      failures.push(`symbolic links are not permitted: ${file.relativePath}`);
      continue;
    }

    if (isReservedPrivatePath(file.relativePath)) {
      failures.push(`path overlaps the private Enid source corpus: ${file.relativePath}`);
    }

    const base = path.basename(file.relativePath);
    if (
      file.relativePath !== ALLOWED_ENV_FILE &&
      FORBIDDEN_FILENAMES.some((pattern) => pattern.test(base))
    ) {
      failures.push(`secret or machine-local filename is not publishable: ${file.relativePath}`);
    }

    const stat = lstatSync(file.absolutePath);
    if (stat.size > MAX_PUBLIC_FILE_BYTES) {
      failures.push(`file exceeds 5 MiB public-source limit: ${file.relativePath}`);
      continue;
    }

    const content = readFileSync(file.absolutePath);
    if (content.includes(0)) {
      failures.push(`unexpected binary file in source release: ${file.relativePath}`);
      continue;
    }

    for (const risk of scanTextForRisks(content.toString("utf8"))) {
      failures.push(`${file.relativePath}: contains ${risk}`);
    }
  }

  return files;
}

function findPrivateSource(root) {
  const configured = process.env.ENID_PRIVATE_REPO;
  if (configured) return existsSync(path.join(configured, ".git")) ? configured : null;

  const sourceRoot = path.resolve(root, "../../..");
  if (!existsSync(sourceRoot)) return null;

  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(sourceRoot, entry.name);
    if (!existsSync(path.join(candidate, ".git"))) continue;
    try {
      const remote = execFileSync(
        "git",
        ["-C", candidate, "remote", "get-url", "origin"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      if (remoteFingerprint(remote) === PRIVATE_REMOTE_FINGERPRINT) return candidate;
    } catch {
      // A sibling without an origin is not the source corpus we are looking for.
    }
  }

  return null;
}

function remoteFingerprint(remote) {
  const normalized = remote
    .trim()
    .replace(/^git@[^:]+:/, "")
    .replace(/^https?:\/\/[^/]+\//, "")
    .replace(/^ssh:\/\/git@[^/]+\//, "")
    .replace(/^\//, "")
    .replace(/\.git$/, "")
    .toLowerCase();
  return sha256(Buffer.from(normalized));
}

function trackedFiles(repository) {
  const output = execFileSync(
    "git",
    ["-C", repository, "ls-files", "-z"],
    { encoding: "utf8" },
  );
  return output.split("\0").filter(Boolean);
}

function checkNoCopiedContent(root, publicFiles, failures, notes) {
  const privateSource = findPrivateSource(root);
  if (!privateSource) {
    notes.push("private-source content comparison skipped; static path guard still ran");
    return;
  }

  const privateHashes = new Map();
  for (const relativePath of trackedFiles(privateSource)) {
    const absolutePath = path.join(privateSource, relativePath);
    if (!existsSync(absolutePath) || lstatSync(absolutePath).isSymbolicLink()) continue;
    const digest = sha256(readFileSync(absolutePath));
    privateHashes.set(digest, (privateHashes.get(digest) || 0) + 1);
  }

  for (const file of publicFiles) {
    if (file.symbolicLink) continue;
    const digest = sha256(readFileSync(file.absolutePath));
    const matchCount = privateHashes.get(digest);
    if (matchCount) {
      failures.push(
        `${file.relativePath}: exact content copy of ${matchCount} private source file(s)`,
      );
    }
  }

  notes.push("compared public file hashes with the tracked private Enid source corpus");
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function checkGitHistory(root, failures) {
  const ownGitPath = path.join(root, ".git");
  if (!existsSync(ownGitPath)) {
    failures.push("workspace is not initialized as its own fresh Git repository");
    return;
  }

  try {
    const actualRoot = realpathSync(git(root, ["rev-parse", "--show-toplevel"]));
    if (actualRoot !== realpathSync(root)) {
      failures.push(`Git root is not the release workspace: ${actualRoot}`);
      return;
    }

    const commitCount = Number(git(root, ["rev-list", "--count", "--all"]));
    if (!Number.isInteger(commitCount) || commitCount < 1) {
      failures.push("fresh release repository has no commit");
      return;
    }

    const history = git(root, [
      "log",
      "--all",
      "--format=%H%x09%aI%x09%cI",
    ]).split("\n").filter(Boolean);

    for (const row of history) {
      const [commit, authorDate, committerDate] = row.split("\t");
      if (!authorDate?.startsWith(EVENT_BUILD_DATE)) {
        failures.push(`${commit}: author date is not event day ${EVENT_BUILD_DATE}`);
      }
      if (!committerDate?.startsWith(EVENT_BUILD_DATE)) {
        failures.push(`${commit}: commit date is not event day ${EVENT_BUILD_DATE}`);
      }
    }

    const remoteNames = git(root, ["remote"]).split("\n").filter(Boolean);
    for (const remoteName of remoteNames) {
      const remoteUrls = git(root, ["remote", "get-url", "--all", remoteName])
        .split("\n")
        .filter(Boolean);
      if (remoteUrls.some((remote) => remoteFingerprint(remote) === PRIVATE_REMOTE_FINGERPRINT)) {
        failures.push("release repository points at a reserved private source remote");
      }
    }

    if (git(root, ["status", "--porcelain"])) {
      failures.push("release repository has uncommitted changes");
    }
  } catch (error) {
    failures.push(`unable to verify fresh Git history: ${error.message}`);
  }
}

export function auditWorkspace(root, { checkHistory = true } = {}) {
  const absoluteRoot = realpathSync(root);
  const failures = [];
  const notes = [];

  checkRequiredFiles(absoluteRoot, failures);
  const publicFiles = checkFileSafety(absoluteRoot, failures);
  checkNoCopiedContent(absoluteRoot, publicFiles, failures, notes);
  if (checkHistory) checkGitHistory(absoluteRoot, failures);

  return { failures, notes, scannedFiles: publicFiles.length };
}

function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const root = path.resolve(path.dirname(scriptPath), "..");
  const result = auditWorkspace(root);

  for (const note of result.notes) console.log(`NOTE: ${note}`);

  if (result.failures.length) {
    console.error(`RELEASE CHECK FAILED (${result.failures.length})`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `RELEASE CHECK PASSED: ${result.scannedFiles} files, all commits dated ${EVENT_BUILD_DATE}`,
  );
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}

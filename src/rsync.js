import { spawn } from "node:child_process";
import path from "node:path";

const CLEAN_EXCLUDES = [
  "node_modules/",
  ".cache/",
  ".parcel-cache/",
  ".turbo/",
  "coverage/",
  ".nyc_output/",
  ".sass-cache/",
  ".eslintcache"
];

export async function ensureRsyncAvailable() {
  await runProcess("rsync", ["--version"]);
}

export function buildRsyncArgs(sourceDirectory, destinationDirectory, { clean = false } = {}) {
  const args = ["-a", "--delete", "--exclude=.git", "--exclude=.DS_Store"];

  if (clean) {
    for (const pattern of CLEAN_EXCLUDES) {
      args.push(`--exclude=${pattern}`);
    }
  }

  args.push(withTrailingSlash(sourceDirectory), withTrailingSlash(destinationDirectory));
  return args;
}

export async function runRsync(sourceDirectory, destinationDirectory, { clean = false } = {}) {
  const args = buildRsyncArgs(sourceDirectory, destinationDirectory, { clean });
  await runProcess("rsync", args);
}

async function runProcess(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      reject(new Error(output || `${command} exited with code ${code}.`));
    });
  });
}

function withTrailingSlash(targetPath) {
  return `${targetPath}${path.sep}`;
}

import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdtemp, mkdir, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cliPath = path.join(repoRoot, "bin", "handoffdev.js");

test("shows help output", async () => {
  const result = await runCli(["--help"]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /Usage:/);
});

test("shows help output for unknown flags", async () => {
  const result = await runCli(["--wat"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown option: --wat/);
  assert.match(result.stdout, /Usage:/);
});

test("mirrors into a new destination", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationDirectory = path.join(await mkdtemp(path.join(os.tmpdir(), "handoffdev-dest-")), "mirror target");
  const historyPath = path.join(await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-")), "history.json");

  const result = await runCli([destinationDirectory], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: historyPath }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(destinationDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
  await assert.rejects(lstat(path.join(destinationDirectory, ".git")));
});

test("mirrors from a worktree-style source without copying the .git file", async () => {
  const sourceDirectory = await createSourceFixture({ gitMode: "file" });
  const destinationDirectory = path.join(await mkdtemp(path.join(os.tmpdir(), "handoffdev-dest-")), "mirror target");
  const historyPath = path.join(await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-")), "history.json");

  const result = await runCli([destinationDirectory], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: historyPath }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(destinationDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
  await assert.rejects(lstat(path.join(destinationDirectory, ".git")));
});

test("mirrors into an empty existing destination without prompting", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-empty-"));
  const destinationDirectory = path.join(destinationRoot, "empty dest");
  await mkdir(destinationDirectory);

  const result = await runCli([destinationDirectory], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: path.join(destinationRoot, "history.json") }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(destinationDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
});

test("mirrors into an existing symlinked destination directory", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-symlink-"));
  const targetDirectory = path.join(destinationRoot, "actual target");
  const destinationLink = path.join(destinationRoot, "mirror link");
  await mkdir(targetDirectory);
  await symlink(targetDirectory, destinationLink);

  const result = await runCli([destinationLink], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: path.join(destinationRoot, "history.json") }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(targetDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
  await assert.rejects(lstat(path.join(targetDirectory, ".git")));
});

test("asks before deleting a non-empty destination and accepts yes", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-nonempty-"));
  const destinationDirectory = path.join(destinationRoot, "mirror dest");
  await mkdir(destinationDirectory);
  await writeFile(path.join(destinationDirectory, "old.txt"), "old\n", "utf8");

  const result = await runCli([destinationDirectory], {
    cwd: sourceDirectory,
    env: {
      HANDOFFDEV_HISTORY_PATH: path.join(destinationRoot, "history.json"),
      HANDOFFDEV_TEST_PROMPTS: JSON.stringify({ select: [true] })
    }
  });

  assert.equal(result.code, 0);
  await assert.rejects(readFile(path.join(destinationDirectory, "old.txt"), "utf8"));
  assert.equal(await readFile(path.join(destinationDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
});

test("asks before deleting a non-empty destination and cancels on no", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-cancel-"));
  const destinationDirectory = path.join(destinationRoot, "mirror dest");
  await mkdir(destinationDirectory);
  await writeFile(path.join(destinationDirectory, "old.txt"), "old\n", "utf8");

  const result = await runCli([destinationDirectory], {
    cwd: sourceDirectory,
    env: {
      HANDOFFDEV_HISTORY_PATH: path.join(destinationRoot, "history.json"),
      HANDOFFDEV_TEST_PROMPTS: JSON.stringify({ select: [false] })
    }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(destinationDirectory, "old.txt"), "utf8"), "old\n");
  await assert.rejects(readFile(path.join(destinationDirectory, "manifest.json"), "utf8"));
});

test("uses interactive mode with project history and a custom destination", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-interactive-"));
  const historyPath = path.join(destinationRoot, "history.json");
  const customDestination = path.join(destinationRoot, "custom target");

  const result = await runCli([], {
    cwd: sourceDirectory,
    env: {
      HANDOFFDEV_HISTORY_PATH: historyPath,
      HANDOFFDEV_TEST_PROMPTS: JSON.stringify({ text: [customDestination] })
    }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(customDestination, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
});

test("supports destinations with spaces and $HOME-style expansion", async () => {
  const sourceDirectory = await createSourceFixture();
  const fakeHome = await mkdtemp(path.join(os.tmpdir(), "handoffdev-home-"));
  await mkdir(path.join(fakeHome, "Documents", "GitHub"), { recursive: true });

  const result = await runCli(["$HOME/Documents/GitHub/test dev"], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: path.join(fakeHome, "history.json") },
    homeDir: fakeHome
  });

  assert.equal(result.code, 0);
  assert.equal(
    await readFile(path.join(fakeHome, "Documents", "GitHub", "test dev", "manifest.json"), "utf8"),
    '{ "name": "fixture" }\n'
  );
});

test("warns and continues when history is malformed", async () => {
  const sourceDirectory = await createSourceFixture();
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-warning-"));
  const destinationDirectory = path.join(destinationRoot, "mirror");
  const historyPath = path.join(destinationRoot, "history.json");
  await writeFile(historyPath, "{\n", "utf8");

  const result = await runCli([destinationDirectory], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: historyPath }
  });

  assert.equal(result.code, 0);
  assert.match(result.stderr, /ignored invalid history file/);
  assert.equal(await readFile(path.join(destinationDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');

  const savedHistory = JSON.parse(await readFile(historyPath, "utf8"));
  assert.equal(savedHistory.version, 1);
  assert.equal(typeof savedHistory.projects, "object");
  assert.equal(Object.keys(savedHistory.projects).length, 1);
});

test("clean mode excludes common dev junk", async () => {
  const sourceDirectory = await createSourceFixture();
  await mkdir(path.join(sourceDirectory, "node_modules"), { recursive: true });
  await writeFile(path.join(sourceDirectory, "node_modules", "left-pad.js"), "module.exports = 0;\n", "utf8");
  const destinationRoot = await mkdtemp(path.join(os.tmpdir(), "handoffdev-clean-"));
  const destinationDirectory = path.join(destinationRoot, "mirror");

  const result = await runCli(["--clean", destinationDirectory], {
    cwd: sourceDirectory,
    env: { HANDOFFDEV_HISTORY_PATH: path.join(destinationRoot, "history.json") }
  });

  assert.equal(result.code, 0);
  assert.equal(await readFile(path.join(destinationDirectory, "manifest.json"), "utf8"), '{ "name": "fixture" }\n');
  assert.deepEqual((await readdir(destinationDirectory)).sort(), [".gitattributes", "manifest.json", "src"]);
});

async function createSourceFixture({ gitMode = "directory" } = {}) {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  await writeFile(path.join(sourceDirectory, ".gitattributes"), "* text=auto\n", "utf8");
  await writeFile(path.join(sourceDirectory, "manifest.json"), '{ "name": "fixture" }\n', "utf8");
  await mkdir(path.join(sourceDirectory, "src"), { recursive: true });
  await writeFile(path.join(sourceDirectory, "src", "content.js"), "console.log('fixture');\n", "utf8");

  if (gitMode === "file") {
    await writeFile(path.join(sourceDirectory, ".git"), "gitdir: /tmp/worktrees/feature\n", "utf8");
    return sourceDirectory;
  }

  await mkdir(path.join(sourceDirectory, ".git"), { recursive: true });
  await writeFile(path.join(sourceDirectory, ".git", "HEAD"), "ref: refs/heads/main\n", "utf8");
  return sourceDirectory;
}

async function runCli(args, { cwd, env = {}, homeDir } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env,
        ...(homeDir ? { HOME: homeDir } : {})
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

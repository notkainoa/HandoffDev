import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import { getRecentDestinations, loadHistory, recordSuccessfulRun, resolveProjectKey, saveHistory } from "../src/history.js";

const execFile = promisify(execFileCallback);

test("records destinations with recency ordering and case-insensitive dedupe", () => {
  let history = { version: 1, projects: {} };

  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/one",
    destinationKey: "/tmp/one",
    timestamp: "2026-03-08T16:00:00.000Z"
  });
  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/two",
    destinationKey: "/tmp/two",
    timestamp: "2026-03-08T16:01:00.000Z"
  });
  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/One",
    destinationKey: "/tmp/one",
    timestamp: "2026-03-08T16:02:00.000Z"
  });
  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/three",
    destinationKey: "/tmp/three",
    timestamp: "2026-03-08T16:03:00.000Z"
  });
  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/four",
    destinationKey: "/tmp/four",
    timestamp: "2026-03-08T16:04:00.000Z"
  });

  assert.deepEqual(
    getRecentDestinations(history, "project-a").map((entry) => entry.destination),
    ["/tmp/four", "/tmp/three", "/tmp/One"]
  );
});

test("keeps case-distinct destinations separate on case-sensitive filesystems", () => {
  let history = { version: 1, projects: {} };

  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/One",
    destinationKey: "/tmp/One",
    timestamp: "2026-03-08T16:00:00.000Z"
  });
  history = recordSuccessfulRun(history, {
    projectKey: "project-a",
    destination: "/tmp/one",
    destinationKey: "/tmp/one",
    timestamp: "2026-03-08T16:01:00.000Z"
  });

  assert.deepEqual(
    getRecentDestinations(history, "project-a").map((entry) => entry.destination),
    ["/tmp/one", "/tmp/One"]
  );
});

test("persists history to disk", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-"));
  const historyPath = path.join(tempDirectory, "history.json");
  const input = {
    version: 1,
    projects: {
      alpha: [
        {
          destination: "/tmp/one",
          destinationKey: "/tmp/one",
          lastUsedAt: "2026-03-08T16:00:00.000Z"
        }
      ]
    }
  };

  await saveHistory(input, historyPath);
  const loaded = await loadHistory(historyPath);
  assert.deepEqual(loaded, {
    history: input,
    warning: null
  });
});

test("treats malformed history as empty and warns", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-"));
  const historyPath = path.join(tempDirectory, "history.json");
  await writeFile(historyPath, "{\n", "utf8");

  const loaded = await loadHistory(historyPath);

  assert.deepEqual(loaded.history, { version: 1, projects: {} });
  assert.match(loaded.warning, /ignored invalid history file/);
});

test("treats invalid history shape as empty and warns", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-"));
  const historyPath = path.join(tempDirectory, "history.json");
  await writeFile(historyPath, JSON.stringify({ version: 1, projects: [] }), "utf8");

  const loaded = await loadHistory(historyPath);

  assert.deepEqual(loaded.history, { version: 1, projects: {} });
  assert.match(loaded.warning, /ignored invalid history file/);
});

test("falls back to cwd when not in git", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-history-"));
  assert.equal(await resolveProjectKey(cwd), await realpath(cwd));
});

test("shares the same project key across git worktrees", async () => {
  const tempDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-git-"));
  const repoDirectory = path.join(tempDirectory, "repo");
  const worktreeDirectory = path.join(tempDirectory, "repo-worktree");
  await mkdir(repoDirectory);

  await execFile("git", ["init"], { cwd: repoDirectory });
  await execFile("git", ["config", "user.name", "HandoffDev Tests"], { cwd: repoDirectory });
  await execFile("git", ["config", "user.email", "handoffdev@example.com"], { cwd: repoDirectory });
  await writeFile(path.join(repoDirectory, "README.md"), "# repo\n", "utf8");
  await execFile("git", ["add", "README.md"], { cwd: repoDirectory });
  await execFile("git", ["commit", "-m", "init"], { cwd: repoDirectory });
  await execFile("git", ["branch", "feature"], { cwd: repoDirectory });
  await execFile("git", ["worktree", "add", worktreeDirectory, "feature"], { cwd: repoDirectory });

  assert.equal(await resolveProjectKey(repoDirectory), await resolveProjectKey(worktreeDirectory));
});

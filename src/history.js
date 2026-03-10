import { execFile } from "node:child_process";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function getHistoryPath(homeDir = os.homedir()) {
  if (process.env.HANDOFFDEV_HISTORY_PATH) {
    return process.env.HANDOFFDEV_HISTORY_PATH;
  }

  return path.join(homeDir, "Library", "Application Support", "HandoffDev", "history.json");
}

export async function loadHistory(historyPath = getHistoryPath()) {
  try {
    const contents = await readFile(historyPath, "utf8");
    const parsed = JSON.parse(contents);

    if (!isValidHistoryPayload(parsed)) {
      return recoveredEmptyHistory(historyPath);
    }

    return {
      history: {
        version: typeof parsed.version === "number" ? parsed.version : 1,
        projects: parsed.projects
      },
      warning: null
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        history: emptyHistory(),
        warning: null
      };
    }

    if (error instanceof SyntaxError) {
      return recoveredEmptyHistory(historyPath);
    }

    throw error;
  }
}

export async function saveHistory(history, historyPath = getHistoryPath()) {
  await mkdir(path.dirname(historyPath), { recursive: true });
  await writeFile(historyPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

export function getRecentDestinations(history, projectKey) {
  const entries = history.projects[projectKey] ?? [];

  return entries
    .slice()
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .slice(0, 3);
}

export function recordSuccessfulRun(
  history,
  { projectKey, destination, destinationKey, timestamp = new Date().toISOString() }
) {
  const currentEntries = history.projects[projectKey] ?? [];
  const nextEntries = [
    {
      destination,
      destinationKey,
      lastUsedAt: timestamp
    },
    ...currentEntries.filter((entry) => entry.destinationKey !== destinationKey)
  ].slice(0, 3);

  return {
    ...history,
    projects: {
      ...history.projects,
      [projectKey]: nextEntries
    }
  };
}

export async function resolveProjectKey(cwd) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd }
    );

    const gitCommonDir = stdout.trim();
    if (!gitCommonDir) {
      throw new Error("git returned an empty common dir");
    }

    return await realpath(gitCommonDir);
  } catch {
    return await realpath(cwd);
  }
}

function emptyHistory() {
  return {
    version: 1,
    projects: {}
  };
}

function recoveredEmptyHistory(historyPath) {
  return {
    history: emptyHistory(),
    warning: `Warning: ignored invalid history file at ${historyPath}; recent destinations were unavailable for this run.`
  };
}

function isValidHistoryPayload(value) {
  if (!isRecord(value) || !isRecord(value.projects)) {
    return false;
  }

  return Object.values(value.projects).every((entries) => (
    Array.isArray(entries) && entries.every(isValidHistoryEntry)
  ));
}

function isValidHistoryEntry(value) {
  return (
    isRecord(value)
    && typeof value.destination === "string"
    && typeof value.destinationKey === "string"
    && typeof value.lastUsedAt === "string"
  );
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

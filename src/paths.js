import { lstat, readdir, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function resolveSourceDirectory(cwd) {
  return realpath(cwd);
}

export async function resolveDestination(input, { cwd, homeDir = os.homedir(), caseInsensitivePaths } = {}) {
  const rawInput = `${input ?? ""}`.trim();
  if (!rawInput) {
    throw new Error("Destination path cannot be empty.");
  }

  const expandedInput = expandHomeShortcut(rawInput, homeDir);
  const absoluteInput = path.isAbsolute(expandedInput)
    ? path.normalize(expandedInput)
    : path.resolve(cwd, expandedInput);

  const stats = await safeLstat(absoluteInput);
  const targetStats = stats ? await safeStat(absoluteInput) : null;
  const resolvedPath = await resolveWithExistingParent(absoluteInput);
  const detectedCaseInsensitive = caseInsensitivePaths ?? await isCaseInsensitivePath(resolvedPath);

  return {
    rawInput,
    absoluteInput,
    resolvedPath,
    compareKey: normalizeForCompare(resolvedPath, { caseInsensitive: detectedCaseInsensitive }),
    caseInsensitive: detectedCaseInsensitive,
    exists: Boolean(stats),
    isDirectory: targetStats?.isDirectory?.() ?? false,
    isFile: targetStats?.isFile?.() ?? false
  };
}

export async function validateDestination(
  destination,
  { sourceDirectory, homeDir = os.homedir(), caseInsensitivePaths } = {}
) {
  const destinationCaseInsensitive = caseInsensitivePaths ?? destination.caseInsensitive ?? await isCaseInsensitivePath(destination.resolvedPath);
  const sourceResolvedPath = await safeRealpath(sourceDirectory);
  const sourceCaseInsensitive = caseInsensitivePaths ?? await isCaseInsensitivePath(sourceResolvedPath);
  const compareCaseInsensitive = destinationCaseInsensitive && sourceCaseInsensitive;
  const destinationComparePath = normalizeForCompare(destination.resolvedPath, { caseInsensitive: destinationCaseInsensitive });
  const comparePath = normalizeForCompare(destination.resolvedPath, { caseInsensitive: compareCaseInsensitive });
  const sourceCompare = normalizeForCompare(sourceResolvedPath, { caseInsensitive: compareCaseInsensitive });
  const destinationRoot = path.parse(destination.resolvedPath).root || path.normalize("/");

  if (destination.isFile) {
    throw new Error(`Destination ${destination.resolvedPath} is an existing file, not a directory.`);
  }

  if (destinationComparePath === normalizeForCompare(destinationRoot, { caseInsensitive: destinationCaseInsensitive })) {
    throw new Error("Destination / is not allowed.");
  }

  if (comparePath === sourceCompare) {
    throw new Error("Destination cannot be the current source folder.");
  }

  if (isWithin(comparePath, sourceCompare)) {
    throw new Error("Destination cannot be inside the current source folder.");
  }

  if (isWithin(sourceCompare, comparePath)) {
    throw new Error("Destination cannot be an ancestor of the current source folder.");
  }

  const protectedExact = getProtectedExactPaths(homeDir, { caseInsensitive: destinationCaseInsensitive });
  if (protectedExact.has(destinationComparePath)) {
    throw new Error(`Destination ${destination.resolvedPath} is a protected folder and cannot be used directly.`);
  }

  const protectedSubtrees = getProtectedSubtrees({ caseInsensitive: destinationCaseInsensitive });
  for (const root of protectedSubtrees) {
    if (destinationComparePath === root || isWithin(destinationComparePath, root)) {
      throw new Error(`Destination ${destination.resolvedPath} is inside a protected system-level folder.`);
    }
  }
}

export function expandHomeShortcut(input, homeDir = os.homedir()) {
  if (input === "~") {
    return homeDir;
  }

  if (input.startsWith("~/")) {
    return path.join(homeDir, input.slice(2));
  }

  if (input === "$HOME") {
    return homeDir;
  }

  if (input.startsWith("$HOME/")) {
    return path.join(homeDir, input.slice("$HOME/".length));
  }

  return input;
}

export async function directoryHasContents(directoryPath) {
  const entries = await readdir(directoryPath);
  return entries.length > 0;
}

export function normalizeForCompare(targetPath, { caseInsensitive = false } = {}) {
  const normalizedPath = path.normalize(targetPath);
  return caseInsensitive ? normalizedPath.toLowerCase() : normalizedPath;
}

async function resolveWithExistingParent(targetPath) {
  let current = targetPath;
  const missingSegments = [];

  while (true) {
    try {
      await lstat(current);
      const resolvedCurrent = await realpath(current);

      if (missingSegments.length === 0) {
        return resolvedCurrent;
      }

      return path.join(resolvedCurrent, ...missingSegments.reverse());
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return path.normalize(targetPath);
    }

    missingSegments.push(path.basename(current));
    current = parent;
  }
}

function getProtectedExactPaths(homeDir, { caseInsensitive = false } = {}) {
  return new Set(
    [
      "/",
      "/System",
      "/Library",
      "/Applications",
      "/Users",
      "/Volumes",
      "/private",
      "/opt",
      "/bin",
      "/sbin",
      "/etc",
      "/tmp",
      "/var",
      homeDir,
      path.join(homeDir, "Desktop"),
      path.join(homeDir, "Documents"),
      path.join(homeDir, "Downloads"),
      path.join(homeDir, "Library"),
      path.join(homeDir, "Movies"),
      path.join(homeDir, "Music"),
      path.join(homeDir, "Pictures"),
      path.join(homeDir, "Public"),
      path.join(homeDir, "Sites"),
      path.join(homeDir, ".Trash"),
      path.join(homeDir, ".config"),
      path.join(homeDir, ".ssh"),
      path.join(homeDir, "Documents", "GitHub"),
      path.join(homeDir, "Documents", "GitHub", "Chrome Extension Dev")
    ].map((targetPath) => normalizeForCompare(targetPath, { caseInsensitive }))
  );
}

function getProtectedSubtrees({ caseInsensitive = false } = {}) {
  return new Set(
    [
      "/System",
      "/Library/Developer",
      "/Library/Application Support",
      "/Applications",
      "/bin",
      "/sbin",
      "/etc",
      "/dev",
      "/cores",
      "/Network",
      "/Documents",
      "/Downloads",
      "/Desktop",
      "/opt/homebrew"
    ].map((targetPath) => normalizeForCompare(targetPath, { caseInsensitive }))
  );
}

function isWithin(targetPath, rootPath) {
  if (targetPath === rootPath) {
    return false;
  }

  return targetPath.startsWith(`${rootPath}${path.sep}`);
}

async function safeLstat(targetPath) {
  try {
    return await lstat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function safeStat(targetPath) {
  try {
    return await stat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function safeRealpath(targetPath) {
  try {
    return await realpath(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return targetPath;
    }

    throw error;
  }
}

async function isCaseInsensitivePath(targetPath) {
  let current = await findNearestExistingPath(targetPath);

  while (current) {
    const parent = path.dirname(current);
    if (parent === current) {
      return false;
    }

    const probeName = swapCaseCharacter(path.basename(current));
    if (probeName) {
      const probePath = path.join(parent, probeName);
      const probeRealPath = await safeRealpath(probePath);

      return probeRealPath !== probePath && probeRealPath === await safeRealpath(current);
    }

    current = parent;
  }

  return false;
}

async function findNearestExistingPath(targetPath) {
  let current = path.normalize(targetPath);

  while (true) {
    if (await safeLstat(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

function swapCaseCharacter(input) {
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character >= "a" && character <= "z") {
      return `${input.slice(0, index)}${character.toUpperCase()}${input.slice(index + 1)}`;
    }

    if (character >= "A" && character <= "Z") {
      return `${input.slice(0, index)}${character.toLowerCase()}${input.slice(index + 1)}`;
    }
  }

  return null;
}

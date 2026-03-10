import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { normalizeForCompare, resolveDestination, validateDestination } from "../src/paths.js";

test("resolves relative paths from cwd", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const destination = await resolveDestination("./mirror", { cwd, homeDir: "/Users/tester" });
  assert.equal(destination.resolvedPath, path.join(await realpath(cwd), "mirror"));
});

test("expands a tilde path", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const destination = await resolveDestination("~/Documents/GitHub/test dev", {
    cwd,
    homeDir: "/Users/tester"
  });
  assert.equal(destination.resolvedPath, "/Users/tester/Documents/GitHub/test dev");
});

test("expands a $HOME path", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const destination = await resolveDestination("$HOME/Documents/GitHub/test dev", {
    cwd,
    homeDir: "/Users/tester"
  });
  assert.equal(destination.resolvedPath, "/Users/tester/Documents/GitHub/test dev");
});

test("preserves already-unwrapped quoted shell input", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const destination = await resolveDestination("/Users/tester/Documents/GitHub/test dev", {
    cwd,
    homeDir: "/Users/tester"
  });
  assert.equal(destination.resolvedPath, "/Users/tester/Documents/GitHub/test dev");
});

test("rejects a $Home-style path that zsh would turn into /Documents/...", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const destination = await resolveDestination("/Documents/test dev", {
    cwd,
    homeDir: "/Users/tester"
  });

  await assert.rejects(
    validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" }),
    /protected system-level folder/
  );
});

test("rejects the current source folder", async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const destination = await resolveDestination(sourceDirectory, {
    cwd: sourceDirectory,
    homeDir: "/Users/tester"
  });

  await assert.rejects(
    validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" }),
    /current source folder/
  );
});

test("rejects a descendant of the current source folder", async () => {
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const destination = await resolveDestination(path.join(sourceDirectory, "nested"), {
    cwd: sourceDirectory,
    homeDir: "/Users/tester"
  });

  await assert.rejects(
    validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" }),
    /inside the current source folder/
  );
});

test("rejects an ancestor of the current source folder", async () => {
  const parentDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-parent-"));
  const sourceDirectory = path.join(parentDirectory, "source");
  await mkdir(sourceDirectory);
  const destination = await resolveDestination(parentDirectory, {
    cwd: sourceDirectory,
    homeDir: "/Users/tester"
  });

  await assert.rejects(
    validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" }),
    /ancestor of the current source folder/
  );
});

test("rejects an existing file destination", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const filePath = path.join(cwd, "target.txt");
  await writeFile(filePath, "hello\n", "utf8");
  const destination = await resolveDestination(filePath, {
    cwd,
    homeDir: "/Users/tester"
  });

  await assert.rejects(
    validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" }),
    /existing file/
  );
});

test("allows a deeper disposable destination under GitHub", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const destination = await resolveDestination("/Users/tester/Documents/GitHub/test dev", {
    cwd,
    homeDir: "/Users/tester"
  });

  await validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" });
});

test("allows case-distinct source and destination paths on case-sensitive filesystems", async () => {
  const sourceDirectory = "/tmp/MyApp";
  const destination = {
    resolvedPath: "/tmp/myapp",
    isFile: false,
    caseInsensitive: false
  };

  await validateDestination(destination, {
    sourceDirectory,
    homeDir: "/Users/tester",
    caseInsensitivePaths: false
  });
});

test("rejects case-distinct source and destination paths on case-insensitive filesystems", async () => {
  const sourceDirectory = "/tmp/MyApp";
  const destination = {
    resolvedPath: "/tmp/myapp",
    isFile: false,
    caseInsensitive: true
  };

  await assert.rejects(
    validateDestination(destination, {
      sourceDirectory,
      homeDir: "/Users/tester",
      caseInsensitivePaths: true
    }),
    /current source folder/
  );
});

test("treats an existing symlink to a directory as a directory", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const targetDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-target-"));
  const destinationLink = path.join(cwd, "mirror-link");
  await symlink(targetDirectory, destinationLink);

  const destination = await resolveDestination(destinationLink, {
    cwd,
    homeDir: "/Users/tester"
  });

  assert.equal(destination.exists, true);
  assert.equal(destination.isDirectory, true);
  assert.equal(destination.isFile, false);
  assert.equal(destination.resolvedPath, await realpath(targetDirectory));
  await validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" });
});

test("treats an existing symlink to a file as a file destination", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "handoffdev-paths-"));
  const sourceDirectory = await mkdtemp(path.join(os.tmpdir(), "handoffdev-source-"));
  const targetFile = path.join(cwd, "target.txt");
  const destinationLink = path.join(cwd, "mirror-link");
  await writeFile(targetFile, "hello\n", "utf8");
  await symlink(targetFile, destinationLink);

  const destination = await resolveDestination(destinationLink, {
    cwd,
    homeDir: "/Users/tester"
  });

  assert.equal(destination.exists, true);
  assert.equal(destination.isDirectory, false);
  assert.equal(destination.isFile, true);
  await assert.rejects(
    validateDestination(destination, { sourceDirectory, homeDir: "/Users/tester" }),
    /existing file/
  );
});

test("preserves case-sensitive compare keys", () => {
  assert.notEqual(
    normalizeForCompare("/Users/tester/Documents/GitHub/Test Dev"),
    normalizeForCompare("/users/tester/documents/github/test dev")
  );
});

test("normalizes case-insensitive compare keys when requested", () => {
  assert.equal(
    normalizeForCompare("/Users/tester/Documents/GitHub/Test Dev", { caseInsensitive: true }),
    normalizeForCompare("/users/tester/documents/github/test dev", { caseInsensitive: true })
  );
});

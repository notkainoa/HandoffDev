import test from "node:test";
import assert from "node:assert/strict";

import { parseArgs } from "../src/args.js";

test("parses a positional destination", () => {
  assert.deepEqual(parseArgs(["./dest"]), {
    clean: false,
    destination: "./dest",
    error: null,
    showHelp: false,
    exitCode: 0
  });
});

test("parses clean before destination", () => {
  assert.deepEqual(parseArgs(["--clean", "./dest"]), {
    clean: true,
    destination: "./dest",
    error: null,
    showHelp: false,
    exitCode: 0
  });
});

test("parses clean after destination", () => {
  assert.deepEqual(parseArgs(["./dest", "--clean"]), {
    clean: true,
    destination: "./dest",
    error: null,
    showHelp: false,
    exitCode: 0
  });
});

test("supports -- as an option terminator", () => {
  assert.deepEqual(parseArgs(["--", "--strange-name"]), {
    clean: false,
    destination: "--strange-name",
    error: null,
    showHelp: false,
    exitCode: 0
  });
});

test("help aliases show help", () => {
  for (const arg of ["-h", "--h", "-help", "--help"]) {
    const parsed = parseArgs([arg]);
    assert.equal(parsed.showHelp, true);
    assert.equal(parsed.exitCode, 0);
  }
});

test("unknown options redirect to help with an error", () => {
  const parsed = parseArgs(["--wat"]);
  assert.equal(parsed.showHelp, true);
  assert.equal(parsed.exitCode, 1);
  assert.equal(parsed.error, "Unknown option: --wat");
});

test("too many positional arguments redirect to help with an error", () => {
  const parsed = parseArgs(["one", "two"]);
  assert.equal(parsed.showHelp, true);
  assert.equal(parsed.exitCode, 1);
  assert.match(parsed.error, /Too many destination arguments/);
});

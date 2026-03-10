const HELP_ALIASES = new Set(["-h", "--h", "-help", "--help"]);
const CLEAN_FLAG = "--clean";
const OPTION_TERMINATOR = "--";

export function parseArgs(argv) {
  let clean = false;
  let help = false;
  let destination = null;
  let afterTerminator = false;

  for (const arg of argv) {
    if (afterTerminator) {
      if (destination !== null) {
        return invalidUsage(`Too many destination arguments: ${destination} and ${arg}`);
      }

      destination = arg;
      continue;
    }

    if (arg === OPTION_TERMINATOR) {
      afterTerminator = true;
      continue;
    }

    if (HELP_ALIASES.has(arg)) {
      help = true;
      continue;
    }

    if (arg === CLEAN_FLAG) {
      clean = true;
      continue;
    }

    if (arg.startsWith("-")) {
      return invalidUsage(`Unknown option: ${arg}`);
    }

    if (destination !== null) {
      return invalidUsage(`Too many destination arguments: ${destination} and ${arg}`);
    }

    destination = arg;
  }

  if (help) {
    return {
      clean,
      destination: null,
      error: null,
      showHelp: true,
      exitCode: 0
    };
  }

  return {
    clean,
    destination,
    error: null,
    showHelp: false,
    exitCode: 0
  };
}

function invalidUsage(message) {
  return {
    clean: false,
    destination: null,
    error: message,
    showHelp: true,
    exitCode: 1
  };
}

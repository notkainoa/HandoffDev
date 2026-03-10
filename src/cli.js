import { mkdir } from "node:fs/promises";
import os from "node:os";
import process from "node:process";

import { parseArgs } from "./args.js";
import { getHelpText } from "./help.js";
import { getHistoryPath, getRecentDestinations, loadHistory, recordSuccessfulRun, resolveProjectKey, saveHistory } from "./history.js";
import { resolveDestination, resolveSourceDirectory, validateDestination, directoryHasContents } from "./paths.js";
import { chooseDestination, confirmOverwrite, createPrompts, PromptCanceledError } from "./prompts.js";
import { ensureRsyncAvailable, runRsync } from "./rsync.js";

export async function runCli(argv, options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const homeDir = options.homeDir ?? os.homedir();
  const prompts = await createPrompts({
    env: options.env ?? process.env,
    stdin: options.stdin ?? process.stdin,
    stdout
  });

  try {
    const parsedArgs = parseArgs(argv);
    if (parsedArgs.showHelp) {
      if (parsedArgs.error) {
        stderr.write(`${parsedArgs.error}\n\n`);
      }

      stdout.write(`${getHelpText()}\n`);
      return parsedArgs.exitCode;
    }

    await ensureRsyncAvailable();

    const sourceDirectory = await resolveSourceDirectory(cwd);
    const projectKey = await resolveProjectKey(cwd);
    const historyPath = getHistoryPath(homeDir);
    const { history, warning: historyWarning } = await loadHistory(historyPath);

    if (historyWarning) {
      stderr.write(`${historyWarning}\n`);
    }

    let interactive = false;
    let destinationInput = parsedArgs.destination;

    if (!destinationInput) {
      if (!prompts.canPrompt()) {
        throw new Error("No destination was provided and no interactive terminal is available.");
      }

      interactive = true;
      prompts.intro("HandoffDev");
      destinationInput = await chooseDestination(prompts, {
        recentDestinations: getRecentDestinations(history, projectKey),
        placeholder: "~/Documents/GitHub/Chrome Extension Dev/test dev"
      });
    }

    const destination = await resolveDestination(destinationInput, { cwd, homeDir });
    await validateDestination(destination, { sourceDirectory, homeDir });

    let destinationHasContents = false;
    if (destination.exists) {
      if (!destination.isDirectory) {
        throw new Error(`Destination ${destination.resolvedPath} is not a directory.`);
      }

      destinationHasContents = await directoryHasContents(destination.resolvedPath);
    }

    if (destinationHasContents) {
      if (!prompts.canPrompt()) {
        throw new Error("Destination already contains files, but no interactive terminal is available to confirm deleting them.");
      }

      if (!interactive) {
        prompts.intro("HandoffDev");
        interactive = true;
      }

      const confirmed = await confirmOverwrite(prompts, destination.resolvedPath);
      if (!confirmed) {
        prompts.cancel("Canceled before deleting destination contents.");
        return 0;
      }
    }

    await mkdir(destination.resolvedPath, { recursive: true });

    const syncSpinner = prompts.canPrompt() ? prompts.spinner() : null;
    syncSpinner?.start(`Mirroring ${sourceDirectory} into ${destination.resolvedPath}`);

    await runRsync(sourceDirectory, destination.resolvedPath, { clean: parsedArgs.clean });

    syncSpinner?.stop("Mirror complete.");

    const nextHistory = recordSuccessfulRun(history, {
      projectKey,
      destination: destination.resolvedPath,
      destinationKey: destination.compareKey
    });

    try {
      await saveHistory(nextHistory, historyPath);
    } catch (historyError) {
      stderr.write(`Warning: mirrored successfully, but failed to save history: ${historyError.message}\n`);
    }

    const summary = `Mirrored ${sourceDirectory} into ${destination.resolvedPath}${parsedArgs.clean ? " with --clean" : ""}.`;
    if (interactive) {
      prompts.outro(summary);
    } else {
      stdout.write(`${summary}\n`);
    }

    return 0;
  } catch (error) {
    if (error instanceof PromptCanceledError) {
      return 0;
    }

    stderr.write(`${error.message}\n`);
    return 1;
  }
}

import process from "node:process";

const CUSTOM_DESTINATION = "__handoffdev_custom_destination__";

export function createPrompts({ env = process.env, stdin = process.stdin, stdout = process.stdout } = {}) {
  if (env.HANDOFFDEV_TEST_PROMPTS) {
    return createTestPrompts(JSON.parse(env.HANDOFFDEV_TEST_PROMPTS));
  }

  return createClackPrompts({ stdin, stdout });
}

export async function chooseDestination(prompts, { recentDestinations, placeholder }) {
  if (recentDestinations.length > 0) {
    const selection = await prompts.select({
      message: "Choose a destination to mirror into",
      options: [
        ...recentDestinations.map((entry) => ({
          value: entry.destination,
          label: entry.destination
        })),
        {
          value: CUSTOM_DESTINATION,
          label: "Enter a custom destination"
        }
      ]
    });

    if (selection !== CUSTOM_DESTINATION) {
      return selection;
    }
  }

  return prompts.text({
    message: "Enter the destination path",
    placeholder
  });
}

export async function confirmOverwrite(prompts, destination) {
  return prompts.select({
    message: `Destination ${destination} already contains files. Mirror here and delete existing contents?`,
    options: [
      {
        value: false,
        label: "No, cancel"
      },
      {
        value: true,
        label: "Yes, mirror here and delete existing contents"
      }
    ]
  });
}

function createTestPrompts(testState) {
  const selectQueue = [...(testState.select ?? [])];
  const textQueue = [...(testState.text ?? [])];

  return {
    canPrompt() {
      return true;
    },
    intro() {},
    outro() {},
    cancel() {},
    spinner() {
      return {
        start() {},
        stop() {}
      };
    },
    async select({ options }) {
      if (selectQueue.length === 0) {
        throw new Error("No more queued select responses for HANDOFFDEV_TEST_PROMPTS.");
      }

      const value = selectQueue.shift();
      const validValues = new Set(options.map((option) => option.value));
      if (!validValues.has(value)) {
        throw new Error(`Queued select response ${String(value)} does not match the available options.`);
      }

      return value;
    },
    async text() {
      if (textQueue.length === 0) {
        throw new Error("No more queued text responses for HANDOFFDEV_TEST_PROMPTS.");
      }

      return textQueue.shift();
    }
  };
}

async function createClackPrompts({ stdin, stdout }) {
  const clack = await import("@clack/prompts");

  function unwrap(result) {
    if (clack.isCancel(result)) {
      clack.cancel("Canceled.");
      throw new PromptCanceledError();
    }

    return result;
  }

  return {
    canPrompt() {
      return Boolean(stdin.isTTY && stdout.isTTY);
    },
    intro(title) {
      clack.intro(title);
    },
    outro(message) {
      clack.outro(message);
    },
    cancel(message) {
      clack.cancel(message);
    },
    spinner() {
      return clack.spinner();
    },
    async select({ message, options }) {
      return unwrap(
        await clack.select({
          message,
          options
        })
      );
    },
    async text({ message, placeholder }) {
      return unwrap(
        await clack.text({
          message,
          placeholder,
          validate(value) {
            return value.trim() ? undefined : "Enter a destination path.";
          }
        })
      );
    }
  };
}

export class PromptCanceledError extends Error {
  constructor() {
    super("Prompt canceled.");
    this.name = "PromptCanceledError";
  }
}

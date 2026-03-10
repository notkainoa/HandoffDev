# HandoffDev

HandoffDev mirrors the folder you are currently in into a disposable testing copy. It is meant for workflows like Chrome extension development where your browser points at one stable unpacked-extension folder while you keep editing in different worktrees, branches, or local clones.

## Install

```sh
npm install
npm link
```

After `npm link`, the `handoffdev` command is available in your shell.

## Usage

```sh
handoffdev
handoffdev <destination>
handoffdev --clean
handoffdev --clean <destination>
handoffdev <destination> --clean
handoffdev -- <destination>
handoffdev --help
```

Examples:

```sh
handoffdev
handoffdev ~/Documents/GitHub/"test dev"
handoffdev "~/Documents/GitHub/test dev"
handoffdev $HOME/Documents/GitHub/"test dev"
handoffdev "$HOME/Documents/GitHub/test dev"
handoffdev --clean ~/Documents/GitHub/"test dev"
```

## How it works

- HandoffDev copies the contents of the current working directory into the destination with `rsync -a --delete`.
- Default mode always excludes `.git` and `.DS_Store`.
- `--clean` also skips common local junk like `node_modules/` and cache folders.
- If the destination already contains anything, HandoffDev asks for confirmation before continuing because the mirror deletes files that are not present in the source.

## Interactive mode

- Running `handoffdev` with no destination opens an interactive flow built with `@clack/prompts`.
- HandoffDev remembers the last 3 unique successful destinations per project.
- Git worktrees share the same recent history because HandoffDev keys project history from `git rev-parse --git-common-dir`.
- If there is no history yet, HandoffDev asks you to type a destination path.

History is stored at:

```text
~/Library/Application Support/HandoffDev/history.json
```

## Path rules

- `~` and `$HOME` are supported.
- Relative paths are resolved from the folder you run HandoffDev in.
- Empty destinations, `/`, protected anchor folders, the current source folder, ancestors of the source, and descendants of the source are rejected.
- HandoffDev compares paths case-insensitively only when the destination filesystem is case-insensitive, so `GitHub` and `Github` are treated as the same destination only in those environments.

## `$HOME` vs `$Home`

Use `$HOME` or `~`. Do not use `$Home`.

In `zsh`, `$Home` expands before HandoffDev starts. On this machine it becomes `/Documents/...`, so HandoffDev never sees the original text and cannot recover what you meant. That resolved path is rejected as unsafe.

## Development

```sh
npm test
```

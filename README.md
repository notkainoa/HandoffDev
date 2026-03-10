# HandoffDev

HandoffDev copies the folder you are currently in into another folder for testing.

It is built for workflows like Chrome extension development:

1. Load one stable unpacked extension folder in Chrome.
2. Keep working in whatever branch, worktree, or clone you want.
3. Run `handoffdev` to refresh the testing copy.
4. Reload the extension in Chrome.

## Install

From npm, after the package is published:

```sh
npm install -g handoffdev
```

From this repo right now:

```sh
npm install
npm link
```

After `npm link`, `handoffdev` is available in your shell.

## Quick Start

Run it from inside the folder you want to mirror:

```sh
cd /path/to/your/project
handoffdev
```

If you already know the destination:

```sh
handoffdev ~/Documents/GitHub/"test dev"
handoffdev "~/Documents/GitHub/test dev"
handoffdev $HOME/Documents/GitHub/"test dev"
handoffdev "$HOME/Documents/GitHub/test dev"
handoffdev --clean ~/Documents/GitHub/"test dev"
```

## Main Commands

```sh
handoffdev
handoffdev <destination>
handoffdev --clean
handoffdev --clean <destination>
handoffdev <destination> --clean
handoffdev -- <destination>
handoffdev -h
handoffdev --h
handoffdev -help
handoffdev --help
```

## What It Does

- Copies the contents of your current folder into a destination folder.
- Uses `rsync --delete`, so the destination becomes a mirror of your current folder.
- Always skips `.git/` and `.DS_Store`.
- `--clean` also skips common local junk like `node_modules/` and cache folders.
- If the destination already has files in it, HandoffDev asks for confirmation before deleting anything.

## Interactive Mode

- Running `handoffdev` with no destination opens an interactive prompt.
- HandoffDev remembers your last 3 unique successful destinations per project.
- Git worktrees share the same recent history.
- If there is no history yet, it asks you to enter a path.

History is stored at:

```text
~/Library/Application Support/HandoffDev/history.json
```

## Path Rules

- `~` and `$HOME` are supported.
- Relative paths are resolved from the folder you run HandoffDev in.
- Empty destinations, `/`, protected anchor folders, the current source folder, parents of the source folder, and children of the source folder are rejected.
- On macOS, `GitHub` and `Github` are treated as the same path for safety checks and history matching.

## `$HOME` vs `$Home`

Use `$HOME` or `~`.

Do not use `$Home`. In `zsh`, `$Home` expands before HandoffDev starts, so HandoffDev cannot recover what you meant and the resulting path is rejected as unsafe.

## Development

```sh
npm test
```

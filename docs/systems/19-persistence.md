# Persistence

Files: `src/core/application/ports/PersistenceRepository.ts` (the port), `src/infrastructure/persistence/json/JsonPersistenceRepository.ts` (adapter; note the misspelled folder names), `GameState.fromPlainObject` (rehydration, see 08), save/load handling in `GameEngine.handleCommand` (see 02), menu loading in `src/ui/ink/InkApp.tsx`. Tests: `src/test/persistence.test.ts` (14 cases). `/saves/` is git-ignored.

## What it does

Saves the whole `GameState` to disk and loads it back, so a run can be continued later.

## How it works

- **Port:** `PersistenceRepository { save, load, exists }`, all async.
- **Copies:** `GameState.clone()` is `fromPlainObject(JSON.parse(JSON.stringify(state)))`, i.e. the save path, so copies and saves share one definition of the state. The undo history lives in memory only and is not saved.
- **Strict format:** a save carries `metadata.saveVersion` (`SAVE_FORMAT_VERSION`, now "4"; older saves lacked the turn history, the random state or the fact log and are refused) and `load` validates the whole file against a Zod schema (`SaveSchema.ts`) in which every part is required. Anything else (another version, a missing or wrong-typed part, invalid JSON) throws `InvalidSaveError` listing the problems. There is deliberately **no migration and no defaults**: old saves were wiped, and a save missing a part is refused.
- **Content check:** after loading, `validateLoadedState` (`SaveValidation.ts`) refuses a save whose places, spells or characters the game no longer has (or lacks a new spell), or that has no campaign / year story blueprint. Saves are tied to the content version.
- **Adapter:** `JsonPersistenceRepository` writes `JSON.stringify(state, null, 2)` to `<cwd>/saves/<name>.json` (creating the folder), and loads with `JSON.parse` followed by `GameState.fromPlainObject`. File names are sanitised (`path.basename`, non-`[A-Za-z0-9_-]` replaced by `_`, empty becomes `autosave`).
- **Triggering:** the player types "save x" / "load x". The fast path (`FastPath.ts`, no LLM) turns that into a `SAVE` or `LOAD` command; a bare `save` writes the `quicksave` slot and a bare `load` takes `quicksave`, else `autosave` (the repository's `exists` decides), so a manual save is never overwritten by the daily autosave. The and the SAVE/LOAD handler calls the repository, emits `GameSaved`/`GameLoaded`, and replaces `engine.state` on load.
- **Menu:** "Continue" and "Load Save" both run the full startup, then send `load autosave` through the normal command path; if it is refused, the reason is shown and a new game starts.

## Strengths

- **Clean port and adapter.** The engine depends on an interface and takes the repository through its config, so a different backend (SQLite, cloud, in-memory for tests) is a drop-in.
- **Human-readable, diffable saves,** useful for debugging and for the "inspect the state" workflow the project depends on.
- **Basic path-traversal protection** on file names.
- **Tests cover the adapter** (directory creation, default name, sanitisation, formatting, overwrite, multiple independent saves, missing file).
- **State is mostly plain data,** so serialisation is trivial for most fields.
- **Saves are git-ignored,** so progress files do not leak into the repository.

## Weaknesses

1. **Autosave: partly fixed.** The `autosave` slot is written at the start of each new calendar day (a world-tick signal, after the turn is final); failures are logged, not shown, so "Continue" works after the first midnight. Still missing: autosave on quit, after milestones, rotating slots, and any autosave before the first day ends.
2. **"Continue" runs the whole startup first.** It includes the Ollama probe and a new campaign and year blueprint generation that the load then overwrites. "Load Save" is the same action and has no slot picker.
3. **Unsafe writes.** `writeFile` overwrites in place with no temp file, atomic rename, or backup. A crash or full disk mid-write corrupts the only save. The folder is relative to the current working directory (`process.cwd()`), so running the game from another directory creates and reads a different `saves/`.
4. **The whole state is saved, including noise.** `output` (the last narration) and a deterministic copy of the blueprint all go in. Fine for now, but it will grow and it mixes durable state with session state.
5. **Weak sanitisation semantics.** Different names collide (`a b` and `a_b` become the same file), case-insensitive file systems collapse names that differ only by case, and the player is not told which name was actually used (the message echoes the requested name).
6. **No save management.** No list of saves, no metadata (character, location, year, in-game time, playtime, version), no delete or rename, and no slot UI. The only way to know what exists is to look in the folder.
7. **Minor API issues.** `save(filename = "autosave", state)` declares a default on a parameter that comes before a required one, so the default can never apply, and the adapter uses `var`.

## Rework ideas

- **Make the save format explicit:** a versioned envelope `{ version, savedAt, meta: { name, location, year, playtime, contentVersion }, state }`, a Zod schema for `state`, and a migration chain. Validate on load with clear errors ("save is from a newer version").
- **Plain-data state** (see 08), so what is saved is exactly what is loaded, with no rehydration to forget. Add a round-trip test that saves a played game, loads it, and applies every effect type.
- **Reliable writes:** write to a temp file and rename, keep a rolling `.bak`, and resolve the saves directory from a configured path (user data folder or an environment variable), not the working directory.
- **Autosave** at defined points (end of day, after a milestone, on quit), to a rotating set of slots, with a visible "saved" indicator.
- **Loading as a first-class flow, not a command:** the menu lists saves with metadata and loads directly through the repository, skipping the LLM and the blueprint generation. In-game `load` can remain as a convenience, parsed by rules (see 03).
- **Report failures** to the player and never fall back silently: "autosave not found", "save is corrupt, backup available".
- **Isolate tests:** inject the saves directory into the repository (a temp directory per test) and never touch the real folder.
- **Separate durable from session data:** do not save `output` or derived caches, cap the event log, and consider an event journal as an optional appendix (see 06).
- **Slot management:** list, rename, delete, and export, with unique-name handling and the actual file name shown to the player.
- **Check content compatibility** on load (ids exist, content pack versions), and report or repair gracefully.

## Open questions

- Do saves need to remain compatible across versions during the rework, or can we cut a clean v1 format?
- Is the save a snapshot only, or also an event journal for replay, debugging and bug reports? (The journal costs space but pays off in testing.)
- Where should user data live (project folder, home directory, OS app data)? That matters if the game is ever distributed.
- One slot with autosave, or named slots, or both?

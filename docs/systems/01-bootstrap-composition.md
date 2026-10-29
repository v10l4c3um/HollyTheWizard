# Bootstrap & Composition Root

Files: `src/bootstrap/engineFactory.ts` (~190 lines), `src/types.ts` (`IGameEngine`), the constructor of `GameEngine` (second-level wiring, see 02), entry `src/ui/ink/entry.ts`. Test: `src/test/engine-factory.test.ts` (1 case: startup fails when Ollama is unreachable). The older `src/bootstrap.ts` is dead (see 22).

## What it does

Builds a ready-to-play game: loads content into a `Registry`, creates the event bus and the `GameEngine`, wires bus listeners, initialises the spellbook, and generates the campaign and year-1 blueprints. The Ink UI calls it as `engineFactory(onProgress)` and shows the progress as six loading milestones.

## How it works

`engineFactory(onProgress)`:

1. `buildRegistry`: creates a `Registry`; **hard-codes** three locations and one NPC (`villager`); `ContentLoader.loadAllPacks` (spells, NPCs, profiles); `SchoolDataLoader.loadSchoolData` (subjects, curriculum, timetables). Progress is reported for content packs and school data.
2. `createGameBus()` and `createEngine(registry, bus, options)`, which builds the resolver, renderer, blueprint use cases, progress service, persistence repository, logger and the command-handler map, and injects them into `GameEngine` (see 02).
3. Registers four `bus.on` listeners that translate events into quest flags (see 07).
4. Sets every registered spell to `hidden` in `engine.state.spellbook`.
5. `engine.initializeCampaignBlueprint()`: Ollama health check for each distinct model, then generate the campaign and year blueprints (see 15, 18). Any failure throws and aborts startup.
6. Returns the engine as `IGameEngine`. Separately, `locationNameResolver(id)` lazily builds a **second** registry just to look up display names for the UI.

## Strengths

- **There is a composition root.** One function builds the object graph, so construction is not scattered through the UI and domain code.
- **Dependency inversion at the UI edge:** the UI takes `engineFactory` as a prop and sees only `IGameEngine`, so it can be tested with a fake.
- **Progress reporting is structured** (typed ids, labels, counts), which gives the loading screen real information.
- **The bus is created outside the engine and shared,** so listeners can be attached at the root.
- **Fail-fast startup** with a clear message when the LLM is unavailable.
- **The startup path is covered by a test** for its main failure mode.

## Weaknesses

1. **The root has no clock source and no seed.** `createEngine` builds the object graph from `EngineOptions` (Ollama configs, persistence, logger, fallback flag). Time comes from the `WorldClock` inside the state, and the random source is seeded from the game state (`freshRandomState`) with no way to inject a seed through the options, so a whole run (including the campaign seed, generated from `Date.now()`) cannot be reproduced from the outside.
2. **Spellbook initialisation is a startup side effect on a state it does not own.** The factory reaches into `engine.state.spellbook` after construction. Because it runs only at startup, a loaded save is missing any spell added to the content since that save (no `hidden` entry), so new spells never appear for existing saves, and `getSpellState` returns `undefined` for them. State creation (new game vs. loaded) is also mixed up with engine creation.
3. **New game and load are the same path.** The UI's `choice` (new, continue, load) is not passed to the factory. Every start generates a new campaign and year blueprint through the LLM, and the loaded save then overwrites them (see 19). Startup cost is paid even when the result is discarded.
4. **Milestones are declared in three places:** the `StartupProgressUpdate` id union, the `INITIAL_STARTUP_MILESTONES` list in `InkApp.tsx`, and the `switch` that maps engine milestone ids to progress updates here. Adding a step means editing all three, and the UI imports the type from `bootstrap`.
5. **A second registry.** `locationNameResolver` calls `buildRegistry()` again (re-reading all content and printing the pack-loading logs) instead of using the engine's registry. If content differs or loading fails differently, the UI and engine disagree on names.
6. **No player setup.** There is no character creation step; the `Player` is the constructor default (see 10), and the seed is generated inside the engine from `Date.now()`, so runs are not reproducible (see 15).
7. **Global and implicit configuration.** Paths are `__dirname`/`cwd` based, Ollama settings are constants, and the module-level `cachedRegistry` is global mutable state.

## Rework ideas

- **Make `engineFactory` the single composition root.** It receives (or reads) a `GameConfig` and builds every collaborator: `LlmClient`, `Resolver`, `Renderer`, `PersistenceRepository`, clock, RNG, logger, content registry. `GameEngine` takes them through its constructor and builds nothing itself (see 02, 18).
- **Separate three concerns:**
  1. *Content*: `loadContent(config) -> Registry` (pure data, validated, frozen; see 09).
  2. *Game session*: `newGame(options)`, `loadGame(slot)` returning an initial `GameState`, including spellbook initialisation and reconciliation with the current content (add missing spells, drop removed ids).
  3. *Services/engine*: wiring only.
- **Move rule-level listeners into domain services** that the engine always constructs (a `ProgressionTracker`), not the factory (see 07).
- **Distinguish new game and load:** load skips blueprint generation and the LLM health check unless narration needs it; new game runs character creation, then generates (or defers) the blueprint.
- **Deterministic fallbacks are dev/test only.** Production fails startup if the LLM is down or yields no valid blueprint; `allowBlueprintFallback` (used by `buildTestGame`) enables the safe blueprint (see 15, 18).
- **Declare startup steps once** as data (`[{ id, label, run }]`), and let the UI render whatever the factory reports.
- **Return the registry (or a read-only view)** with the engine so the UI never builds its own; replace `locationNameResolver` with a lookup on that view.
- **Provide a `createTestEngine(overrides)`** variant with fake LLM, seeded RNG, in-memory persistence and a tiny registry, used by all scenario tests (see 21).
- Remove globals and add typed configuration (file or environment) with sensible defaults.

## Open questions

- Should a game session be an explicit object (`GameSession` with state, engine, services) created by `newGame`/`loadGame`, rather than "the engine owns the state"?
- Is a dependency-injection container worth it, or is a plain factory function enough for a project this size? (A plain factory is probably enough if it stays the only place that calls `new`.)
- What should happen on startup when content validation fails: refuse to start, or start with the valid part and a visible warning?

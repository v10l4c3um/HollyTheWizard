# Game Engine & Turn Loop

Files: `src/core/engine/GameEngine.ts` (273 lines), `TimeCost.ts`, `TurnResult.ts`, `Scheduler.ts` (empty, see system 17), `src/types.ts` (`IGameEngine`).

## What it does

`GameEngine` is the façade the UI talks to. It owns the live `GameState`, wires every collaborator, and exposes two operations:

- `initializeCampaignBlueprint(seed, onProgress)` runs at new-game startup: probe Ollama, generate the campaign blueprint, generate the year-1 blueprint, reporting progress through three milestones.
- `handleCommand(input): Promise<GameState>` processes one player turn.

## How a turn works

`handleCommand` (GameEngine.ts:112):

1. `resolver.resolve(input)` returns a typed command (LLM, with fallback).
2. Three commands are handled inline and return early, each ending with `checkMilestones`:
   - `ADVANCE_YEAR`: runs the `AdvanceYear` use case, appends events, renders `briefOutput`.
   - `SAVE`: persists state, emits `GameSaved`.
   - `LOAD`: replaces `this.state` with the loaded one, emits `GameLoaded`.
3. Every other command goes to `turnResolver.apply(command, state, registry)`, which returns a `TurnResult` (`briefOutput`, `events`, `timeCost`, `stateChanges`, optional `effects`).
4. The engine appends `events` to `recentEvents` and applies `stateChanges`. Only location changes and newly discovered locations are applied here.
5. If `timeCost` is `minutes`, it advances `WorldClock`, emits `TimeAdvanced`, and builds a `timePassed` record (before/after time of day).
6. `renderer.render(RenderContext)` produces the prose (LLM) and stores it in `state.output`.
7. `blueprintProgressService.checkMilestones` runs.
8. Any thrown error is caught and written to `state.output` as `Error: ...`.

The constructor builds the whole object graph itself: resolver, turn resolver, renderer, three blueprint use cases, the progress service, and a default `JsonPersistenceRepository`. Only the three Ollama configs and the persistence repository can be overridden.

## Strengths

- **Single, readable entry point.** The UI depends on the two-method `IGameEngine`, so the engine could be swapped or mocked.
- **Clear separation of decision and presentation.** The deterministic `TurnResolver` runs before the LLM renderer, and the engine is the only place the two meet.
- **Startup progress callback.** The loading screen is driven by `onProgress`, which keeps UI concerns out of the engine.
- **Fail-soft turns.** The try/catch means a bad turn never crashes the app.
- **Time handling is centralised.** One `TimeCost` union (`none` / `minutes`) and one place that advances the clock and emits `TimeAdvanced`.
- **Optional dependency override** for persistence and Ollama configs makes basic testing possible.

## Weaknesses

1. **Two sources of truth for state changes.** Effects mutate state inside `TurnResolver` via `applyEffects`, but location moves, discoveries and time are applied afterwards by the engine from `stateChanges`. `stateChanges` also declares fields (`subjectKnowledgeGains`, `attributeGains`, `spellsRevealed`, `spellsLearned`, `lessonCompleted`) that the engine never reads. This contradicts the "`applyEffects` is the only mutation path" rule.
2. **`handleCommand` is a long procedural method with four branches.** Meta commands (`SAVE`, `LOAD`, `ADVANCE_YEAR`) are special-cased with copy-pasted tails (set output, `checkMilestones`, return). Adding a command means editing the engine.
3. **Hard-wired composition.** The constructor `new`s everything, including `Resolver`, `Renderer` and `JsonPersistenceRepository`. Substituting the LLM layer or fakes requires config tricks rather than injection. The engine also imports from `infastructure` and `ai` directly, so the core depends on outer layers.
4. **`LOAD` swaps `this.state` wholesale.** Any holder of the old state reference goes stale. The bus listeners read `engine.state` lazily so they survive, but this is fragile. Startup-only work (spell initialisation, blueprint generation) is not re-validated on load, and `GameLoaded` is emitted but the progress and bus bookkeeping isn't reset.
5. **LLM latency is on every turn's critical path.** Resolver (2 calls) plus Renderer (1 call) run serially for each command, including trivial ones like `SAVE` only partly avoiding it (the resolver still runs).
6. **Errors are flattened to a string.** Failures from persistence, the resolver or the renderer all become `Error: ...` in the narration box. There is no typed failure result, no distinction between "your command was invalid" and "the system broke", and no logging.
7. **Stray debug output.** A `console.log("[TIME DEBUG] ...")` runs every turn, which can corrupt an Ink terminal UI.
8. **Context building is thin and eager.** `_buildRenderContext` reports every `knownNPCIds` as "nearby", regardless of location or time, and always passes only the last 5 events.
9. **No turn pipeline hooks.** There is no before/after seam for NPC schedules, ambient world events, or autosave. `Scheduler.ts` is an empty file and nothing in the loop would call it.
10. **State is mutated in place and returned.** `handleCommand` returns the same mutable `GameState`, so the UI cannot detect changes by reference and there is no undo or turn snapshot.
11. **Tests.** There is no engine-level test of the full turn (`src/test/` covers the resolver, renderer, persistence, blueprint and spell progression, not `GameEngine.handleCommand`).

## Rework ideas

- Make the turn a pipeline of explicit stages (`parse → decide → apply → advance time → world tick → narrate → post-checks`), each a small testable unit. The world tick stage is where the scheduler and ambient events plug in.
- Have `TurnResolver` return only `effects` (including `LocationChanged` and `TimeAdvanced` as effects) and drop the parallel `stateChanges` object, so one mutation path remains.
- Move `SAVE`, `LOAD` and `ADVANCE_YEAR` into a command-handler map (`Record<CommandType, Handler>`) so the engine does not special-case them.
- Inject collaborators (resolver, renderer, persistence, clock) through a factory or the existing `engineFactory`, and depend on ports only.
- Skip the LLM for meta commands (parse `save x` / `load x` with a rule-based fast path) and consider a rule-based first pass for common commands before calling the model.
- Return a structured `TurnOutcome { state, narration, errors, debug }` with typed error kinds.
- Remove the debug `console.log` or route it through a logger that the UI can silence.
- Add an integration test of `handleCommand` with fake resolver and renderer.

## Open questions

- Should the engine be synchronous and deterministic with narration as a separate async step, so the game can run and be tested with no LLM at all?
- Do we want immutable state snapshots per turn (undo, replay, debugging), or is in-place mutation acceptable?
- Where should autosave live: a pipeline stage or a bus listener?

# Game Engine & Turn Loop

Files: `src/core/engine/GameEngine.ts`, `TimeCost.ts`, `TurnResult.ts`, `TurnOutcome.ts`, `src/core/application/ports/Logger.ts` (implemented by `infrastructure/logging/FileLogger.ts`), `src/types.ts` (`IGameEngine`). Tests: `golden-path.test.ts`, `turn-outcome.test.ts`.

## What it does

`GameEngine` is the façade the UI talks to. It owns the live `GameState`, wires every collaborator, and exposes two operations:

- `initializeCampaignBlueprint(seed, onProgress)` runs at new-game startup: generate the campaign blueprint, then the year-1 blueprint, reporting progress through two milestones. The engine receives all collaborators through `GameEngineDeps`; `createEngine` in `engineFactory` builds them and `engineFactory` probes Ollama before calling this.
- `handleCommand(input): Promise<TurnOutcome>` processes one player turn and returns `{ state, narration, error? }`. `error.kind` is `invalid-input`, `persistence` or `internal`; `narration` is always safe to show the player.

## How a turn works

`handleCommand`:

1. `resolver.resolve(input)` returns a typed command. If the model fails or answers nonsense it is `UNKNOWN`: the turn ends with an `invalid-input` outcome, spending no time.
2. Three commands are handled inline and return early, each ending with `checkMilestones`:
   - `ADVANCE_YEAR`: runs the `AdvanceYear` use case, appends events, renders `briefOutput`.
   - `SAVE`: persists state, emits `GameSaved`. A failure is a `persistence` outcome.
   - `LOAD`: replaces `this.state` with the loaded one, emits `GameLoaded`. A failure is a `persistence` outcome and leaves the current state untouched.
3. Every other command goes to `turnResolver.apply(command, state, registry)`, which returns a `TurnResult` (`briefOutput`, `events`, `timeCost`, `stateChanges`, optional `effects`).
4. The engine appends `events` to `recentEvents` and applies `stateChanges`. Only location changes and newly discovered locations are applied here.
5. If `timeCost` is `minutes`, it advances `WorldClock`, emits `TimeAdvanced`, and builds a `timePassed` record (before/after time of day).
6. `renderer.render(RenderContext)` produces the prose (LLM) and stores it in `state.output`.
7. `blueprintProgressService.checkMilestones` runs.
8. Any other thrown error is caught, logged with its cause through the `Logger`, and returned as an `internal` outcome with the generic narration `Something went wrong.`

## Strengths

- **Single, readable entry point.** The UI depends on the two-method `IGameEngine`, so the engine could be swapped or mocked.
- **Clear separation of decision and presentation.** The deterministic `TurnResolver` runs before the LLM renderer, and the engine is the only place the two meet.
- **Startup progress callback.** The loading screen is driven by `onProgress`, which keeps UI concerns out of the engine.
- **Fail-soft, typed turns.** A bad turn never crashes the app, and the caller can tell a bad command from a broken system from the `TurnOutcome` error kind. Causes go to a log file, not the terminal.
- **Time handling is centralised.** One `TimeCost` union (`none` / `minutes`) and one place that advances the clock and emits `TimeAdvanced`.
- **Constructor injection** (`GameEngineDeps`): every collaborator is passed in, so tests can swap any of them.

## Weaknesses

1. **Two sources of truth for state changes.** Effects mutate state inside `TurnResolver` via `applyEffects`, but location moves, discoveries and time are applied afterwards by the engine from `stateChanges`. `stateChanges` also declares fields (`subjectKnowledgeGains`, `attributeGains`, `spellsRevealed`, `spellsLearned`, `lessonCompleted`) that the engine never reads. This contradicts the "`applyEffects` is the only mutation path" rule.
2. **`handleCommand` is a long procedural method with four branches.** Meta commands (`SAVE`, `LOAD`, `ADVANCE_YEAR`) are special-cased with copy-pasted tails (set output, `checkMilestones`, return). Adding a command means editing the engine.
3. **`LOAD` swaps `this.state` wholesale.** Any holder of the old state reference goes stale. The bus listeners read `engine.state` lazily so they survive, but this is fragile. Startup-only work (spell initialisation, blueprint generation) is not re-validated on load, and `GameLoaded` is emitted but the progress and bus bookkeeping isn't reset.
4. **LLM latency is on every turn's critical path.** Resolver (2 calls) plus Renderer (1 call) run serially for each command, including trivial ones like `SAVE` only partly avoiding it (the resolver still runs).
5. **No turn pipeline hooks.** There is no before/after seam for NPC schedules, ambient world events, or autosave. Presence is derived from schedules on demand (see 17), but nothing runs per turn.
6. **State is mutated in place and returned.** `TurnOutcome.state` is the same mutable `GameState` every turn, so the UI cannot detect changes by reference and there is no undo or turn snapshot.

## Rework ideas

- Make the turn a pipeline of explicit stages (`parse → decide → apply → advance time → world tick → narrate → post-checks`), each a small testable unit. The world tick stage is where the scheduler and ambient events plug in.
- Have `TurnResolver` return only `effects` (including `LocationChanged` and `TimeAdvanced` as effects) and drop the parallel `stateChanges` object, so one mutation path remains.
- Move `SAVE`, `LOAD` and `ADVANCE_YEAR` into a command-handler map (`Record<CommandType, Handler>`) so the engine does not special-case them.
- Skip the LLM for meta commands (parse `save x` / `load x` with a rule-based fast path) and consider a rule-based first pass for common commands before calling the model.

## Open questions

- Do we want immutable state snapshots per turn (undo, replay, debugging), or is in-place mutation acceptable?
- Where should autosave live: a pipeline stage or a bus listener?

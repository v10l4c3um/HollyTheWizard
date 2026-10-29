# Game Engine & Turn Loop

Files: `src/core/engine/GameEngine.ts`, `pipeline/` (`TurnPipeline.ts`, `stages.ts`, `TurnRun.ts`), `turnSteps.ts`, `WorldTick.ts` and `tick/` (rules), `Autosave.ts`, `src/core/domain/world/Boundaries.ts`, `src/core/engine/handlers/` (`types.ts`, `metaHandlers.ts`, `turnHandler.ts`, `index.ts`), `TimeCost.ts`, `TurnResult.ts`, `TurnOutcome.ts`, `src/core/application/ports/Logger.ts` (implemented by `infrastructure/logging/FileLogger.ts`), `src/types.ts` (`IGameEngine`). Tests: `golden-path.test.ts`, `turn-outcome.test.ts`.

## What it does

`GameEngine` is the façade the UI talks to. It owns the live `GameState` through a `GameSession`: only `session.replace` can swap it (`LOAD`), and `engine.state` is a getter, so callers read it fresh or use `TurnOutcome.state` and hands every turn to the `TurnPipeline`. What each command does lives in a command-handler map, not in the engine. It exposes two operations:

- `initializeCampaignBlueprint(seed, onProgress)` runs at new-game startup: generate the campaign blueprint, then the year-1 blueprint, reporting progress through two milestones. The engine receives all collaborators through `GameEngineDeps`; `createEngine` in `engineFactory` builds them and `engineFactory` probes Ollama before calling this.
- `handleCommand(input): Promise<TurnOutcome>` processes one player turn and returns `{ state, narration, error? }`. `error.kind` is `invalid-input`, `persistence` or `internal`; `narration` is always safe to show the player.

## How a turn works

`TurnPipeline.run(input)` is the whole turn, as an explicit list of stages (`pipeline/stages.ts`) that share one `TurnRun`:

```
parse → [ decide → advance time → announce → world tick → narrate → post-checks ] → commit → autosave
```

- **Parse.** `resolver.resolve(input, worldView)` returns a typed command (the fast path handles `save`, `load` and `undo`; everything else is grounded in a `WorldView` built from the committed state, see 03). If the model fails or answers nonsense it is `UNKNOWN`. Nothing touches the game state yet.
- **The turn is a transaction.** `GameSession.begin()` clones the committed state and the clone is the live state for the stages; handlers, the tick and the bus listeners all read it fresh, so they write into the clone. Success ends in `commit()`; a stage that fails (sets `run.error`) or throws ends in `rollback()`, and the untouched state is live again. Later stages do not run.
- **Decide.** `runCommand` looks up the handler for `command.type` in the `CommandHandlerMap` (typed, so the compiler requires an entry for every command) and runs it with the `GameSession`. A handler returns one of:
  - `narrate { briefOutput, turn? }`: the engine renders it with the LLM narrator. `turn` is an in-world rule's `TurnResult`.
  - `say { text }`: the engine shows that exact text.
  - `fail { error }`: a typed failure (`invalid-input`, `persistence`).

  The handlers (`createCommandHandlers`, built in `createEngine`):
  - `MOVE TALK STUDY ATTEND_CLASS PRACTICE INTERACT REST` share one turn handler: `turnResolver.decide(command, state, registry)` returns a `TurnResult` (`briefOutput`, `facts`, `timeCost`, `effects`). `decide` applies the rule's own effects and the fact log, all through `applyEffects`; it does not move the clock.
  - `ADVANCE_YEAR` runs the `AdvanceYear` use case and narrates the result (the use case records its own event).
  - `SAVE` persists the state and emits `GameSaved`. `LOAD` loads the save on the side, checks it (strict format, then places, spells, characters and story blueprints against the registry) and only then calls `GameSession.replace`, so a refused load changes nothing; it then emits `GameLoaded`. Persistence and invalid-save errors are `fail` results with a precise message.
  - `UNDO` calls `session.undo()` (up to 20 turns back, cleared by `LOAD`): the whole earlier state is restored. Nothing to undo is an `invalid-input` failure. Events already emitted on the bus are not taken back.
  - `UNKNOWN` fails as `invalid-input`, spending no time.
- **Advance time.** An in-world turn's time cost becomes a `TimeAdvanced` effect, and `timePassed` is recorded.
- **Announce.** The rule's `emits` go out on the bus in order, then `ActionResolved`, after the clock has moved: a listener sees the finished turn.
- **World tick.** Unless a `LOAD` replaced the state, `WorldTick.run(from, to)` walks every period/day boundary the clock crossed, so a long rest is handled boundary by boundary. The rules emit `PeriodChanged` / `DayStarted`, flag missed classes (`LessonSkipped` plus a notice, no penalty yet) and expire scene invitations; their effects go through `applyEffects`. The notices reach the narrator.
- **Narrate.** `fail` never gets here. `say` stores the text (plus tick notices); `narrate` renders it from a `RenderContext` built by `buildRenderContext`. The stage writes `state.output` and no other game state.
- **Post-checks.** `blueprintProgressService.checkMilestones` runs. For in-world commands the turn is then recorded (`TurnRecorded`: input, command, where the player stood) so the next sentence can say "again" or "ask her". Then the session commits.
- **Autosave.** If a calendar day began during the turn, `Autosave` writes the `autosave` slot after the turn is final. A failure is logged, never shown.
- Any thrown error rolls the turn back, is caught, logged with its cause through the `Logger`, and returned as an `internal` outcome with the generic narration `Something went wrong.`

**Adding behaviour.** Something that happens because time passes (an NPC doing something off-screen, a timed event, a curfew) is a new `TickRule` in `tick/rules.ts`: it gets the boundary crossed and returns effects and notices. Something that is a new step of every turn is a new `TurnStage` in `createStages`. Neither changes the engine.

## Strengths

- **Single, readable entry point.** The UI depends on the two-method `IGameEngine`, so the engine could be swapped or mocked.
- **Clear separation of decision and presentation.** The deterministic `TurnResolver` runs before the LLM renderer, and the engine is the only place the two meet.
- **Startup progress callback.** The loading screen is driven by `onProgress`, which keeps UI concerns out of the engine.
- **Commands are data, not branches; the turn is a list.** A typed handler map plus one pipeline of named stages: adding a command means adding a handler, adding a step means adding a stage, and the engine has no per-command code.
- **A world tick that handles long rests.** Rules run per boundary crossed, from the boundary's own day and period, and change state only through effects. Adding behaviour that depends on time is a new rule, not an engine change.
- **Turns are transactions.** The returned `TurnOutcome.state` is a new object after every successful turn (earlier ones are untouched snapshots), a failed or crashed turn leaves the state exactly as it was, and `undo` falls out of the history.
- **Atomic, validated load.** A save is loaded, validated and only then swapped in; a refused load leaves the running game as it was.
- **One mutation path.** Turn state changes are effects applied by `applyEffects`; the engine only resolves, renders and reports.
- **Fail-soft, typed turns.** A bad turn never crashes the app, and the caller can tell a bad command from a broken system from the `TurnOutcome` error kind. Causes go to a log file, not the terminal.
- **Time handling is centralised.** One `TimeCost` union (`none` / `minutes`) and one place that advances the clock and emits `TimeAdvanced`.
- **Constructor injection** (`GameEngineDeps`): every collaborator is passed in, so tests can swap any of them.

## Weaknesses

1. **LLM latency is on every in-world turn's critical path.** Every in-world command makes one resolver call (a second only when a target is ambiguous) and one renderer call, about 0.8 s each on the 4B model. Only `save`, `load`, `undo` and the follow-ups `again` / `go back` are parsed without the model.

## Rework ideas

- Extend the rule-based fast path (done for `save`/`load`) to common in-world commands (`rest`, `go to <place>`) before calling the model.

## Open questions

- Persist the undo history (or an effect journal for replay) in saves?
- Is cloning the whole state each turn still cheap once inventories, items and long histories exist? If not, move to structural sharing.

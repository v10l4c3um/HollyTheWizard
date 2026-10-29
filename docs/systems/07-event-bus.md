# Event Bus

Files: `src/core/engine/EventBus.ts` (18 lines, `TypedBus`), `src/core/domain/events/GameEvents.ts` (event catalog + `createGameBus`). Listeners: `src/bootstrap/engineFactory.ts`. No dedicated tests.

## What it does

A synchronous, in-process publish/subscribe channel for "something happened" notifications. The design rule is: effects mutate state, events notify, and observers react by setting flags or producing follow-up effects.

## How it works

- `TypedBus<E>` stores handlers per event type. `on` and `off` add or remove one, and `emit` calls every handler in registration order, synchronously.
- `GameEvents` declares 26 event types with typed payloads (spells, lessons, locations, conversations, time, save/load, year, blueprint).
- One bus is created in `engineFactory` and shared with the engine, `TurnResolver`, the blueprint use cases and `applyEffects`.
- Emitters are scattered: `TurnResolver` (most), `GameEngine` (`TimeAdvanced`, `GameSaved`, `GameLoaded`), and the blueprint use cases (`BlueprintGenerated`, `YearAdvanced`, `BlueprintMilestoneReached`).

## Current usage (what is actually wired)

Listeners exist in exactly one place: `engineFactory` registers four.

| Event | Listener effect |
|---|---|
| `LessonAttended` | Pushes `lesson_completed:<subject>:<lesson>` to `questFlags.active` |
| `LocationDiscovered` | Pushes `discovered:<location>` to `questFlags.active` |
| `SpellRevealed` | Pushes `spell_revealed:<spell>` to `questFlags.active` |
| `SpellMastered` | Pushes `mastered:<spell>` to `questFlags.completed` |

Those flags are what `BlueprintProgressService` checks to complete story milestones, so **the bus is the only link between player actions and campaign progress.** The world tick also emits `PeriodChanged` and `DayStarted` at each boundary, and `LessonSkipped` for a missed class (none has a subscriber yet). Every other event (conversation, topic, boundary, reveal, practice, study, time, `ActionResolved`, ...) has no subscriber. Six declared events are never emitted at all: `SpellLearned`, `LessonSkipped`, `AttributeGained` (deprecated), `QuestFlagSet`, `QuestActivated`, `QuestCompleted`.

## Strengths

- **Typed end to end.** Event names and payloads are checked by the compiler, so a wrong payload does not compile.
- **Minimal and dependency-free.** Eighteen lines, easy to reason about, and trivial to replace.
- **Decouples producers from consumers.** `TurnResolver` does not know about quest flags or milestones, and the blueprint system can react to gameplay without being called by it.
- **Good extension seam in intent.** `ActionResolved` is a sensible generic hook for achievements, rumors and analytics.
- **Cause events carry deltas, not totals** (documented), which keeps them honest.
- **Synchronous order is predictable,** which makes the current flow easy to follow.

## Weaknesses

1. **Core progression depends on wiring outside the engine.** The four listeners that drive campaign milestones live in `engineFactory`, not in `GameEngine` or a domain service. A `GameEngine` built another way (tests, a different entry point, a future server) silently loses milestone progress. The engine-factory test is the only coverage.
2. **Mostly a log with no readers.** Of ~20 emitted event types, 16 have zero subscribers. The architecture promises reactive systems (rumors, achievements, suspicion) that do not exist, and the bus adds ceremony without behavior. Six declared events are dead.
3. **Events carry state-shaped meaning without a guarantee of ordering.** For example `LocationVisited` is emitted by `TurnResolver` before the engine updates `currentLocationId` (see 04). A listener that reads state sees the previous state. `emit` happens mid-resolution, not after the turn commits.
4. **Listeners mutate state directly,** which contradicts "events notify, effects mutate". The four wired listeners push into `questFlags` by hand rather than returning effects, so they bypass the one sanctioned mutation path.
5. **Synchronous and unguarded.** `emit` does not catch handler exceptions, so one faulty listener aborts the emitting handler mid-turn (the engine's outer `catch` then reports a generic error). There is no way to emit from inside a handler safely, no re-entrancy guard, no ordering/priority, and no async handlers.
6. **Duplicate and inconsistent emissions.** `GameSaved` and `GameLoaded` can be emitted by both `TurnResolver` and `GameEngine` (the former is dead code today). The event set mixes granularities (`SubjectStudied` and `SpellPracticed` next to `ActionResolved`), and the same fact is announced by several events (`NpcTalkedTo`, `TopicDiscussed`, `ConversationResolved`, `RevealTriggered` all fire for one talk).
7. **Event data leaks identity strings.** Payload ids are untyped strings, and `ConversationResolved.result` repeats the conversation result union by hand instead of importing it.
8. **No registry of subscriptions or teardown.** `off` needs the original function reference, handlers are never removed, and `LOAD` replaces `engine.state` while listeners keep working only because they read `engine.state` lazily.
9. **Hard to observe.** There is no wildcard subscription or event log, so debugging "what fired this turn?" means reading code. The `TurnResult.events` strings and the bus events are two separate, unrelated records of the same turn.
10. **Placement.** `TypedBus` lives in `core/engine/` while `GameEvents.ts` (domain) imports it, so the domain layer depends on the engine layer.
11. **No tests** for the bus or for listener behavior.

## Rework ideas

- **Decide what the bus is for.** Either make it the real extension mechanism (named subscribers registered in the domain, e.g. a `ProgressionTracker` that owns the flag listeners and is created by the engine), or reduce it. A good middle path: keep it for decoupled, side-effect-free observers, and move required game logic into explicit pipeline stages.
- **Move the four quest-flag listeners into a domain service** that the engine always constructs. They should return effects (e.g. `FlagSet` or a `QuestFlagSet` effect) applied through `applyEffects`.
- **Emit after commit.** Collect events during a turn and publish them once the effects have been applied (a per-turn outbox), so listeners always see consistent state, and so a failed turn emits nothing.
- **Derive events from effects** where possible (see 06), and make handlers return facts, so events are not hand-emitted at five call sites.
- **Harden delivery:** catch and log listener errors, add `once`, and add an `onAny` tap. Dev builds can record the event stream per turn.
- **Prune the catalog:** delete never-emitted events (or implement the quest system they belong to), merge overlapping conversation events, and use one source for shared union types.
- **Unify the two records of a turn** (`TurnResult.events` strings and bus events) into a single structured event log that feeds `recentEvents`, narration facts and listeners.
- **Test:** bus ordering and error isolation, and each wired listener.

## Open questions

- Is the long-term plan a rich reactive world (rumors, suspicion, achievements, NPC memory driven by events), or a simpler linear pipeline? The bus only earns its place in the first.
- Should events be persisted in the save (an event-sourced history), or are they transient notifications?
- Where should story progress be computed: from flags set by bus listeners, or by `BlueprintProgressService` reading state directly?

# Effect System

Files: `src/core/domain/effects/GameEffects.ts` (179 lines), `EffectApplier.ts` (140). Callers: `TurnResolver` (3 call sites), `evaluateConversation` (produces effects). No dedicated tests (`src/test/` has none for effects).

## What it does

Defines the vocabulary of state changes (`GameEffect`) and the single function that applies them (`applyEffects(state, effects, bus?)`). It is meant to be the only path by which game state changes, so every change is a named, inspectable value with a `reason`.

## How it works

`GameEffect` is a discriminated union of 18 types:

| Effect | Applied as |
|---|---|
| `ProgressDelta` | Parses `track`; only `subject.<id>.knowledge` is handled (adds to `academicState`). Any other track is logged as a warning and does nothing |
| `AttributeDelta` / `ResourceDelta` | `player.attributes/resources.applyDelta` |
| `RelationshipDelta` | `state.relationships[npcId]?.applyDelta` |
| `FlagSet` | `state.flags[id] = value` |
| `QuestFlagSet` | Adds a story flag to `questFlags.active` or `.completed`, once (what milestones check; set by `ProgressionTracker`, see 07) |
| `InventoryDelta` | Adds to or removes from `inventory.items`, creating a nameless `Item` for new ids |
| `TopicUnlocked` | Pushes to `unlockedTopicsByNpc` if absent |
| `ClueRevealed` / `RumorLearned` | Writes a record into `clues` / `rumors` |
| `SceneInvitationCreated` | Pushes to `sceneInvitations` |
| `ConversationMemoryRecorded` | Appends to `conversationHistory[npcId]`, capped at 20 |
| `LocationChanged` | Sets `currentLocationId` and marks the place discovered |
| `TimeAdvanced` | Advances the `WorldClock` and emits the `TimeAdvanced` bus event |
| `FactsRecorded` | Appends to `recentFacts`, keeping the last 20 |
| `SpellRevealed` | `hidden` → `available` only; never downgrades |
| `SpellStateUpdated` | Replaces a spell's state with the result of `applySpellUse` |
| `LessonAdvanced` | Records the lesson as attended/skipped and moves to the next |

Helper constructors (`progressDelta`, `flagSet`, ...) and track-name helpers (`subjectKnowledgeTrack`, `spellProficiencyTrack`) build the values. `applyEffects` is a loop over a `switch`.

## Strengths

- **The idea is right.** State changes as data give auditability, easy logging and testing, and a path to replay, undo and save-diff. The `reason` field is a good habit.
- **Typed and exhaustive.** A discriminated union with one `switch` means the compiler can enforce that every effect type is handled (if a `never` check is added; see below).
- **Simple and readable.** About 140 lines of applier with no hidden machinery.
- **Domain-shaped effects.** Social effects (`TopicUnlocked`, `ClueRevealed`, `SceneInvitationCreated`) express content rules directly, so the conversation evaluator can stay pure and just return a list.
- **Idempotent where it matters** (topic unlocks do not duplicate), and conversation memory is bounded.
- **Used by the pure `evaluateConversation`,** which is the best-designed part of the pipeline: rules in, effects out.

## Weaknesses

1. **The single mutation path still has gaps.** Outside effects: `state.output` (the narrate stage and the failure path), `AdvanceYear`'s blueprint and year writes, the blueprint set at startup, and the spellbook seeding in `wireEngine`. `ProgressDelta` for spells (`spellProficiencyTrack`) is not wired.
2. **`bus` is barely used.** `applyEffects` only emits `TimeAdvanced`. The doc comment promises "derived milestone" events when a change crosses a threshold, and none fire.
3. **`reason` is write-only.** It is never stored, logged or surfaced. `applyEffects` returns `void`, so callers cannot get a record of what changed, old and new values, or rejected effects. The `TurnResult.effects` list is the intended carrier, but only the requested effects are passed, not the applied results.
4. **Silent failures.** An unknown progress track only warns, an unknown subject id is ignored, a negative inventory goes through a removal rule, and unknown flag ids are just written. Nothing validates ids against the `Registry`, and no effect can report failure.
5. **Stringly-typed tracks.** `track: string` parsed by regex (`subject.<id>.knowledge`) is brittle: a typo compiles and then warns at runtime. A typed union (`{ target: "subject", id, field }`) would be safer.
6. **No clamping or invariants at the applier.** Bounds (relationship axes -100..100, resources) depend on each `applyDelta` implementation. `ProgressDelta` can push knowledge above any cap or below zero. `FlagSet` accepts any key and has no namespace, so flags are a global untyped bag.
7. **No exhaustiveness check.** `applyEffect`'s `switch` has no `default: never`, so adding an effect type that nobody handles fails silently.
8. **Inventory creates ghost items.** A new item is built as `new Item(itemId, itemId, "", delta)` (name equals id, empty description) rather than from the registry's item definition.
9. **Mixed responsibilities.** `ConversationMemoryRecorded` has no `reason`, unlike every other effect.
10. **Tests cover only some effects** (`effects-mutation.test.ts`: facts, quest flags, time, location). The silent-failure paths (unknown track, unknown subject, ghost items) and clamping have none.

## Rework ideas

- **Finish the invariant.** Add effects for `LocationChanged`, `TimeAdvanced`, `LessonAdvanced`, `SpellStateChanged`/`SpellProficiencyDelta`, `EventLogged`, and `DiscoveredLocation`. Then turn handlers return only effects, and the engine applies them (see 02 and 04).
- **Fix relationships first.** Create the record on first contact (in `GameState` or the applier), rehydrate on load, and add a test that talking to an NPC changes trust.
- **Return an application report** from `applyEffects`: `{ applied, skipped, changes: [{ effect, before, after }] }`. Use it for the effects summary, the debug log, the narration facts (see 05), and tests.
- **Derive events from the report,** not from handlers, so notification is consistent and the `bus` parameter has a purpose.
- **Replace string tracks with typed targets,** and validate ids against the `Registry`. Unknown ids become explicit failures.
- **Add a `never` exhaustiveness check** and a unit test per effect type.
- **Centralize bounds** in the applier or the stat classes, with one documented place.
- **Namespaced, typed flags,** or promote the important ones (e.g. `questFlags`) into dedicated effects.
- Consider a **pure reducer form** `(state, effect) => state` (or Immer-style drafts). This enables undo, per-turn snapshots, replay from a log, and deterministic tests, and fits the idea of storing an effect log in the save file.

## Open questions

- Should the effect log become a first-class record (saved with the game as a journal), or stay transient?
- Do we want a reducer/immutable state model, or keep mutation behind `applyEffects`?
- Who owns validation: the effect constructors, the applier, or the handlers?

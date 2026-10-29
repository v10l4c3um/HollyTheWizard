# Turn Resolver & Commands

Files: `src/core/engine/TurnResolver.ts` (657 lines), `TurnResult.ts`, `TimeCost.ts`, `src/core/domain/commands/CommandDefinitions.ts` (the `Command` type). Collaborators: `CurriculumService`, `SpellRevealService`, `SpellProgressionService`, `evaluateConversation`, `applyEffects`, `GameBus`.

## What it does

The deterministic rules layer. Given a typed `Command`, the current `GameState` and the `Registry`, it decides what happens and returns a `TurnResult` (`briefOutput`, `events`, `timeCost`, `effects`, `timePassed`). It makes no LLM calls and does no I/O. Every state change, including location, clock and event log, is applied through `applyEffects` inside `apply`; the engine then renders the prose around `briefOutput`.

## How it works

`apply()` calls `_dispatch()` (a `switch` on `command.type`), then emits an `ActionResolved` bus event. Outcome is `"failure"` when `events` is empty and `timeCost` is `none`, otherwise `"success"`.

| Command | Behavior | Time |
|---|---|---|
| `MOVE` | Validates the destination exists, is connected and has been discovered; arriving marks it visited and discovers its exits; emits `LocationVisited`/`LocationDiscovered`; applies a `LocationChanged` effect (which also marks the place discovered) | 5 min (2 min on a blocked move) |
| `TALK` | Builds a `ConversationContext` (relationship or zeroed stats, topic, NPC profile, history, last 10 events, privacy), calls `evaluateConversation`, applies its effects, emits five conversation events | 15 min |
| `STUDY` | `ProgressDelta` of `10 * hours` to subject knowledge; checks spell availability; emits `SubjectStudied`/`SpellRevealed` | 60 min per hour |
| `ATTEND_CLASS` | Fetches current lesson, applies lesson rewards as effects, rolls each lesson's spell-reveal opportunity, advances the lesson counter, emits `LessonAttended` | fixed 60 min |
| `PRACTICE` | Requires a learned spell; runs 10 attempts per hour through `applySpellUse` using `Math.random`; writes the spell state straight into the spellbook | 60 min per hour |
| `INTERACT` | Finds the item in inventory and returns "Something happened!" | 10 min |
| `REST` | Returns flavor text | 60 min per hour |
| `SAVE`/`LOAD` | Emits `GameSaved`/`GameLoaded` and returns a message | none |
| `ADVANCE_YEAR` | Empty guard result | none |

## Strengths

- **Genuinely deterministic and LLM-free**, so the rules layer is unit-testable in isolation, apart from one `Math.random` call.
- **Clear contract.** Every handler returns the same `TurnResult` shape, so the engine and renderer stay generic.
- **Mostly effect-based.** `STUDY`, `ATTEND_CLASS` and `TALK` express their changes as `GameEffect[]` with a `reason` string, which gives an audit trail.
- **Conversation outcomes come from rules,** with the LLM only voicing them. The context passed to the evaluator is rich (profile, history, privacy, recent events).
- **Time cost is data,** not a side effect.
- **Failure paths are explicit.** Most invalid inputs return a clear message at `timeCost: none`.
- **Spell mastery is detected from an actual state transition,** not announced unconditionally.

## Weaknesses

1. **One 650-line class mixes everything.** Each command is a method on one class, with string building, rule logic, event emission and effect construction inline. The result is hard to extend or test per command, and it will not scale to dueling, quests or scenes.
2. **Events are emitted before the outcome is final.** `MOVE` emits `LocationVisited` / `LocationDiscovered` before the engine sets the location. Listeners see the event while state is still the old state. The event-then-state ordering is accidental.
3. **Dead or duplicated code.** `_save`, `_load`, and the `ADVANCE_YEAR` branch are unreachable in practice, since the engine handles them first. The comment says so, and they still emit `GameSaved`/`GameLoaded`, which would double-emit if ever reached.
4. **Rules are shallow.**
   - `REST` changes nothing (no energy, health or mana), though the text says "You feel refreshed!".
   - `INTERACT` is a stub that always succeeds.
   - `STUDY` has no cost (energy), diminishing returns, location or time-of-day requirement, and validates nothing: `subjectId` is cast to `SubjectType`, and an unknown subject quietly creates a progress track.
   - `ATTEND_CLASS` ignores the timetable, location, time of day, and the `duration` argument (always 60 minutes). The player can attend any class anywhere at any hour, and repeatedly in a row.
   - `PRACTICE` has no mana, energy or backfire effect even though `SpellBalance` defines `manaCost` and `backfireRisk`, and ignores `castCondition`.
   - `MOVE` has no travel-time variation, locked doors, curfew or ownership.
5. **`TALK` does not check that the NPC exists or is present.** An unknown id falls through to a zeroed relationship and uses the id as the name, and any known NPC can be talked to from anywhere. The `knownNPCIds` list is used for "nearby" in the render context, so presence is not modeled at all (no scheduler, see system 17).
6. **Hacky privacy rule.** `isPrivateLocation` does substring matching on the location id (`"study"`, `"room"`, `"garden"`). It misclassifies (any id containing "room", "study", or "office"; a public garden counts as private) and should be a property of the `Location` data.
7. **Hidden randomness.** `Math.random()` in `PRACTICE` is not seeded or injectable, so results cannot be reproduced for tests, replays or bug reports. The other systems in the project advertise determinism.
8. **Fragile success detection.** `ActionResolved` outcome is inferred from `events.length === 0 && timeCost none`. A blocked `MOVE` has events and a time cost, so it is reported as a success. The turn result should carry the outcome explicitly.
9. **Messages and prose live in rules code.** Output strings such as "Something happened!" and `buildConversationOutput` are embedded in the logic, which blocks localization and makes it hard for the renderer to receive structured facts rather than a sentence it must paraphrase.
10. **`events` are English strings.** `Talked to ${npcId} about ...` then feeds `recentEvents`, which feeds conversation mood modifiers and the render prompt. Structured data is lost; later systems must parse text.
11. **Per-turn services are built in the constructor** with no injection, so tests cannot substitute a fake reveal service or RNG.
12. **No tests.** `TurnResolver` has no test file; the rules most important to the game are untested.

## Rework ideas

- Split into **per-command handlers** (`handlers/move.ts`, `talk.ts`, ...) behind a registry keyed by command type. A handler receives a read-only world view and returns `{ effects, events, time, facts }`.
- Emit events **after** effects are applied, derived from the effects or from a post-apply step, so listeners always see consistent state.
- Return an explicit `outcome` (`success | failure | blocked`) and a typed `reason`, not a heuristic.
- Add **preconditions** as data: location, time window, timetable, required energy or mana, NPC presence. Failures return the reason to the renderer.
- Give `REST`, `STUDY` and `PRACTICE` real **resource effects** (energy, mana, health), and use the existing spell balance fields.
- Inject a **seeded RNG** and use it for practice, reveals and conversations.
- Move privacy, travel time and similar facts onto `Location` data.
- Return **structured facts** (`{ kind: "conversation", npc, result, tags }`) for the renderer, with deterministic fallback strings generated in a separate presentation module.
- Delete the dead `SAVE`/`LOAD`/`ADVANCE_YEAR` code, or move those commands out of `Command` into a separate "meta command" type.
- Add per-handler unit tests with a fake state and fixed seed.

## Open questions

- How deep should the sim go: stay a light "school life" loop, or add real constraints (schedules, energy, curfew, presence)?
- Should the turn unit stay "one command, one fixed duration", or become a time-slot model (morning, class, evening) where choices fill slots?
- Is `INTERACT` meant to become a real item-use system? If so, it needs an item effect model before anything else.

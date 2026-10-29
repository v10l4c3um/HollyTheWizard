# Turn Resolver & Commands

Files: `src/core/engine/TurnResolver.ts` (~780 lines), `TurnResult.ts`, `TimeCost.ts`, `src/core/domain/commands/CommandDefinitions.ts` (the `Command` type). Collaborators: `CurriculumService`, `SpellRevealService`, `SpellProgressionService`, `evaluateConversation`, `applyEffects`, `GameBus`.

## What it does

The deterministic rules layer. Given a typed `Command`, the current `GameState` and the `Registry`, it decides what happens and returns a `TurnResult` (`briefOutput`, `events`, `timeCost`, `effects`, `timePassed`). It makes no LLM calls and does no I/O. Every state change, including location, clock and event log, is applied through `applyEffects` inside `apply`; the engine then renders the prose around `briefOutput`.

## How it works

`apply(command, state, registry)` takes only the seven in-world commands (`InWorldCommand`; the meta commands `SAVE`, `LOAD`, `UNDO`, `ADVANCE_YEAR` and `UNKNOWN` never get here, the type enforces it). It makes one `Random` for the turn (a seeded one resumed from `GameState.randomState`, or an injected one), runs `_dispatch()` (an exhaustive `switch`), applies the turn bookkeeping as effects (event log, clock, the new random state), and emits `ActionResolved` with the outcome the rule itself stated: `success`, `blocked` (tried, did not work, time passed, such as a move to an unconnected place) or `failure` (not a valid request, no time). Whether a place is private comes from the `Location` data.

| Command | Behavior | Time |
|---|---|---|
| `MOVE` | Validates the destination exists, is connected and has been discovered; arriving marks it visited and discovers its exits; emits `LocationVisited`/`LocationDiscovered`; applies a `LocationChanged` effect (which also marks the place discovered) | 5 min (2 min on a blocked move) |
| `TALK` | Refused (no time) unless the NPC exists and is in the player's place; builds a `ConversationContext` (relationship or zeroed stats, topic, NPC profile, history, last 10 events, privacy), calls `evaluateConversation`, applies its effects, emits five conversation events | 15 min |
| `STUDY` | `ProgressDelta` of `10 * hours` to subject knowledge; checks spell availability; emits `SubjectStudied`/`SpellRevealed` | 60 min per hour |
| `ATTEND_CLASS` | Only in the class's timetabled period and place, once per slot (flag `attended.<subject>.<day>.<period>`); fetches current lesson, applies lesson rewards as effects, rolls each lesson's spell-reveal opportunity, advances the lesson counter, emits `LessonAttended` | fixed 60 min |
| `PRACTICE` | Requires a learned spell; runs 10 attempts per hour through `applySpellUse` using `Math.random`; writes the spell state straight into the spellbook | 60 min per hour |
| `INTERACT` | Finds the item in inventory and returns "Something happened!" | 10 min |
| `REST` | Returns flavor text | 60 min per hour |

## Strengths

- **Genuinely deterministic and LLM-free**, so the rules layer is unit-testable in isolation. Chance comes from a seeded `Random` whose state is saved, so the same state and commands always play out the same.
- **Clear contract.** Every handler returns the same `TurnResult` shape, so the engine and renderer stay generic.
- **Mostly effect-based.** `STUDY`, `ATTEND_CLASS` and `TALK` express their changes as `GameEffect[]` with a `reason` string, which gives an audit trail.
- **Conversation outcomes come from rules,** with the LLM only voicing them. The context passed to the evaluator is rich (profile, history, privacy, recent events).
- **Time cost is data,** not a side effect.
- **Failure paths are explicit.** Most invalid inputs return a clear message at `timeCost: none`.
- **Spell mastery is detected from an actual state transition,** not announced unconditionally.

## Weaknesses

1. **One 780-line class mixes everything.** Each command is a method on one class, with string building, rule logic, event emission and effect construction inline. The result is hard to extend or test per command, and it will not scale to dueling, quests or scenes.
2. **Events are emitted before the turn's bookkeeping.** Handlers apply their own effects and then emit their events, but the clock advance and the event log are applied after dispatch, so a listener to `LocationVisited` or `LessonAttended` still sees the old time.
3. **Rules are shallow.**
   - `REST` changes nothing (no energy, health or mana), though the text says "You feel refreshed!".
   - `INTERACT` is a stub that always succeeds ("Something happened!").
   - `STUDY` has no cost (energy), diminishing returns, location or time-of-day requirement, and does not check the subject: an unknown one takes the time and reports gains that are never applied.
   - `ATTEND_CLASS` ignores the `duration` argument (always 60 minutes).
   - `PRACTICE` has no mana, energy or backfire effect even though `SpellBalance` defines `manaCost` and `backfireRisk`, and ignores `castCondition`.
   - `MOVE` has no travel-time variation, locked doors, curfew or ownership.
4. **Messages and prose live in rules code.** Output strings such as "Something happened!" and `buildConversationOutput` are embedded in the logic, which blocks localization and makes it hard for the renderer to receive structured facts rather than a sentence it must paraphrase.
5. **`events` are English strings.** `Talked to ${npcId} about ...` then feeds `recentEvents`, which feeds conversation mood modifiers and the render prompt. Structured data is lost; later systems must parse text.

## Rework ideas

- Split into **per-command handlers** (`handlers/move.ts`, `talk.ts`, ...) behind a registry keyed by command type. A handler receives a read-only world view and returns `{ effects, events, time, facts }`.
- Emit events **after** effects are applied, derived from the effects or from a post-apply step, so listeners always see consistent state.
- Give the explicit `outcome` a typed `reason` too (why it was blocked or refused).
- Add **preconditions** as data: location, time window, required energy or mana (the timetable and NPC presence are checked in code today). Failures return the reason to the renderer.
- Give `REST`, `STUDY` and `PRACTICE` real **resource effects** (energy, mana, health), and use the existing spell balance fields.
- - Move travel time and similar facts onto `Location` data (privacy already is).
- Return **structured facts** (`{ kind: "conversation", npc, result, tags }`) for the renderer, with deterministic fallback strings generated in a separate presentation module.
- - Add per-handler unit tests with a fake state and fixed seed.

## Open questions

- How deep should the sim go: stay a light "school life" loop, or add real constraints (schedules, energy, curfew, presence)?
- Should the turn unit stay "one command, one fixed duration", or become a time-slot model (morning, class, evening) where choices fill slots?
- Is `INTERACT` meant to become a real item-use system? If so, it needs an item effect model before anything else.

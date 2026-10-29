# Turn Resolver & Commands

Files: `src/core/engine/TurnResolver.ts` (the pipeline, ~100 lines), `src/core/engine/rules/` (one file per command plus `context.ts`, `results.ts`, `index.ts`), `TurnResult.ts`, `TimeCost.ts`, `src/core/domain/commands/CommandDefinitions.ts` (the `Command` type). Tests: `turn-rules.test.ts`, `turn-event-order.test.ts`, `turn-resolver.test.ts` and the scenario suites. Collaborators: `CurriculumService`, `SpellRevealService`, `SpellProgressionService`, `evaluateConversation`, `applyEffects`, `GameBus`.

## What it does

The deterministic rules layer. Given a typed `Command`, the current `GameState` and the `Registry`, it decides what happens and returns a `TurnResult` (`briefOutput`, `events`, `timeCost`, `effects`, `timePassed`). It makes no LLM calls and does no I/O. Every state change, including location, clock and event log, is applied through `applyEffects` inside `apply`; the engine then renders the prose around `briefOutput`.

## How it works

`apply(command, state, registry)` takes only the seven in-world commands (`InWorldCommand`; the meta commands never get here, the type enforces it) and is a short pipeline:

1. It makes one `Random` for the turn (a seeded one resumed from `GameState.randomState`, or an injected one) and a `TurnContext` (state, registry, random, services, and an `apply(effects)` that runs `applyEffects`). A rule has no bus.
2. It runs the rule for the command, `turnRules[command.type]` (`rules/index.ts`, a registry typed over the in-world commands, so a new command without a rule does not compile). A rule is a plain function `(command, ctx) => TurnResult`: it checks, applies the effects later steps depend on, and returns the text, the log entry, the time cost, the effects and the events it wants announced (`emits`). It states its own `outcome`: `success`, `blocked` (tried, did not work, time passed, such as a move to an unconnected place) or `failure` (not a valid request, no time).
3. It applies the bookkeeping every turn shares as effects: the event log, the clock, the new random state.
4. Only then does it emit the rule's `emits` on the bus, in order, and `ActionResolved`. A listener therefore sees the finished turn (clock advanced, log written), not a half-done one.

Whether a place is private comes from the `Location` data.

| Command | Behavior | Time |
|---|---|---|
| `MOVE` | Validates the destination exists, is connected and has been discovered; arriving marks it visited and discovers its exits; emits `LocationVisited`/`LocationDiscovered`; applies a `LocationChanged` effect (which also marks the place discovered) | 5 min (2 min on a blocked move) |
| `TALK` | Refused (no time) unless the NPC exists and is in the player's place; builds a `ConversationContext` (relationship or zeroed stats, topic, NPC profile, history, last 10 events, privacy), calls `evaluateConversation`, applies its effects, emits five conversation events | 15 min |
| `STUDY` | `ProgressDelta` of `10 * hours` to subject knowledge; checks spell availability; emits `SubjectStudied`/`SpellRevealed` | 60 min per hour |
| `ATTEND_CLASS` | Only in the class's timetabled period and place, once per slot (flag `attended.<subject>.<day>.<period>`); fetches current lesson, applies lesson rewards as effects, rolls each lesson's spell-reveal opportunity, advances the lesson counter, emits `LessonAttended` | fixed 60 min |
| `PRACTICE` | Requires a learned spell; runs 10 attempts per hour through `applySpellUse` using the turn's seeded `Random`; writes the spell state with a `SpellStateUpdated` effect | 60 min per hour |
| `INTERACT` | Finds the item in inventory and returns "Something happened!" | 10 min |
| `REST` | Returns flavor text | 60 min per hour |

## Strengths

- **One small rule per command,** a plain function over a `TurnContext` that has no bus: each can be tested with a fake state and a fixed `Random`, and a new in-world command without a rule does not compile.
- **Genuinely deterministic and LLM-free**, so the rules layer is unit-testable in isolation. Chance comes from a seeded `Random` whose state is saved, so the same state and commands always play out the same.
- **Clear contract.** Every handler returns the same `TurnResult` shape, so the engine and renderer stay generic.
- **Mostly effect-based.** `STUDY`, `ATTEND_CLASS` and `TALK` express their changes as `GameEffect[]` with a `reason` string, which gives an audit trail.
- **Conversation outcomes come from rules,** with the LLM only voicing them. The context passed to the evaluator is rich (profile, history, privacy, recent events).
- **Time cost is data,** not a side effect.
- **Failure paths are explicit.** Most invalid inputs return a clear message at `timeCost: none`.
- **Spell mastery is detected from an actual state transition,** not announced unconditionally.

## Weaknesses

1. **Rules are shallow.**
   - `REST` changes nothing (no energy, health or mana), though the text says "You feel refreshed!".
   - `INTERACT` is a stub that always succeeds ("Something happened!").
   - `STUDY` has no cost (energy), diminishing returns, location or time-of-day requirement, and does not check the subject: an unknown one takes the time and reports gains that are never applied.
   - `ATTEND_CLASS` ignores the `duration` argument (always 60 minutes).
   - `PRACTICE` has no mana, energy or backfire effect even though `SpellBalance` defines `manaCost` and `backfireRisk`, and ignores `castCondition`.
   - `MOVE` has no travel-time variation, locked doors, curfew or ownership.
2. **Messages and prose live in rules code.** Output strings such as "Something happened!" and `buildConversationOutput` are embedded in the logic, which blocks localization and makes it hard for the renderer to receive structured facts rather than a sentence it must paraphrase.
3. **`events` are English strings.** `Talked to ${npcId} about ...` then feeds `recentEvents`, which feeds conversation mood modifiers and the render prompt. Structured data is lost; later systems must parse text.

## Rework ideas

- Give the explicit `outcome` a typed `reason` too (why it was blocked or refused).
- Add **preconditions** as data: location, time window, required energy or mana (the timetable and NPC presence are checked in code today). Failures return the reason to the renderer.
- Give `REST`, `STUDY` and `PRACTICE` real **resource effects** (energy, mana, health), and use the existing spell balance fields.
- Move travel time and similar facts onto `Location` data (privacy already is).
- Let a rule also return **structured facts** (`{ kind: "conversation", npc, result, tags }`) for the renderer, with deterministic fallback strings generated in a separate presentation module.

## Open questions

- How deep should the sim go: stay a light "school life" loop, or add real constraints (schedules, energy, curfew, presence)?
- Should the turn unit stay "one command, one fixed duration", or become a time-slot model (morning, class, evening) where choices fill slots?
- Is `INTERACT` meant to become a real item-use system? If so, it needs an item effect model before anything else.

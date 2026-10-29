# Turn Resolver & Commands

Files: `src/core/engine/TurnResolver.ts` (`decide`, ~60 lines), `turnSteps.ts` (`advanceTime`, `announce`), `src/core/engine/rules/` (one file per command plus `context.ts`, `results.ts`, `index.ts`), `TurnResult.ts`, `TimeCost.ts`, `src/core/domain/commands/CommandDefinitions.ts` (the `Command` type). Tests: `turn-rules.test.ts`, `turn-event-order.test.ts`, `turn-resolver.test.ts` and the scenario suites. Collaborators: `CurriculumService`, `SpellRevealService`, `SpellProgressionService`, `evaluateConversation`, `applyEffects`, `GameBus`.

## What it does

The deterministic rules layer. Given a typed `Command`, the current `GameState` and the `Registry`, it decides what happens and returns a `TurnResult` (`facts`, `briefOutput`, `timeCost`, `effects`, `timePassed`). It makes no LLM calls and does no I/O. Every state change, including location, clock and fact log, is applied through `applyEffects` inside `apply`; the engine then renders the prose around `briefOutput`.

A rule never writes a sentence. It returns **facts** (`TurnFact`, `domain/facts/TurnFact.ts`): a union by `kind` (`moved`, `move-blocked`, `conversation`, `studied`, `attended`, `practiced`, `interacted`, `rested`, `year-advanced`, and `refused` with a `reason` such as `not-discovered` or `person-absent`) that carries ids and display names. `presentation/facts.ts` is the one place that words them: `describeFact` gives the sentence that becomes `briefOutput`, and `logLine` gives the short line the narrator sees under "Recent events". A language or a different voice is a change to that module only.

## How it works

`decide(command, state, registry)` takes only the seven in-world commands (`InWorldCommand`; the meta commands never get here, the type enforces it). Moving the clock and announcing events are the next stages of the turn pipeline (see 02), kept in `turnSteps.ts`; `apply` runs all three in one call and is what the rule tests use. `decide` is a short pipeline:

1. It makes one `Random` for the turn (a seeded one resumed from `GameState.randomState`, or an injected one) and a `TurnContext` (state, registry, random, services, and an `apply(effects)` that runs `applyEffects`). A rule has no bus.
2. It runs the rule for the command, `turnRules[command.type]` (`rules/index.ts`, a registry typed over the in-world commands, so a new command without a rule does not compile). A rule is a plain function `(command, ctx) => TurnResult`: it checks, applies the effects later steps depend on, and returns the fact, the time cost, the effects and the events it wants announced (`emits`). It states its own `outcome`: `success`, `blocked` (tried, did not work, time passed, such as a move to an unconnected place) or `failure` (not a valid request, no time).
3. It applies the bookkeeping that belongs to the decision as effects: the fact log (every fact but a refusal) and the new random state.
4. The turn pipeline then moves the clock (`advanceTime`: `TimeAdvanced`, `timePassed`) and emits the rule's `emits` on the bus, in order, then `ActionResolved` (`announce`). A listener therefore sees the finished turn (clock advanced, log written), not a half-done one.

Whether a place is private comes from the `Location` data.

| Command | Behavior | Time |
|---|---|---|
| `MOVE` | Validates the destination exists, is connected and has been discovered; arriving marks it visited and discovers its exits; emits `LocationVisited`/`LocationDiscovered`; applies a `LocationChanged` effect (which also marks the place discovered) | 5 min (2 min on a blocked move) |
| `TALK` | Refused (no time) unless the NPC exists and is in the player's place; builds a `ConversationContext` (relationship or zeroed stats, topic, NPC profile, history, last 10 facts, privacy), calls `evaluateConversation`, applies its effects, emits five conversation events | 15 min |
| `STUDY` | `ProgressDelta` of `10 * hours` to subject knowledge; checks spell availability; emits `SubjectStudied`/`SpellRevealed` | 60 min per hour |
| `ATTEND_CLASS` | Only in the class's timetabled period and place, once per slot (flag `attended.<subject>.<day>.<period>`); fetches current lesson, applies lesson rewards as effects, rolls each lesson's spell-reveal opportunity, advances the lesson counter, emits `LessonAttended` | fixed 60 min |
| `PRACTICE` | Requires a learned spell; runs 10 attempts per hour through `applySpellUse` using the turn's seeded `Random`; writes the spell state with a `SpellStateUpdated` effect | 60 min per hour |
| `INTERACT` | Finds the item in inventory and returns the fact "Something happened!" | 10 min |
| `REST` | Returns the fact "You feel refreshed!" | 60 min per hour |

## Strengths

- **One small rule per command,** a plain function over a `TurnContext` that has no bus: each can be tested with a fake state and a fixed `Random`, and a new in-world command without a rule does not compile.
- **Genuinely deterministic and LLM-free**, so the rules layer is unit-testable in isolation. Chance comes from a seeded `Random` whose state is saved, so the same state and commands always play out the same.
- **Clear contract.** Every handler returns the same `TurnResult` shape, so the engine and renderer stay generic.
- **Mostly effect-based.** `STUDY`, `ATTEND_CLASS` and `TALK` express their changes as `GameEffect[]` with a `reason` string, which gives an audit trail.
- **Conversation outcomes come from rules,** with the LLM only voicing them. The context passed to the evaluator is rich (profile, history, privacy, recent facts).
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

## Rework ideas

- Give the explicit `outcome` a typed `reason` too (why it was blocked or refused).
- Add **preconditions** as data: location, time window, required energy or mana (the timetable and NPC presence are checked in code today). Failures return the reason to the renderer.
- Give `REST`, `STUDY` and `PRACTICE` real **resource effects** (energy, mana, health), and use the existing spell balance fields.
- Move travel time and similar facts onto `Location` data (privacy already is).
- **Extension plan: a real `INTERACT`** (picking up, examining, using items and scenery: "examine the old scroll", "throw the chandelier", "pull the lever"). The hard part is knowing which target must be on the player and which need not be ("I open a book" in a library needs no book in the backpack, while casting from a scroll needs the scroll). Give every target a presence mode: *held* (must be in the inventory; a miss is a refusal with a reason), *in place* (a feature the `Location` offers, with its verbs; works only there) or *takeable* (found in the place; taking it moves it to the inventory). Content declares the mode, so the rule never guesses. The resolver grounds the name against what the player holds plus what the place offers, like exits and people today; new facts (`examined`, `picked-up`, `used`) and refusal reasons carry the result, and using something changes the world through effects (flags, exits, spells). Open: how much "use" changes the world, and whether features are authored per location or generated by the blueprint.
- Hand the narrator the **facts themselves** (see 05) instead of the sentence made from them.

## Open questions

- How deep should the sim go: stay a light "school life" loop, or add real constraints (schedules, energy, curfew, presence)?
- Should the turn unit stay "one command, one fixed duration", or become a time-slot model (morning, class, evening) where choices fill slots?
- Is `INTERACT` meant to become a real item-use system? If so, it needs an item effect model before anything else.

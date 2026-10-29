# Spell System

Files: `src/core/domain/magic/` — `Spell.ts` (82 lines, types), `SpellBook.ts` (54), `SpellProgressionService.ts` (72), `SpellRevealService.ts` (139), `SpellStateFactory.ts` (27). Content: `src/content/packs/spells*.json`. UI: `SpellbookWidget.tsx`. Tests: `src/test/spell-progression.test.ts`. Docs: `docs/ADDING_SPELLS.md`.

## What it does

Models spells as static definitions (in the `Registry`) plus per-player state (in the `SpellBook`). A spell is supposed to travel through a lifecycle: hidden, then available, then learned, then mastered, with proficiency growing through practice.

## How it works

- **Definition** (`SpellDefinition` + `SpellBalance`): id, name, level, usage type, range, target type, optional reveal and cast conditions, flavor text; balance has `manaCost`, `backfireRisk`, `learningDifficulty` (0 to 1), `practiceRequirement`, and a `scaling` map.
- **State** (`SpellState`): `knowledgeState`, `proficiency`, `practicePoints`, `stability`, `reliability`, `masteryTier`, `masteryLevel`, `discoveredFrom`, `becameAvailableAt`.
- **SpellBook:** a `Map<spellId, SpellState>` with get/set/update helpers and JSON (de)serialisation (`toJSON` / `fromJSON`, which is why it survives save/load).
- **Initialisation:** at startup, `engineFactory` puts every registered spell into the book as `hidden`.
- **Reveal** (`SpellRevealService`):
  - `attemptSpellReveal` (after a class): if the lesson's requirements pass (attribute, subject knowledge, year, spell known), a `Math.random()` roll against `chance` succeeds. The service only rolls; the resolver applies a `SpellRevealed` effect, which moves a `hidden` spell to `available` and leaves any other state alone.
  - `findRevealableSpells` (after study): returns the hidden spells whose reveal condition is met, through each hidden spell's `revealCondition` through `checkRevealCondition`.
- **Learning:** a source teaches the spell; the player never triggers it. The `SpellLearned` effect (`EffectApplier`) turns an `available` spell into `learned` and does nothing in any other state. Today only the class source exists: a lesson opportunity with `"grants": "learned"` (all seven in the year 1 curriculum) teaches the spell when its roll succeeds. Item and trainer sources are not built yet.
- **Practice** (`TurnResolver._practice` + `applySpellUse`): 10 attempts per hour. Success chance is `0.3 + proficiency/100 * 0.6`, capped at 0.95. Each attempt adds practice points (1.0 on success, 0.35 on failure, scaled by difficulty). Reaching `practiceRequirement` converts points into proficiency with diminishing returns. Reliability is an exponential moving average. Mastery tier follows proficiency thresholds (20, 50, 85), and at 85 a learned spell becomes `mastered`.

## Strengths

- **A sound progression model.** Separating knowledge (can I cast it) from proficiency (how well) is the right shape. Failures still teach, diminishing returns and tiers give a believable curve.
- **`applySpellUse` is a pure function** (copies state, returns new state), so it is easy to unit test and reason about.
- **Data-driven spells.** Definitions live in JSON packs with a documented format.
- **Static versus per-player state is cleanly separated.** The save stores only spell states.
- **`SpellBook` serialises correctly** and is rehydrated on load.
- **The UI shows state** (a spellbook widget with colors and icons per state).
- **Reveal opportunities are expressive** (requirements + chance), and can be tied to lessons.

## Weaknesses

1. **Spells cannot be learned from items or trainers.** Classes teach their spell through the `SpellLearned` effect, but spells taught by items or trainers need item content and the relationship fix first. A lesson is attended once, so a failed roll (only `heal`, at 0.8, can fail) means the spell is never taught from that class.
2. **Study reveals nothing.** `checkRevealCondition` is hard-coded to `return false`, and the sample spell packs contain no `revealCondition` anyway. `STUDY` reports "New spells available" only if that worked; it never does.
3. **Reveal can undo progress.** `attemptSpellReveal` sets `knowledgeState: "available"` without checking the current state. Attending a class again whose opportunity matches an already `learned` or `mastered` spell downgrades it to `available` (proficiency is kept, but practice is blocked again and the announcement "New spells available" repeats).
4. **The balance numbers are mostly inert.** `manaCost`, `backfireRisk`, `scaling`, `castCondition`, `usageType`, `range`, `targetType` and `level` are read by no rule. Practice ignores mana and the player's attributes. The `scaling` keys (`intellect`, `dexterity`) do not even match the `AttributeId` names (`INT`, `DEX`). Spells cannot actually be cast anywhere in the game (no cast command, no use in conversation, exploration or duels), so they have no gameplay effect beyond a number going up.
5. **Redundant and unused state fields.** `masteryLevel` always equals `proficiency`, `stability` is `proficiency/100`, `reliability` is tracked but never read, and `Spell.state?` duplicates the book. The comment block of mastery thresholds ("20 / 50 / 75 / 90") disagrees with `computeMasteryTier` (20 / 50 / 85) and with the `mastered` cutoff.
6. **Randomness is unseeded** (`Math.random` in both reveal and practice), so progress is not reproducible or testable without mocking.
7. **Practice is a bulk simulation of 10 attempts per hour** with one summary line. The player makes no choices (which spell variant, risk level, partner), and nothing can go wrong because backfire is unimplemented. It is mostly a "spend an hour, get a number" action.
8. **Possible hang.** `while (practicePoints >= practiceRequirement)` loops forever if a pack sets `practiceRequirement` to 0 (or negative), and there is no validation of pack values.
9. **Spell data carries franchise names and lore** (real spell names, lore tags), and the ids and display names are inconsistent (`levitate` versus "Wingardium Leviosa"), which will also matter to the resolver's matching (see 03).
10. **Reveal logic is duplicated and split.** `checkRequirements` (class-based) and `checkRevealCondition` (study-based, stub) are two different condition systems with different shapes (`Requirement[]` versus a `type/value` condition). The `year` check reads the first subject's year as the player's year instead of `currentYear`.
11. **Testing.** The test file covers the progression math lightly; there are no tests for reveal, state transitions, the full lifecycle, or the downgrade bug.

## Rework ideas

- **Close the lifecycle first.** Define the real path: reveal (you hear of a spell), learn (a lesson or tutor teaches it), practice, master. Make "learn" part of attending the lesson that teaches it, or a distinct action, and make reveal a *monotonic* transition that never regresses.
- **Make spells usable.** Add a `CAST` action and context checks (location, combat, conversation, puzzles, exams) that spend mana, apply the backfire table, scale with attributes and proficiency, and produce effects. Without use, progression has no meaning.
- **Route everything through effects:** `SpellStateChanged`/`SpellKnowledgeAdvanced`, `ProficiencyDelta`, and event emission derived from them (see 06 and 07). Keep `applySpellUse` as the pure rule that computes the new state.
- **Unify conditions** into one `Condition` type (attribute, knowledge, item, location, quest flag, relationship) evaluated by one function over `GameState`, used by reveal, cast and lesson requirements.
- **Slim the state:** keep `knowledge`, `proficiency`, `practicePoints`, and derive tier, stability and level on read. Remove or use `reliability`.
- **Use the balance data:** wire `manaCost`, `backfireRisk`, `scaling` (typed to `AttributeId`) and `castCondition`, or delete unused fields from the schema.
- **Inject a seeded RNG,** validate pack values (`practiceRequirement >= 1`) with Zod, and add lifecycle tests (hidden to mastered, repeat reveal, mana limits).
- **Give practice shape:** choose intensity or method, a risk of backfire at low proficiency, a cap per day by energy, and a clear result summary.
- **Separate the setting from the system:** spell ids and mechanics generic, names and lore in a replaceable pack.

## Open questions

- What is a spell *for* in this game: a puzzle and exploration key, a combat tool, a social or exam currency, or a collection? The use case decides the cast model.
- Should learning be automatic when a class is attended, or a deliberate choice (and a cost) by the player?
- Do spells need a visible failure model (backfire, injury, house points) to make practice interesting?

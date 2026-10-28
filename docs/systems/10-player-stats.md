# Player & Stats

Files: `src/core/domain/player/Player.ts` (28 lines), `PlayerStats.ts` (~100), `Spellbook.ts` (empty duplicate), `academicState.attributes` in `GameState.ts`, HUD in `src/ui/ink/components/Hud.tsx`. No dedicated tests.

## What it does

Models the player character: identity fields, 10 attributes, and 4 resources (plus an `injured` flag). Attributes are meant to grow through lessons and gate spell reveals. Resources are meant to be spent and restored by actions.

## How it works

- `Player` holds `name`, `gender` (boolean), `age` (14), `appearance`, `archetype`, `faction` (all `"default"`), `health` (100), an `inventory: Item[]`, `attributes: AttributeStats` and `resources: ResourceStats`.
- `AttributeStats` wraps a private map of `INT, WIL, DEX, CHA, STR, CON, PER, AGI, LUC, WIS` with `get/set/increase/decrease/applyDelta/getAll`. All values start at **0**.
- `ResourceStats` has public `health`, `mana`, `energy` (100 each), `reputation` (0) and `injured`, with `applyDelta` and `clone`.
- Changes arrive through the `AttributeDelta` and `ResourceDelta` effects. `ATTEND_CLASS` applies `+1` to each attribute listed in a lesson's rewards.
- The HUD reads `player.attributes` and `player.resources` directly and draws bars.

## Strengths

- **Clear, small vocabulary.** Ten attributes with ids documented in one place, four resources, typed delta shapes (`AttributeStatsDelta`, `ResourceStatsDelta`) that fit the effect system.
- **Deltas are partial,** so one effect can change several stats at once.
- **Encapsulated attribute storage** (`private values`) with a narrow API.
- **The HUD gives immediate feedback** on the state of the character.
- **Extensible shape:** reputation and an `injured` flag already hint at consequences beyond a progress bar.

## Weaknesses

1. **Attributes do nothing.** The player's real attributes (`player.attributes`, start at 0, changed by lessons) are not read by any rule. Spell reveal requirements check a *different* copy, `academicState.attributes`, which starts at 10 and is never changed by any effect. So a lesson that rewards `INT +1` has no effect on whether a spell is revealed, even though `ATTEND_CLASS` comments say reveals depend on updated attributes. Nothing else (conversations, practice success chance, exams) uses them either. Two attribute stores, neither connected to gameplay: the HUD shows one set of numbers while the rules read another.
2. **Resources are decorative.** No code produces a `ResourceDelta` and nothing reads `mana`, `energy` or `reputation`. Practice costs no mana, study costs no energy, resting restores nothing, and `health` exists in three places (`player.health`, `player.resources.health`, and the unused `state.resources` map). The HUD bars therefore never move. `injured`, `reputation` and spell `manaCost`/`backfireRisk` are all inert.
3. **No bounds.** `applyDelta` does not clamp: health or energy can go negative or over 100, and attributes can be pushed without limit. `increase`/`decrease` and `applyDelta` duplicate each other.
4. **Broken after load.** Saves serialise the player as plain JSON and `fromPlainObject` assigns it back unchanged, so `AttributeStats` and `ResourceStats` lose their methods (see 08). The next `AttributeDelta` or `ResourceDelta` would throw, and `attributes.get` (including `Hud` if it called it) would not exist.
5. **Character creation does not exist.** Identity fields are fixed defaults (`gender: boolean`, `appearance`, `archetype`, `faction` all `"default"`). There is no name entry, background, house or starting-attribute choice. `faction`, `archetype` and `appearance` are read nowhere. `gender` as a boolean is a modeling shortcut that will not hold up.
6. **No progression model for the character.** There is no level or experience, no talent or trait system, no caps relative to year, no diminishing returns, and `+1` per lesson is a flat reward. Meanwhile, subject knowledge (a separate number in `academicState`) is the real progress track, so "stats" and "knowledge" are unrelated.
7. **No derived stats.** Max mana, spell power, learning speed, social modifiers and success chances are not computed from attributes. Practice uses a fixed formula (`0.3 + proficiency * 0.6`, capped at 0.95) that ignores the player entirely.
8. **Player inventory is duplicated** (`player.inventory` versus `state.inventory`), and `Player` carries `Item` import for a field nothing uses.
9. **Dead file.** `core/domain/player/Spellbook.ts` is an empty file next to the real `magic/SpellBook.ts` (listed as legacy in system 22), a source of import mistakes.
10. **Attribute naming and scale are undecided.** The names are RPG-generic (STR, AGI, CON), several overlap in meaning (WIL/WIS, PER/INT), and values are on an unspecified scale (0 vs 10 starts). Several do not obviously fit a wizard school (STR, AGI, CON), and none have documented gameplay roles.
11. **No tests** of stat math, clamping or effect application.

## Rework ideas

- **Decide what the character *is* for.** Define each stat's gameplay role first, then trim the list (for example four to six school-relevant attributes), and write the rules that read it: spell success and backfire, learning speed, conversation modifiers, exam results, resource caps.
- **One store, one scale.** Remove `academicState.attributes`, `player.health`, `player.inventory` and `state.resources`, pick a starting scale (e.g. 1 to 10 with a documented meaning), and make reveals, practice and exams read the same source.
- **Make resources real.** Time costs energy, spells cost mana, rest and sleep restore (with a daily rhythm via `WorldClock`), failure and backfire cause injury, and low values block actions with a reason. Effects already exist for this (`ResourceDelta`); handlers need to produce them (see 04).
- **Clamp in one place** (`min/max` per stat), and expose derived values (`maxMana`, `spellPower`) through pure functions.
- **Plain-data player** (`{ attributes: Record<…>, resources: {…} }`) plus pure functions, so save/load needs no rehydration (see 08).
- **Add character creation:** name, background or house, a few starting choices that matter for NPC reactions and early options, and a stored `PlayerProfile` the narrator and conversations can use.
- **Give growth structure:** per-year attribute caps, trait or talent unlocks tied to story milestones, and exams that test attributes plus knowledge.
- **Connect to the HUD honestly:** show only stats that matter, and show deltas after actions.

## Open questions

- Is this a stat-driven RPG (builds, trade-offs) or a story and relationship game where the character is mostly flavor and progress is spells and relationships?
- Do we want classic attributes at all, or a smaller school-flavoured set (e.g. Intellect, Willpower, Charm, Daring) with clear uses?
- Should failure have lasting costs (injury, reputation, detention), and how punishing should the energy and mana economy be?

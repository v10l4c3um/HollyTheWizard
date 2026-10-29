# Game State

Files: `src/core/domain/world/GameState.ts` (~220 lines), `Player.ts`, `PlayerStats.ts`, `Relationship.ts`, `WorldClock.ts`, `SpellBook.ts`, `Curriculum.ts` (state shapes). Persistence tests: `src/test/persistence.test.ts` (14 cases).

## What it does

`GameState` is the single mutable object that is both the live world and the save file. The engine owns one instance. Everything else reads it, and effects (and a few direct writers) mutate it.

## How it works

One class with public fields, grouped as:

| Group | Fields |
|---|---|
| Meta | `metadata` (save version, timestamp), `settings`, `output` |
| World | `worldClock`, `currentLocationId` (default `"startingVillage"`), `discoveredLocationIds`, `visitedLocationIds` |
| Player | `player` (attributes, resources, name, health, own `inventory`), `spellbook`, `inventory` |
| Academic | `academicState` (10 attribute values plus per-subject progress for 27 subjects) |
| Social | `relationships`, `unlockedTopicsByNpc`, `conversationHistory`, `knownNPCIds` |
| Narrative | `questFlags {active, completed}`, `flags`, `clues`, `rumors`, `sceneInvitations`, `recentEvents` |
| Campaign | `currentYear`, `campaignBlueprint`, `yearBlueprints`, `yearProgress` |
| Unused | `resources` (a generic numeric map) |

The constructor builds a fresh game. `fromPlainObject(data)` rebuilds a state from parsed JSON: it copies most fields as-is and re-creates only `worldClock` and `spellbook` via `fromJSON`. Saving is `JSON.stringify(state)`.

## Strengths

- **One obvious source of truth.** Easy to find, inspect, serialise and print for debugging.
- **Mostly plain data.** Records and arrays serialise to JSON with no custom code, and the save format is human-readable.
- **Comments name the effect that owns each field** (e.g. "mutated via `RelationshipDelta`"), which documents the intended write path.
- **Covers the whole game surface** (academics, social, story, campaign), so no feature has to invent hidden state elsewhere.
- **Safe defaults on load** (`?? {}`) for the newer fields, so older saves keep loading.
- **Round trip is tested** (14 persistence tests, including rehydration of the clock and spellbook).

## Weaknesses

1. **Loading breaks class instances.** `fromPlainObject` rehydrates only `worldClock` and `spellbook`. `state.player` is assigned straight from JSON, so `player.attributes` and `player.resources` lose their `applyDelta` methods, and `relationships` entries lose theirs too. After `LOAD`, the next `ATTEND_CLASS` (which applies an `AttributeDelta`) should throw `applyDelta is not a function`. This looks like a real, reproducible bug, and the persistence tests do not catch it because they check clock and spellbook only. (Needs a quick confirming test.)
2. **Duplicate and conflicting homes for the same data.**
   - Attributes live in both `player.attributes` (changed by `AttributeDelta`) and `academicState.attributes` (initialised to 10s, apparently unused).
   - Inventory lives in `state.inventory.items` (used by effects and `INTERACT`) and `player.inventory`.
   - `state.resources` (generic map, "mutated via `ResourceDelta`") is not touched by the applier, which uses `player.resources`; `player.health` is a third place for health.
   - Which copy is authoritative is unclear, and two of the copies are dead.
3. **No schema, no validation, no versioning.** `saveVersion` is "0.0.1" and never checked. `fromPlainObject(data: any)` trusts the file: a missing field (`data.questFlags`, `settings`, `yearProgress`, `knownNPCIds`, `recentEvents`) becomes `undefined` and fails later. There are no migrations.
4. **Transient and derived data are saved.** `output` (last narration) is persisted, `recentEvents` grows without bound (only `.slice(-N)` on read), and a loaded save includes the blueprint object graph, which the class itself says nothing about validating.
5. **Fields that nothing writes.** `knownNPCIds` is never populated, so "nearby NPCs" in the narration prompt is always empty (see 05). `resources`, `sceneInvitations` (no consumer), and `settings.romanceIntensity` are similar dead weight. Schedules and NPC presence have no state at all.
6. **Hard-coded content in the model.** The 27 subject ids and starting attribute values are written into the `GameState` constructor, and the start location `"startingVillage"` is a string literal. Content that belongs in data is baked into code, and the subject list duplicates `SubjectType`.
7. **Public mutable fields, no encapsulation.** Anything can write anything (`engine.state.questFlags.active.push` in the factory, `output =` in the engine), so the "effects only" rule is convention, not enforcement. The class has almost no behaviour, so it is a data bag typed as a class, with `Date.now()` and defaults in the constructor.
8. **Unbounded, structurally loose collections.** `questFlags` and `flags` are free-text string lists and maps. `sceneType` in state is `string` while the effect uses a union. Clue and rumor records are bare booleans with no timestamp or location.
9. **Coupling to higher layers.** The state module imports campaign blueprint types, curriculum types, and NPC types, so the "domain core" is one big dependency hub, and `InkApp` and the renderer receive the whole object.
10. **Time is split.** `worldClock` holds day and time, but cooldowns, invitation expiry (`validUntilMinutes`) and "last seen" data have no shared absolute timestamp.
11. **Mutable reference returned from the engine,** so the UI cannot diff, and there is no snapshot for undo.
12. **Testing gap** beyond persistence: no tests for `fromPlainObject` with missing or older data, or for class methods after load.

## Rework ideas

- **Fix rehydration now:** build `Player`, `AttributeStats`, `ResourceStats` and `RelationshipStats` instances in `fromPlainObject`, or store plain data and keep behaviour in pure functions (see below). Add a test that loads a save and applies every effect type.
- **Pick one home per datum.** Delete `academicState.attributes`, `player.inventory` and `state.resources` (or make them the real ones), and document ownership.
- **Plain data plus pure functions.** Make state a serialisable interface (`type GameState = {...}`) and move behaviour (`applyDelta`, clock math) into functions. Then JSON round-trips exactly, with nothing to rehydrate, and the state can be diffed, snapshotted and tested without classes.
- **Validate on load with Zod,** include `saveVersion`, and add a migration chain. Fail with a clear error on a corrupt or newer save.
- **Separate persistent state from derived or session data** (`output`, caches), and cap `recentEvents` at write time.
- **Split into sub-states** (`WorldState`, `PlayerState`, `SocialState`, `StoryState`) so systems depend only on their slice. This also gives a natural scheme for NPC presence (a `world.npcLocations` map).
- **Move starting data into content** (subjects from the curriculum, start location and attributes from a "new game" template).
- **Add `knownNPCIds` writes,** or replace the concept with a real presence and met-NPC model.
- Add a single absolute **timestamp** (total minutes) for expiry and cooldown logic.

## Open questions

- Plain data + pure functions (a functional core) or keep classes with behaviour? This is the biggest structural choice for the rework, and it interacts with the effect and reducer question from 06.
- Is backward compatibility with existing saves required, or can we start a clean save format at v1?
- Should the save contain an action/effect history for replay and debugging?

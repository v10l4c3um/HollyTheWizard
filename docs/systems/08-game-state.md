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
| Narrative | `questFlags {active, completed}`, `flags`, `clues`, `rumors`, `sceneInvitations`, `recentFacts` (the last 20 `TurnFact`s, capped when written; the fact log the narrator and the conversation mood read), `randomState` (where the seeded random source stands, so luck replays exactly and travels with `undo` and saves) and `recentTurns` (the last five in-world turns, for "again" / "go back" / "ask her"; see 03) |
| Campaign | `currentYear`, `campaignBlueprint`, `yearBlueprints`, `yearProgress` |
| Unused | `resources` (a generic numeric map) |

The constructor builds a fresh game. `fromPlainObject(data)` rebuilds a state from a save file that `SaveSchema` has already validated, so it applies no defaults; it re-creates `player`, relationships, `worldClock` and `spellbook` through their own `fromJSON`. `clone()` makes an independent deep copy through the same serialisation (so a copy and a save cannot disagree); the engine clones the state at the start of every turn and keeps the committed ones as undo history (`GameSession`, 20 turns). Saving is `JSON.stringify(state)`; `metadata.saveVersion` is `SAVE_FORMAT_VERSION` and is enforced on load (see 19).

## Strengths

- **One obvious source of truth.** Easy to find, inspect, serialise and print for debugging.
- **Mostly plain data.** Records and arrays serialise to JSON with no custom code, and the save format is human-readable.
- **Comments name the effect that owns each field** (e.g. "mutated via `RelationshipDelta`"), which documents the intended write path.
- **Covers the whole game surface** (academics, social, story, campaign), so no feature has to invent hidden state elsewhere.
- **Safe defaults on load** (`?? {}`) for the newer fields, so older saves keep loading.
- **Round trip is tested** (14 persistence tests, including rehydration of the clock and spellbook).

## Weaknesses

1. **Duplicate and conflicting homes for the same data.**
   - Attributes live in both `player.attributes` (changed by `AttributeDelta`) and `academicState.attributes` (initialised to 10s, read by spell reveal requirements, changed by nothing).
   - Inventory lives in `state.inventory.items` (used by effects and `INTERACT`) and `player.inventory` (unused).
   - `state.resources` (generic map, "mutated via `ResourceDelta`") is not touched by the applier, which uses `player.resources`; `player.health` is a third place for health.
   - Which copy is authoritative is unclear, and several of the copies are dead.
2. **Transient and derived data are saved.** `output` (last narration) is persisted, and a loaded save includes the blueprint object graph, which the class itself says nothing about validating.
3. **Fields that nothing writes.** `knownNPCIds` is never populated (it only feeds the campaign prompt and save validation), so no one is ever "met". The `resources` map and `settings.romanceIntensity` are never used. Schedules and NPC presence have no state at all.
4. **Hard-coded content in the model.** The 27 subject ids and starting attribute values are written into the `GameState` constructor, and the start place is the constant `START_LOCATION_ID = "great_hall"` in code. Content that belongs in data is baked into code, and the subject list duplicates `SubjectType`.
5. **Public mutable fields, no encapsulation.** Anything can write anything, so the "effects only" rule is convention, not enforcement (only `questFlags` has a guard test). The class has almost no behaviour, so it is a data bag typed as a class, with `Date.now()` and defaults in the constructor.
6. **Unbounded, structurally loose collections.** `questFlags` and `flags` are free-text string lists and maps. `sceneType` in state is `string` while the effect uses a union. Clue and rumor records are bare booleans with no timestamp or location.
7. **Coupling to higher layers.** The state module imports campaign blueprint types, curriculum types, and NPC types, so the "domain core" is one big dependency hub, and `InkApp` and the renderer receive the whole object.
8. **Time is split.** `worldClock` holds day and time, but cooldowns and "last seen" data have no shared absolute timestamp.
9. **Testing gap** beyond persistence: no tests for `fromPlainObject` with missing or older data, or for class methods after load.

## Rework ideas

- **Fix rehydration now:** build `Player`, `AttributeStats`, `ResourceStats` and `RelationshipStats` instances in `fromPlainObject`, or store plain data and keep behaviour in pure functions (see below). Add a test that loads a save and applies every effect type.
- **Pick one home per datum.** Delete `academicState.attributes`, `player.inventory` and `state.resources` (or make them the real ones), and document ownership.
- **Plain data plus pure functions.** Make state a serialisable interface (`type GameState = {...}`) and move behaviour (`applyDelta`, clock math) into functions. Then JSON round-trips exactly, with nothing to rehydrate, and the state can be diffed, snapshotted and tested without classes.
- **Validate on load with Zod,** include `saveVersion`, and add a migration chain. Fail with a clear error on a corrupt or newer save.
- **Separate persistent state from derived or session data** (`output`, caches).
- **Split into sub-states** (`WorldState`, `PlayerState`, `SocialState`, `StoryState`) so systems depend only on their slice. This also gives a natural scheme for NPC presence (a `world.npcLocations` map).
- **Move starting data into content** (subjects from the curriculum, start location and attributes from a "new game" template).
- **Add `knownNPCIds` writes,** or replace the concept with a real presence and met-NPC model.
- Add a single absolute **timestamp** (total minutes) for expiry and cooldown logic.

## Open questions

- Plain data + pure functions (a functional core) or keep classes with behaviour? This is the biggest structural choice for the rework, and it interacts with the effect and reducer question from 06.
- Is backward compatibility with existing saves required, or can we start a clean save format at v1?
- Should the save contain an action/effect history for replay and debugging?

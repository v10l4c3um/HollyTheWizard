# Registry & Content Packs

Files: `src/core/Registry.ts`, `src/core/content/ContentLoader.ts`, `src/core/content/SchoolDataLoader.ts`, `src/bootstrap/engineFactory.ts` (`buildRegistry`), `src/content/packs/*.json` (5 files), `src/content/curriculum/*.json` (5 files), domain classes `Location.ts`, `Item.ts`, `Npc.ts`. Docs: `docs/CONTENT_SYSTEM.md`, `docs/ADDING_SPELLS.md`. Tests: `engine-factory.test.ts` only touches startup.

## What it does

Holds all static game definitions (locations, NPCs, NPC profiles, items, spells, school data) in one lookup object, and loads the data-driven parts from JSON at startup. Runtime code asks the `Registry` for definitions by id; per-player data lives in `GameState`.

## How it works

1. **Status: locations are now data** (`world.json`, no longer hard-coded); the world is still three non-school places, which is a content task. Original description: `buildRegistry` (in `engineFactory`) creates a `Registry` and **hard-codes** three locations (`startingVillage`, `forest`, `market`) and one NPC (`villager`).
2. **Fixed:** every file is validated against a strict Zod schema (`ContentSchemas.ts`); unknown keys are errors. Original description: `ContentLoader.loadAllPacks` reads every `*.json` in `src/content/packs/` (sorted by filename). Each pack is a manifest with optional `spells`, `npcs`, `profiles` arrays, registered straight into the registry. A pack that throws is logged and skipped.
3. **Fixed:** `ContentLinter.ts` checks the map, profiles, lessons, spells and timetables for dangling ids, and `buildRegistry` refuses to start on any finding. Original description: `SchoolDataLoader` reads `subjects.json`, every `year*.json` (one `SubjectCurriculum` each), and `timetables.json`, and registers a single `SchoolData` blob.
4. `Registry` is four `Map`s plus `npcProfiles` and `schoolData`, with `register*`/`get*`/`getAll*Ids` methods and `getCurriculumForSubject`.
5. Progress is reported to the loading screen through `onProgress`.

Current content: 5 pack files (about 14 KB), curriculum for **3 subjects in year 1** (charms, defense, potions) out of 27 subjects and 7 years.

## Strengths

- **A clean, small lookup interface.** All systems depend on `Registry.getX(id)`, so definitions are separate from player state.
- **Data-driven spells, NPCs and profiles.** New content is a JSON file dropped into a folder, with no code change (the stated goal in `CONTENT_SYSTEM.md`).
- **Packs are additive and namespaced by file,** and one broken pack does not take down startup.
- **Deterministic load order** (sorted filenames).
- **Static versus dynamic is separated,** which is exactly the property the save format needs: saves hold ids, not definitions.
- **Startup progress is reported** per pack, which gives the loading screen real status.
- **Documented** (content system and adding-spells guides).

## Weaknesses

1. **The world is not a school.** The only locations are hard-coded in code: a village, a forest and a market. There is no castle, classroom, library or dormitory, no location content pack, and no way to author locations in data. The curriculum, NPC pack (professors, Hagrid, etc.) and "attend class" all assume a school, but nothing in the registry places them anywhere. NPCs have no home or schedule data, and classes have no room.
2. **No validation of pack content.** Manifests are `JSON.parse(...) as ContentPackManifest`. No schema, no required fields, no types checked. `npcs.json` includes an `affinity` field that the `NPC` class does not have, which is silently ignored. A malformed spell shows up as a runtime error mid-game, not at load.
3. **No referential integrity.** Nothing checks that a profile's `npcId` exists, a lesson's `spellId` is a real spell, a reveal condition references a real subject, a location's exits point to real locations, or a timetable subject exists. Typos fail silently or surface as "no spell with id" during play.
4. **"Immutable after startup" is only a convention.** `register*` methods stay public and mutable, duplicates silently overwrite earlier entries (no warning on id collision across packs), and returned objects are shared and mutable.
5. **Items are an empty system.** The registry has an item map and `getItem`, but no pack format, no loader and no registered items. `Item` conflates definition and instance (it carries `quantity`), and effects create nameless items (see 06).
6. **Fixed:** one `loadAllPacks`; the dead per-kind methods are gone. Original description: **Loader duplication and dead code.** `loadSpellPack`, `loadNpcPack`, `loadNpcProfilePack`, `loadAllSpellPacks` and `loadAllNpcPacks` repeat the same logic and appear unused (only `loadAllPacks` is used). The old `loadAll*` loops re-read every file once per content type.
7. **Fragile paths.** Content is found via `__dirname`-relative paths. Under `tsx` this works, but `npm run build` (`tsc`) will not copy JSON to the output, so a compiled build has no content, and `loadAllPacks` only warns when the folder is missing, which gives an empty world rather than a failure.
8. **Fixed:** problems from every file are gathered and thrown together as one `ContentError`; a missing pack directory, `subjects.json` or `timetables.json` is an error too. Original description: **Errors are swallowed.** A failing pack or a missing `subjects.json` yields `console.error` or an empty object and the game continues in a degraded state. `SchoolDataLoader` returns `{}` for missing subjects and `[]` for missing timetables with no warning.
9. **Fixed:** the per-pack `console.log` is gone. Original description: **Console noise.** Pack loading writes `console.log` lines that print into the Ink terminal UI.
10. **Thin content.** One year, three subjects, no locations, ~7 NPCs, no items, no rumors, clues, scenes, exams or events. The "extensible content system" currently covers a small fraction of what the game types describe. Many mechanics (exams, scene invitations, clues) have no content format at all.
11. **Pack format is flat and implicit.** A pack is "spells and/or npcs and/or profiles" in a single manifest, with no declared dependencies, version compatibility, id namespacing, or override/patch semantics. `version` and `description` are read and ignored. There is no way for a pack to extend or replace another pack's entry deliberately.
12. **Content and IP.** The sample NPC pack uses real names and quotes from existing franchises (Snape, Hagrid, Dumbledore, Harry Potter). This is fine for private prototyping, but the content layer should be built so the setting can be replaced wholesale.
13. **No localization or text separation.** Descriptions, dialogue examples and names are embedded in entity definitions.
14. **Testing.** No tests for `Registry`, `ContentLoader` or `SchoolDataLoader` (only the startup failure path).

## Rework ideas

- **Define the world in data.** Add `locations` (with exits, tags such as `private`, `public`, `classroom`, capacity, travel time), items, and optionally NPC `home`/schedule fields to the pack format. Remove all hard-coded content from `engineFactory`.
- **Schema-validate every pack with Zod** at load, and fail fast with file, path and line-quality errors. Generate the TypeScript types from the schemas (single source of truth).
- **Add a content linter** (also run in tests) that checks all cross-references: exits, NPC profile ids, lesson-to-spell links, timetable-to-subject links, blueprint allowlists.
- **Freeze the registry** after `build()` (a `RegistryBuilder` that rejects duplicate ids and returns an immutable `Registry`).
- **Pack manifest v2:** `id`, `version`, `requires`, per-type arrays, and explicit `overrides`. Separate packs by domain (`world/`, `npcs/`, `spells/`, `curriculum/`).
- **Item definitions versus instances:** `ItemDefinition` in the registry, `{ itemId, quantity }` in state.
- **Make content location part of the build** (copy assets on `tsc`, or load via `import` with a bundler) and make a missing pack directory a hard error.
- **Replace console output** with a startup report object shown (or hidden) by the UI.
- **Grow content deliberately:** decide the minimum vertical slice (a castle map, a week of timetable, a handful of NPCs with schedules) before building more systems.
- **Keep the setting swappable:** put the franchise-specific names in a replaceable content pack, and consider original names and characters if the game is ever distributed.

## Open questions

- What is the vertical slice for the rework: one year at one school, or a smaller proving ground (one week, one castle wing, five NPCs)?
- Should content be authored as JSON by hand, or in a friendlier format (YAML or Markdown with frontmatter) compiled to validated JSON?
- Do we want user-installable mods, or is this only for the developer? That decides how much isolation and dependency handling the pack format needs.
- Is the setting a licensed or an original world?

## Content rules (as enforced today)

- **Packs** (`src/content/packs/*.json`): `{ name, version, description?, locations?, npcs?, profiles?, spells? }`, strict. Ids must be unique across all packs. NPCs default to `aliases: []`, `tag_description: ""`. Two fields are accepted but unused by the game: spells' `requiredConditions` (the game reads `revealCondition`/`castCondition`) and NPCs' `affinity`.
- **School data** (`src/content/curriculum`): `subjects.json`, `timetables.json` and at least one `year*.json`, all required.
- **Cross-references** (`lintContent`): the start location (`START_LOCATION_ID`) exists and every location is reachable from it by following connections; connections, profile NPCs, profile topics, lesson spells and subjects, timetable subjects all exist; lesson ids are unique and numbered `1..n`.
- **Failure mode:** startup throws `ContentError` with one line per problem (`file: path: message`).

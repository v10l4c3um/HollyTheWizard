# Registry & Content Packs

Files: `src/core/Registry.ts`, `src/core/content/ContentLoader.ts`, `src/core/content/SchoolDataLoader.ts`, `src/bootstrap/engineFactory.ts` (`buildRegistry`), `src/content/packs/*.json` (5 files), `src/content/curriculum/*.json` (5 files), domain classes `Location.ts`, `Item.ts`, `Npc.ts`. Docs: `docs/CONTENT_SYSTEM.md`, `docs/ADDING_SPELLS.md`. Tests: `engine-factory.test.ts` only touches startup.

## What it does

Holds all static game definitions (locations, NPCs, NPC profiles, items, spells, school data) in one lookup object, and loads the data-driven parts from JSON at startup. Runtime code asks the `Registry` for definitions by id; per-player data lives in `GameState`.

## How it works

1. `buildRegistry` (in `engineFactory`) creates a `Registry` and loads the places from `world.json`: the school and the country around it.
2. `ContentLoader.loadAllPacks` reads every `*.json` in `src/content/packs/` (sorted by filename). Each pack is a manifest with optional `locations`, `spells`, `npcs` and `profiles` arrays, validated against a strict Zod schema (`ContentSchemas.ts`; unknown keys are errors). Problems from every file are gathered and thrown together as one `ContentError`; a missing pack directory is an error too.
3. `SchoolDataLoader` reads `subjects.json`, every `year*.json` (one `SubjectCurriculum` each), and `timetables.json`, and registers a single `SchoolData` blob. `ContentLinter.ts` then checks the map, profiles, lessons, spells and timetables for dangling ids, and `buildRegistry` refuses to start on any finding.
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

1. **"Immutable after startup" is only a convention.** `register*` methods stay public and mutable, and returned objects are shared and mutable. (Duplicate ids across packs are now reported at load.)
2. **Items are an empty system.** The registry has an item map and `getItem`, but no pack format, no loader and no registered items. `Item` conflates definition and instance (it carries `quantity`), and effects create nameless items (see 06).
3. **Fragile paths.** Content is found via `__dirname`-relative paths. Under `tsx` this works, but `npm run build` (`tsc`) will not copy the JSON to the output, so a compiled build has no content (a missing folder is now a load error, not an empty world).
4. **Thin content.** One year of curriculum, three subjects with lessons, ~7 NPCs, a dozen places, no items, rumors, clues, scenes, exams or events. Many mechanics (exams, scene invitations, clues) have no content format at all.
5. **Pack format is flat and implicit.** A pack is "spells and/or npcs and/or profiles" in a single manifest, with no declared dependencies, version compatibility, id namespacing, or override/patch semantics. `version` and `description` are read and ignored. There is no way for a pack to extend or replace another pack's entry deliberately.
6. **Content and IP.** The sample NPC pack uses real names and quotes from existing franchises (Snape, Hagrid, Dumbledore, Harry Potter). This is fine for private prototyping, but the content layer should be built so the setting can be replaced wholesale.
7. **No localization or text separation.** Descriptions, dialogue examples and names are embedded in entity definitions.

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

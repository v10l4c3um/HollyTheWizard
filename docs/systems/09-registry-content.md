# Registry & Content Packs

Files: `src/core/Registry.ts` (+ `content/deepFreeze.ts`), `src/core/content/` (`ContentLoader.ts`, `ContentSchemas.ts` (the manifest), `readContentFile.ts` (positioned errors), `ContentLinter.ts`, `ContentOrigins.ts`, `versions.ts`), schemas next to the domain types (`magic/Spell.ts`, `npc/Npc.ts`, `npc/NpcProfile.ts`, `world/Location.ts`, `quest/CurriculumContent.ts`), `src/bootstrap/engineFactory.ts` (`buildRegistry`), `src/content/{world,npcs,spells,curriculum}/*.json` (11 packs), `src/tools/lintContent.ts`, domain classes `Location.ts`, `Item.ts`, `Npc.ts`. Docs: `docs/CONTENT_SYSTEM.md`, `docs/ADDING_SPELLS.md`. Tests: `content-loader`, `content-schemas`, `content-positions`, `content-lint`, `content-types`, `quest-flag-allowlist`, `registry-frozen`.

## What it does

Holds all static game definitions (locations, NPCs, NPC profiles, items, spells, school data) in one lookup object, and loads the data-driven parts from JSON at startup. Runtime code asks the `Registry` for definitions by id; per-player data lives in `GameState`.

## How it works

1. `buildRegistry` (in `engineFactory`) creates a `Registry`, runs `ContentLoader.load`, then `lintContent`, then freezes it.
2. **Layout.** Content is in one folder per domain, `src/content/world/` (locations), `npcs/` (npcs, profiles), `spells/` (spells) and `curriculum/` (subjects, curriculums, timetables). Every `*.json` in them is a **pack**: a manifest (format 2) with an `id`, a `version`, `requires` (packs that must be present and load first), one array per kind of content, and explicit `overrides`. A pack may only hold the kinds of its folder. See `docs/CONTENT_SYSTEM.md`.
3. **Loading.** Packs are read and validated against strict Zod schemas (unknown keys are errors); the files are parsed with `jsonc-parser`, so every problem carries `file:line:col`. Packs load in dependency order. An id defined twice is an error unless the later pack lists it under `overrides` (and an override of nothing is an error). The loader merges into staging maps, then registers the final entries and one aggregated `SchoolData`. Problems from every file are gathered and thrown together as one `ContentError`.
4. **Types come from the schemas.** The schemas live next to the domain types and the types are `z.infer` of them (`Spell`, `NpcData`, `NpcConversationProfile`, `LocationData`, `LessonDefinition`, ...), so the shape of a pack and the shape the game reads are one definition.
5. **Checks.** `ContentLinter.ts` checks the cross-references (exits and reachability, place names, profiles and topics, schedules, lesson-to-spell, timetable-to-subject, topic and spell places) and the blueprint side: the quest-flag allowlist derived from the content, the arc catalog and the fallback blueprint of every year. Each problem names the file, line and column of the content it is about (the loader records these in `ContentOrigins`). `buildRegistry` refuses to start on any finding; `npm run lint:content` runs the same checks; the test suite runs them over the shipped content.
6. `Registry` is a set of `Map`s plus `schoolData`, with `register*`/`get*`/`getAll*Ids` methods and `getCurriculumForSubject`. `register*` refuses a duplicate id. After the lint passes, `freeze()` ends loading: registering anything later throws, and every stored entry is deep-frozen (`deepFreeze`), so content that was handed out cannot be changed by accident. This is enforced at runtime, not by types.
7. Progress is reported to the loading screen through `onProgress`.

Current content: 11 packs, curriculum for **3 subjects in year 1** (charms, defense, potions) out of 27 subjects and 7 years.

## Strengths

- **A clean, small lookup interface.** All systems depend on `Registry.getX(id)`, so definitions are separate from player state.
- **Data-driven spells, NPCs and profiles.** New content is a JSON file dropped into a folder, with no code change (the stated goal in `CONTENT_SYSTEM.md`).
- **Packs are explicit.** Each has an id, a version and declared dependencies; a replacement is a visible `overrides` entry, never a silent overwrite.
- **Deterministic load order** (by dependencies, ties by id).
- **One definition of a content shape:** the schema, from which the type is inferred.
- **Errors are precise:** every problem names `file:line:col`, and all of them are reported at once.
- **Static versus dynamic is separated,** which is exactly the property the save format needs: saves hold ids, not definitions.
- **Startup progress is reported** per pack, which gives the loading screen real status.
- **Documented** (content system and adding-spells guides).

## Weaknesses

1. **Items are an empty system.** The registry has an item map and `getItem`, but no pack format, no loader and no registered items. `Item` conflates definition and instance (it carries `quantity`), and effects create nameless items (see 06).
2. **Fragile paths.** Content is found via `__dirname`-relative paths. Under `tsx` this works, but `npm run build` (`tsc`) will not copy the JSON to the output, so a compiled build has no content (a missing folder is a load error, not an empty world).
3. **Thin content.** One year of curriculum, three subjects with lessons, ~7 NPCs, a dozen places, no items, rumors, clues, scenes, exams or events. Many mechanics (exams, scene invitations, clues) have no content format at all.
4. **Content and IP.** The sample NPC pack uses real names and quotes from existing franchises (Snape, Hagrid, Dumbledore, Harry Potter). This is fine for private prototyping, but the content layer should be built so the setting can be replaced wholesale.
5. **No localization or text separation.** Descriptions, dialogue examples and names are embedded in entity definitions.

## Rework ideas

- **Define the world in data.** Add `locations` (with exits, tags such as `private`, `public`, `classroom`, capacity, travel time), items, and optionally NPC `home`/schedule fields to the pack format. Remove all hard-coded content from `engineFactory`.
- **Schema-validate every pack with Zod** at load, and fail fast with file, path and line-quality errors. Generate the TypeScript types from the schemas (single source of truth).
- **Add a content linter** (also run in tests) that checks all cross-references: exits, NPC profile ids, lesson-to-spell links, timetable-to-subject links, blueprint allowlists.
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

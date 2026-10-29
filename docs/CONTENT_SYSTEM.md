# Content System

Game content (places, characters, spells, school life) is data: JSON **packs** in `src/content/`, loaded and checked at startup. Nothing in a pack needs a code change. If any pack is wrong, the game refuses to start and prints every problem with `file:line:column`.

## Layout

One folder per domain. A pack may only hold what its folder is for.

```
src/content/
  world/        locations
  npcs/         npcs, profiles
  spells/       spells
  curriculum/   subjects, curriculums, timetables
```

Every `*.json` file in those folders is a pack.

## A pack (manifest format 2)

```json
{
  "format": 2,
  "id": "npcs.profiles",
  "version": "1.0.0",
  "name": "NPC Conversation Profiles",
  "description": "optional",
  "requires": [{ "id": "npcs.core", "version": "1.0.0" }],
  "profiles": [ ... ],
  "overrides": { "npcs": ["professor_snape"] }
}
```

| Field | Meaning |
|---|---|
| `format` | Always `2`. A file without it is a version 1 pack and is refused. |
| `id` | Unique, lowercase and dotted (`spells.year1`). |
| `version` | `x.y.z`. |
| `requires` | Packs that must be present and load first. `version` is the lowest acceptable (same major). |
| `locations`, `npcs`, `profiles`, `spells`, `subjects`, `curriculums`, `timetables` | The content, one array per kind. Only the kinds of the pack's folder. |
| `overrides` | Ids of earlier content this pack deliberately replaces, per kind. |

Packs load in dependency order (ties by id), not by file name.

### Ids and overrides

Each entry has an id: a location, NPC or spell `id`; a profile's `npcId`; a subject's `type`; a curriculum is `subject + year`; a timetable is its `year`. Defining an id that already exists is an **error** unless the later pack lists it under `overrides.<kind>`. Overriding an id that does not exist is also an error. This makes a replacement a visible decision.

## What is checked

1. **Shape (Zod, strict).** Every file is parsed with a schema; a misspelled key, a wrong type or a value outside the allowed list is an error at `file:line:col`. The schemas live next to the domain types (`Spell.ts`, `Npc.ts`, `NpcProfile.ts`, `Location.ts`, `quest/CurriculumContent.ts`), and the TypeScript types are inferred from them, so there is one definition.
2. **Pack rules.** Unique pack ids, `requires` present and compatible, no cycles, kinds allowed in the folder, overrides valid.
3. **Cross-references (`ContentLinter.ts`).** Exits lead to real places and every place is reachable from the start; place names do not collide; profiles belong to real NPCs and use real topics and places; NPC schedules use real places and subjects; topics are natural only in real places; spell conditions name real places; lessons reveal or require real spells and subjects; timetables name real subjects and places; lessons are numbered 1..n.
4. **Blueprint allowlists.** The quest flags a blueprint may use are derived from the content (`lesson_completed:*`, `discovered:*`, `spell_revealed:*`, `mastered:*`). The blueprint schema, its prompt and its semantic check accept only those; the linter verifies the arc catalog and the fallback blueprint of every year against them.

The registry is then frozen: nothing can be registered later and content objects cannot be changed.

## Checking content without starting the game

```
npm run lint:content            # the shipped content
npm run lint:content <dir>      # another content directory
```

It prints `Content OK` or every problem, and exits 1 on any. The same checks run in the test suite over the shipped content.

## Adding things

- **A spell:** add it to a file in `spells/` (see `ADDING_SPELLS.md`).
- **A character:** add it to `npcs/npcs.json` with a `schedule` (every character needs one), optionally a profile in `npcs/profiles.json`.
- **A place:** add it to `world/world.json` and connect it from an existing place; unreachable places are an error.
- **A lesson:** add it to the subject's curriculum pack with the next `order`.
- **A mod or a variant world:** make a new pack that `requires` the original and lists what it replaces under `overrides`.

## Not yet

Items have no pack format. Localization is not separated from content. JSON is read from `src` (a `tsc` build does not copy it).

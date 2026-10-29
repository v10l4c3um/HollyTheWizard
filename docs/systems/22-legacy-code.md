# Legacy & Dead Code

Scope: files that are unused, duplicated, stubs, or misleading, found while reading the other systems. "Unused" here means nothing in `src/` imports it (checked with grep). **Update:** the dead files, the empty placeholders, `DEFAULT_OLLAMA_CONFIG`, the unused `ContentLoader` methods and the folder misspellings have since been removed or fixed, and `Command` now lives in `core/engine/Command.ts`. The inventory below is the original audit.

## Inventory

| Item | Size | Status | Evidence | Related system |
|---|---|---|---|---|
| `src/bootstrap.ts` | 169 lines | Dead. An earlier composition root with its own `GameConfig`, `NarrationProvider`, `PersistenceRepository`, seeded RNG and mock/fallback providers | Not imported anywhere; superseded by `bootstrap/engineFactory.ts`. Its name sits next to the `bootstrap/` folder, so `import "./bootstrap"` is ambiguous | 01 |
| `src/main.ts` | 12 lines | Dead duplicate entry point (same render call as `ui/ink/entry.ts`) | `npm start` runs `ui/ink/entry.ts`; `jest.config.js` even excludes `main.ts` from coverage | 20 |
| `src/main.ts.backup` | 138 lines | Old CLI entry with a loading animation and hand-wired registry; a backup file committed to git | Imports `ui/cli/App`; git already keeps history | 20 |
| `src/ui/cli/App.ts`, `CommandParser.ts` | 64 + 89 lines | Dead readline UI with a rule-based command parser | Only `main.ts.backup` refers to it | 03, 20 |
| `src/ui/cli/commands/Command.ts` | 21 lines | **Live, but in the wrong place.** The `Command` union used by `Resolver` and `TurnResolver` | Imported by `core/engine/Resolver.ts` and `TurnResolver.ts`, so core depends on a legacy UI path | 03, 04 |
| `src/core/domain/player/Spellbook.ts` | 0 bytes | Empty duplicate of `magic/SpellBook.ts` | Not imported; can cause wrong auto-imports | 10, 11 |
| `src/core/engine/Scheduler.ts` | 0 bytes | Empty placeholder for a planned system | Not imported; see 17 | 17 |
| `src/core/domain/quest/Exam.ts` | 13 lines | Unused stub | Never instantiated; `importance: "exam"` is not read | 12 |
| `src/core/domain/npc/Relationship.ts` → `Relationship` class | ~4 lines | Unused (`RelationshipStats` is the live class) | Nothing creates `Relationship` | 14 |
| `CurriculumService.applyLessonRewards`, `addSubjectKnowledge` | methods | Unused; superseded by effects in `TurnResolver` and the source of the duplicate attribute store | No callers | 10, 12 |
| `TurnResolver._save`, `_load`, `ADVANCE_YEAR` branch | methods | Unreachable (the engine handles these first) but still emit `GameSaved`/`GameLoaded` | `GameEngine.handleCommand` returns before `apply` | 02, 04 |
| `ContentLoader.loadSpellPack`, `loadNpcPack`, `loadNpcProfilePack`, `loadAllSpellPacks`, `loadAllNpcPacks` | methods | Unused duplicates of `loadAllPacks` | Only `loadAllPacks` is called | 09 |
| `SpellRevealService.checkRevealCondition` | method | Stub that always returns `false`, so study never reveals spells | Hard-coded `return false` | 11 |
| `SpellRevealService.learnSpell`, `SpellStateFactory.createLearnedSpellState` | functions | No caller in the game (only a test uses the factory) | See 11 | 11 |
| Events never emitted: `AttributeGained`, `QuestFlagSet`, `QuestActivated`, `QuestCompleted` | types | Declared, never emitted | grep of `emit(` | 07 |
| `GameState.resources`, `academicState.attributes`, `Player.inventory`, `Player.health` | fields | Duplicate or unused stores | See 08 and 10 | 08, 10 |
| `GameState.knownNPCIds`, `sceneInvitations`, `settings.romanceIntensity` | fields | Never written (or never read) | See 08, 13, 14 | 08, 14 |
| `DEFAULT_OLLAMA_CONFIG` | const | Unused duplicate of the resolver config | No importers | 18 |
| `GameEngine` `[TIME DEBUG]` log and other `console.*` calls | statements | Debug output left in production paths | See 02, 20 | 02, 20 |
| Folder names `infrastructure/persistence/` | paths | Misspelled, and `docs/current-pipeline-overview.md` spells them differently | Renaming touches imports in `GameEngine`, tests and docs | 19 |
| `docs/` files | docs | Some reference documents that do not exist (`docs/partial-blueprint-yearly-plan.md`, `docs/event-effect-conversion-plan.md`) | Cited in code comments | 06, 15 |
| `ui/ink/package.json` (`"type": "module"`) vs root `tsconfig.json` (`commonjs`) | config | Two module systems in one repo | See 21 | 21 |
| `docs/current-pipeline-overview.md` claims | docs | Several statements no longer match the code: "UI has no direct imports of game internals", "Registry is immutable", "Phase 1 complete" | See 09, 20 | all |

## Why it matters

- **Misleads readers and the design agent.** Dead files look like real systems (`bootstrap.ts` describes seeded randomness and a narration provider interface that the live code lacks), which risks proposing work that already exists in the wrong place, or removing a live piece by mistake.
- **Hides real gaps.** Unused methods that look like solutions (`learnSpell`, `applyLessonRewards`) suggest features work when nothing calls them.
- **Keeps old layers coupled.** The live `Command` type living in `ui/cli` forces core to depend on a retired UI.
- **Costs maintenance.** Type changes must be applied to code nobody runs, and duplicates drift (two attribute stores, two save/load paths, two persistence classes).

## Suggested cleanup (small, low risk, before the rework)

1. **Move** the `Command` type to `core` (for example `core/engine/Command.ts` or `core/domain/commands`) and update the two imports.
2. **Delete** `bootstrap.ts`, `main.ts`, `main.ts.backup`, `ui/cli/` (after step 1), `player/Spellbook.ts`, and the unused `ContentLoader` methods. Git keeps the history; salvage ideas (seeded RNG interface, narration provider interface) into the new design first.
3. **Decide per stub** whether to build or remove: `Scheduler.ts` (keep as the Phase 2 target, but add a one-line header), `Exam.ts`, `Relationship`.
4. **Remove dead paths** in `TurnResolver` (`_save`, `_load`, `ADVANCE_YEAR`) or make the meta-command split explicit (see 02, 04).
5. **Prune the event catalog** and the unused `TurnResult` fields, or implement their consumers.
6. **Fix spelling** of `infrastructure/persistence` in one rename commit with doc updates.
7. **Update the docs:** correct `current-pipeline-overview.md`, drop references to missing plan documents or add the documents, and point the README at the new system notes.
8. Add a CI check for unused exports (for example `ts-prune` or `knip`) so dead code does not accumulate again.

I would do these as one separate "cleanup" commit before any behaviour changes, so the later rework diff stays readable.

## Open questions

- Is anything in `bootstrap.ts` or `ui/cli/` still wanted as a reference (for example the rule-based `CommandParser` as the seed of the rule-based fast path in 03)?
- Should planned-but-empty systems stay in the tree as placeholders, or live only in design docs until work starts?
- Do you want the cleanup done now (I can prepare it as a reviewable change), or kept as a checklist for the rework?

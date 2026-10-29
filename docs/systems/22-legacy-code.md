# Legacy & Dead Code

Scope: code, config and docs that are unused, duplicated, stubbed or misleading. "Unused" here means nothing in `src/` calls it (checked with grep).

## Inventory

| Item | Size | Status | Evidence | Related system |
|---|---|---|---|---|
| `src/core/domain/quest/Exam.ts` | 13 lines | Unused stub | Never instantiated; `importance: "exam"` is not read | 12 |
| `src/core/domain/npc/Relationship.ts` → `Relationship` class | ~4 lines | Unused (`RelationshipStats` is the live class) | Nothing creates `Relationship` | 14 |
| `CurriculumService.applyLessonRewards`, `addSubjectKnowledge` | methods | Unused; superseded by effects in `TurnResolver` and the source of the duplicate attribute store | No callers | 10, 12 |
| `SpellRevealService.checkRevealCondition` | method | Stub that always returns `false`, so study never reveals spells | Hard-coded `return false` | 11 |
| `SpellStateFactory.createLearnedSpellState` | function | No caller in the game (tests only) | See 11 | 11 |
| Events never emitted: `AttributeGained`, `QuestFlagSet`, `QuestActivated`, `QuestCompleted` | types | Declared, never emitted | grep of `emit(` | 07 |
| `GameState.resources`, `academicState.attributes`, `Player.inventory`, `Player.health` | fields | Duplicate or unused stores | See 08 and 10 | 08, 10 |
| `GameState.knownNPCIds`, `settings.romanceIntensity` | fields | Never written (`knownNPCIds`) or never read (`romanceIntensity`) | See 08, 13, 14 | 08, 14 |
| `docs/` references | docs | Code comments cite documents that do not exist (`docs/partial-blueprint-yearly-plan.md`, `docs/event-effect-conversion-plan.md`) | 16 comments in `src/core` | 06, 15 |
| `ui/ink/package.json` (`"type": "module"`) vs root `tsconfig.json` (`commonjs`) | config | Two module systems in one repo | See 21 | 21 |

## Why it matters

- **Hides real gaps.** Unused methods that look like solutions (`applyLessonRewards`) suggest features work when nothing calls them.
- **Costs maintenance.** Type changes must be applied to code nobody runs, and duplicates drift (two attribute stores, two save/load paths).

## Suggested cleanup

1. **Decide per stub** whether to build or remove: `Exam.ts`, `Relationship`.
2. **Remove the unused `CurriculumService` methods.**
3. **Prune the event catalog** and the unused `GameState` / `Player` fields, or implement their consumers.
4. **Drop the references to missing plan documents** from the code comments, or add the documents.
5. **Add a CI check for unused exports** (for example `ts-prune` or `knip`) so dead code does not accumulate again.

## Open questions

- Should planned-but-empty systems (such as `Exam.ts`) stay in the tree as placeholders, or live only in design docs until work starts?

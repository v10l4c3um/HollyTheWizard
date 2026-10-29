# Synthesis: What the System Audit Says

Basis: the 22 notes in this folder. Everything here comes from reading code, not from running the game or the tests (`node_modules` was not installed). Findings marked **[verify]** should be confirmed with a short test before the rework relies on them.

## One-paragraph verdict

The architecture's *ideas* are sound: a deterministic engine, an LLM that only parses and narrates, effects as the one way to change state, validated LLM output with fallbacks, data-driven content. The *implementation* is a prototype where those ideas are only partly realised, and the game loop is thinner than the system list suggests. Several headline features cannot currently be reached in play (spell learning, relationship growth, story milestones, class timetable, NPC presence), and the UI blocks the natural-language input the resolver was built for. The skeleton is worth keeping; most of the work is closing loops, not adding systems.

## Root causes (the same few problems explain most weaknesses)

| # | Root cause | Shows up in |
|---|---|---|
| R1 | **The "effects are the only mutation path" rule is half applied.** (Turn state changes are now all effects; see 02, 06.) Location, time, lessons, spells, the event log and output change outside effects, and `stateChanges` carries unused fields | 02, 04, 06, 11 |
| R2 | **The social loop is not wired.** Relationship records are never created, so deltas are dropped and trust stays 0; NPCs are never "met"; presence and schedules do not exist | 06, 13, 14, 17 |
| R3 | **Time has no calendar.** The clock stores minutes of the day and no date, so timetable, schedules, deadlines, curfew, exams and year pacing cannot exist | 12, 16, 17 |
| R4 | **World content is tiny and not a school.** Three hard-coded locations, one year of three subjects (11 lessons), six franchise NPCs, no items, and no cross-reference validation | 09, 12, 14, 16 |
| R5 | **Several systems are generated or modelled but never consumed.** Campaign blueprint, resource stats, attributes, spell balance data, `sensitivity`/`cooldown`, six events, timetable | 07, 10, 11, 15 |
| R6 | **Free text is untrusted and ungrounded.** The resolver gets no world context and its raw strings are used as ids; topics are free text; the UI additionally gates the first word | 03, 13, 20 |
| R7 | **The LLM is a hard dependency despite the fallback principle.** Startup, loading and every turn call it; the fallback narration discards the facts; timeouts are disabled by default | 02, 05, 15, 18, 19 |
| R8 | **Wiring and state shape are brittle.** Object graph built inside the engine, class instances that do not survive save/load, duplicate stores for the same data | 01, 08, 10, 19 |
| R9 | **No safety net.** The rule layer has no tests, nothing is seeded, and the suite can overwrite a real autosave | 21 |

## Ranked issues

Ranked by how much of the game they block, then by how cheap the fix is.

**Tier 1: the game cannot be played as designed**

1. Spell lifecycle dead-ends at `available`; `PRACTICE` needs `learned`; mastery and its story flag are unreachable (11) **[verify]**
2. Relationships never exist, so conversations are stuck at partial/deflection and trust never grows (06, 13, 14) **[verify]**
3. UI refuses free text and hides `attend` and `advance`, so class attendance and year advance cannot be typed (20)
4. Loading a save likely breaks stat effects, because `Player`/stat objects are not rebuilt (08, 19) **[verify]**
5. Campaign blueprint has no effect on play; milestones use flags the model cannot know (15)
6. Parser output is not mapped to world ids, so valid requests fail with "no X here" (03)

**Tier 2: structural problems that will cause rework if left**

7. No calendar or monotonic time (16), blocking timetable, schedules, exams
8. Mutation split between effects and direct writes (R1)
9. Content layer: no schema, no cross-references, world hard-coded, no items (09)
10. NPC presence and introduction missing (14, 17)
11. Composition root is not the root; startup requires the LLM (01, 18)
12. Fallback narration throws away `briefOutput` (05)
13. Timeouts off by default (`debugMode: true`) (18)

**Tier 3: quality and hygiene**

14. Resources/attributes are decorative (10)
15. Event bus has 16 emitted events with no subscriber (07)
16. No save versioning, atomic write, autosave; tests clobber `autosave` (19, 21)
17. Dead and duplicate code, misspelled folders, stale docs (22)
18. Missing tests and tooling (21)

## Dependency order

```text
22 cleanup ──► 21 tests for known bugs ──► fix R1/R2/spell loop (no new features)
                                              │
        content schema + world in data (09) ──┤
        absolute time + calendar (16) ────────┤
                                              ▼
              NPC presence + schedules (17,14) ──► timetable-driven classes (12)
                                              │
                      conversation depth (13) ┤
                      story beats on triggers (15)
                                              ▼
                    UI: choices + panels (20), LLM optional (18, 05)
```

Reading it: cleanup and characterization tests come first so the rework diff stays readable. Closing the broken loops (spell learning, relationship creation, load rehydration) needs no design decisions. Content schema, the calendar and presence are the foundation for everything after. The story, deeper conversation and UI changes sit on top.

## Strengths worth protecting

- The engine-decides / LLM-narrates split, and `TurnResolver` being LLM-free.
- `evaluateConversation` as a pure function that returns effects and tags.
- `applySpellUse` as a pure progression rule.
- Zod-validated LLM boundaries with allowlists, one repair pass, and deterministic fallbacks (blueprint pipeline).
- The typed `GameEvents` bus and the typed `GameEffect` union.
- The `Registry`/content-pack concept and the `PersistenceRepository` port.
- A solid, mocked-network test suite for the Ollama client and blueprint validation.

## Cross-cutting design decisions to make

These are collected from the "open questions" of all notes. Each answer removes a branch of the rework.

| Decision | Options | Affects |
|---|---|---|
| **Input model** | Free text / selectable choices / hybrid | 03, 05, 20 |
| **Is the LLM required?** | Optional polish over a fully playable text game / core of the experience | 01, 05, 15, 18 |
| **What is the game about?** | Relationship drama / mystery / school-life sim / spell progression | 10, 11, 13, 15 |
| **Scope of the first slice** | e.g. one term at one school: 4 subjects, 1 castle wing, 5 to 6 NPCs, 1 arc | 09, 12, 14, 15 |
| **State model** | Plain data + pure functions, or classes with behaviour; mutate-in-place or snapshots/reducer | 06, 08, 19 |
| **Time model** | Minutes with free durations, or coarse period slots | 12, 16, 17 |
| **Simulation depth** | Light school-life loop, or real constraints (energy, curfew, presence) | 04, 10, 17 |
| **Dialogue authoring** | Authored lines selected by the engine / LLM-generated / hybrid | 05, 13 |
| **Spells' role** | Puzzle/exploration key, combat tool, social/exam currency | 11 |
| **Setting** | Licensed franchise or original world | 09, 14 |
| **Save compatibility** | Keep old saves or cut a clean v1 | 08, 19 |

My recommendation, if you want a default to react to: **hybrid input** (choices for common actions, free text for conversation), **LLM optional** with template narration, **one term as the first slice**, **plain data + effects with an effect journal**, **period-slot time**, **hybrid dialogue** (authored key facts, generated wording), and an **original setting**. These are the choices that make the game testable offline and keep the current architecture's principles intact.

## Proposed phases (for discussion)

0. **Cleanup and safety net.** Delete dead code, move `Command`, isolate test saves, add characterization tests for the **[verify]** items.
1. **Close the loops.** Relationship creation, spell learning, reveal monotonic, load rehydration, `attend`/`advance` reachability, id matching for targets, real fallback narration, timeouts. No new features.
2. **Foundations.** Content schemas and linter, world/NPC/item data, absolute time and calendar, single mutation path with an effect journal, composition root and DI.
3. **Living school.** Presence and schedules, timetable-driven classes, resources that matter, exams, a `LOOK`/choices UI.
4. **Story and depth.** Triggers from a closed vocabulary, authored beats and clues, conversation upgrades, journal, evaluation set for the parser.

## What I have not verified

- Nothing was run: no tests, no game session, no build.
- **[verify]** items above are inferred from reading and greps; they are likely but unconfirmed.
- I read most of the source for each system but not every file in full. Spell pack JSON beyond the first entries, `npc-profiles.json` beyond the first four profiles, `BlueprintSchemas.ts`, the loading screen and menu components were not read in full.
- Franchise-content notes (09, 14) are observations, not legal advice.

## Suggested next step

Answer (or override) the decision table, then I can turn phases 0 and 1 into a concrete task list, or start with the cleanup commit and the regression tests for the **[verify]** items, which need no design decisions.

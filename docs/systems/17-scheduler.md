# Scheduler (NPC Schedules & World Tick)

Files: `src/core/engine/Scheduler.ts` — **0 bytes, empty**. Nothing imports or references it. Planned in `docs/phase-2-world-dynamism.md` (sections 1 and 8, and "important systems to emphasize"). Related data that already exists: `timetables.json` (class slots, unused, see 12), `WorldClock` (see 16), `knownNPCIds` (never filled, see 14).

## What it does

Nothing yet. The intended job (from the Phase 2 design doc) is to make the world exist in place and time without the player: NPCs have daily routines, are in specific places by time block, can be busy, private, absent or hostile, get overridden by quest state and events, and things happen off-screen (an exam date approaches, two NPCs fall out, a club meets).

## What exists today in its place

- **No NPC location at all.** An NPC is a definition and a relationship record; no data says where they are (see 14).
- **No turn hook.** `GameEngine.handleCommand` advances the clock and then renders; it has no stage that reacts to time passing (see 02). The `TimeAdvanced` event exists and has no subscriber (see 07).
- **No calendar to schedule against.** The clock has no days or weekday, so a schedule keyed to "Monday morning" cannot be expressed (see 16).
- **A timetable of class slots** per day and period exists as data and is read by nothing.
- **Presence is faked in the narration.** The renderer is told every NPC the player has "known" is nearby (`knownNPCIds`, always empty), and `TALK` accepts any NPC from anywhere (see 04, 05).

## Strengths of the plan (what is already decided)

- **Right problem, right place.** Schedules are the cheapest big gain in perceived realism, and the design doc correctly says they belong in a content-backed scheduler with event-driven overrides, not a pile of `if` chains.
- **Availability tags** (open, busy, private, hostile, absent) map directly onto things the conversation system can already use (privacy, refusal).
- **Moderation principle** for off-screen change ("enough for urgency, not unfair") is a good guard rail.
- **The prerequisites for a clean design are present:** a typed bus, effects, a registry, and a pure `TurnResolver` that can query presence.

## Weaknesses (of the current state)

1. **Presence is a lookup, not a simulation.** Where an NPC is follows from the clock when asked (see 14), so nothing happens off-screen: NPCs do not act on their own, and there are no NPC routines with consequences, timed events or curfew beyond the world tick's boundary rules.
2. **The design doc is high level.** It does not define the schedule format, how a block resolves when several apply, who wins between routine and override, how presence interacts with the player's own schedule, or what "off-screen progression" looks like as data.
3. **The prerequisites are partly unfinished:** NPC introduction (14) and structured events (07) are open; presence, locations in data, the calendar and the world tick exist.
4. **Risk of performance and determinism problems if added naively:** simulating many NPCs per turn, randomness for "occasional" overrides (it must come from the turn's seeded `Random`), and long jumps in time (resting 8 hours must fast-forward correctly, not skip schedule effects; the tick already walks every boundary).
5. **Test strategy is partial.** Presence is tested (`presence.test.ts`); the schedule format and how blocks resolve have no table tests, though a schedule resolver is a pure function and ideal for them.

## Design sketch (rework)

- **Data:** each NPC gets a `routine`: a list of rules `{ days, period/time range, locationId, availability, priority, conditions }`, plus optional `homeLocationId`. Locations get tags and capacity. Special events (exam, feast, curfew inspection) are rules with higher priority that apply to groups of NPCs.
- **Resolution (pure):** `resolvePresence(npcId, time, state, registry)` returns `{ locationId, availability, reason }` by picking the highest-priority matching rule, then applying overrides from flags and story state. `npcsAt(locationId, time)` is derived from it. No stored positions are needed for routine, only for exceptions.
- **Engine integration:** add a `worldTick(prevTime, newTime)` stage after time advances. For each boundary crossed (period change, midnight, new day), it emits events and runs due scheduled effects (exams, deadlines, rumors spreading, relationship decay, an NPC's off-screen event). Long jumps iterate over the boundaries so rest and sleep behave correctly.
- **Consumers:**
  - `TALK` requires `present && available`, and returns a reason otherwise ("Professor X is teaching right now").
  - The renderer and the HUD list who is here.
  - Conversation gets availability and privacy from the resolved presence.
  - `ATTEND_CLASS` checks the timetable and the teacher.
  - A `LOOK` command reports exits, people and notices.
- **Overrides and off-screen events:** a small table of timed or conditional events (`when`, `effects`, optional `announce`), applied through `applyEffects`, so the scheduler never mutates state directly.
- **Determinism:** any randomness uses the seeded RNG from the turn context, so tests and replays match.
- **Testing:** table-driven tests for presence resolution at boundaries and across jumps; golden tests for a simulated week.

## Rework prerequisites (in order)

1. Absolute timeline and calendar (16).
2. Locations, NPC roles and routines as validated content (09, 14).
3. World-tick stage in the turn pipeline (02).
4. Presence query and its use in `TALK` and narration (04, 05, 13).
5. Off-screen events and overrides.

## Open questions

- Are schedules fixed per NPC (the same every week) or generated per term from templates by role (teacher, prefect, student of house X)?
- How many NPCs need real routines for the first playable version? Six to ten, as the design doc suggests, may already be too many for a first pass; three to four could prove the loop.
- Should the player see where someone is (a map, a tracker, a "Marauder's Map"-like item) or only discover it by looking around?
- Do NPCs ever move because of the player (following, avoiding), or only on their routine?

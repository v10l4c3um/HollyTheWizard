# World, Locations & Time

Files: `src/core/domain/world/Location.ts` (27 lines), `WorldClock.ts` (44), `Item.ts` (14), location/time fields in `GameState`, `_move`/`_rest` in `TurnResolver`, time handling in `GameEngine`, `src/core/engine/TimeCost.ts`. Location data is hard-coded in `src/bootstrap/engineFactory.ts`. Tests: the clock appears only in `persistence.test.ts`.

## What it does

Provides the "where" and "when" of the game: a graph of locations the player moves through, and a clock that advances as actions cost time. It should also be the foundation for schedules, classes, NPC presence, curfew, and the school-year calendar.

## How it works

- **Locations:** a `Location` has `id`, `displayName`, `description` and `connectedLocationsIds`. There are exactly three, created in `engineFactory`: `startingVillage` (to `forest`, `market`), `forest` and `market` (both back to the village). `GameState.currentLocationId` defaults to `startingVillage`.
- **Movement:** `MOVE` checks the destination exists and is connected, costs 5 minutes (2 on a failed attempt), and the engine then sets `currentLocationId` and records new discoveries.
- **Clock:** `WorldClock` stores one number, `minutesOfDay` (0 to 1439, starting at 8:00 AM). `advanceTime` adds minutes modulo 1440. `timeOfDay` maps hour ranges to `morning` (5-12), `afternoon` (12-17), `evening` (17-21), `night`. `getCurrentTime` formats a 12-hour string. It serialises and loads through `fromJSON`.
- **Time costs:** each command returns a `TimeCost` (`none` or `minutes`); the engine advances the clock and emits `TimeAdvanced`. `REST` takes `60 * hours`.
- **Display:** the HUD shows the time, an icon and the location; the renderer gets location, description and time of day.

## Strengths

- **Simple, understandable model** that is cheap to save and easy to reason about.
- **Time cost as data** returned by rules, applied centrally by the engine.
- **`timeOfDay` is available to narration and the HUD,** which gives the player a sense of passing time ("Time passed: 60 minutes, morning to afternoon" is passed to the narrator).
- **Movement is validated against a connection graph,** with distinct failure messages and a small time penalty for a bad move.
- **Clock normalises its input** (`setMinutesOfDay` handles negatives and overflow).
- **Discovery tracking** (`discoveredLocationIds` + `LocationDiscovered`) is a good base for exploration and map UI.

## Weaknesses

1. **The clock has no days.** `minutesOfDay` wraps at midnight and nothing counts days, weekdays, weeks, terms or years. Without a date there is no timetable (see 12), no weekly schedule, no deadlines, no curfew, no exams, no seasons or holidays, and no way to say "tomorrow". Sleeping through the night or resting 24 hours changes nothing visible. This is the most important gap in the time model, since the setting is built on a school calendar.
2. **Timestamps are not monotonic.** Conversation memory (`turnIndex`) and spell `becameAvailableAt` are set from `getMinutesOfDay()`, which resets every midnight. Ordering, cooldowns and "how long ago" cannot be computed from them, and the expiry field on scene invitations (`validUntilMinutes`) has no meaningful reference.
3. **Time has no consequences.** Night, curfew and mealtimes do nothing. Nothing is closed, NPCs do not appear or leave (see 14 and 17), energy does not drain or recover, and an action takes the same time whenever it happens. There is no concept of waiting or "until morning".
4. **The world is three locations** with one-line descriptions, none of them a school (see 09). There are no region or building levels, no doors, locks, keys or restricted areas, no hidden or secret locations, no travel time variation by distance, and no one-way connections. `startingVillage` is not in `discoveredLocationIds` at the start.
5. **Players cannot look.** There is no `LOOK`, `MAP`, `WAIT`, `WHERE` or inventory command in the intent list. The player learns exits and who is present only if the narrator mentions them, and the narrator is told nothing about exits. Failed moves cost 2 minutes and say "You can't move to X from Y" without listing options.
6. **Locations are passive descriptions.** No items to find, features to interact with, tags (public, private, classroom), capacity, ambient events, or time-dependent descriptions. `INTERACT` only acts on inventory (see 04). The class TODOs list factions, loot and restrictions, none implemented.
7. **Travel is instantaneous and unmodelled.** Moving anywhere takes 5 minutes, with no distance, encounters, or route choice, and nothing can happen on the way.
8. **Time is advanced in two places and debug logs every turn** (`[TIME DEBUG]` in the engine), and `REST` is the only way to pass time deliberately, yet it has no waiting-until semantics or interruption.
9. **Hard-coded world.** Locations are constructed in code, not from data, and the item class mixes definition and instance (see 09).
10. **No tests for the clock or movement:** wrap-around, time-of-day boundaries and move validation are untested.

## Rework ideas

- **Replace the clock with an absolute timeline:** `totalMinutes` since game start, and derive `{ year, term, week, weekday, hour, minute, period }` through pure functions. Store only `totalMinutes`. Use it for all timestamps (memory, expiry, cooldowns).
- **Build the school calendar on it:** terms and holidays, a weekly timetable (12), curfew, meal times, exams and scheduled events, and a "what is happening now" query used by every system.
- **Make time matter:** scheduled events fire on boundaries (period change, midnight, new day), through a world-tick stage in the turn pipeline (see 02 and 17). Let doors close at curfew, NPCs move on schedule, energy recover on sleep, and the day roll over with a summary.
- **Add navigation verbs:** `LOOK` (location, exits, who is here, visible items), `MAP`/`WHERE`, `WAIT [until]`, `SLEEP`, and name resolution for places (see 03). Always show exits and people in the HUD or a side panel, not only in prose.
- **Define the world in data:** locations with tags (public, private, classroom, outdoor), access rules (hours, keys, flags), travel time between nodes, features, items and ambient events. Group them into areas (castle wing, grounds) to keep the graph manageable.
- **Make description dynamic:** variants by time of day, weather, season and story state, so the same place feels different (and so the narrator receives structured scene facts, see 05).
- **Add presence as a first-class query** (`npcsAt(location, time)`), shared by conversation, narration and discovery.
- **Separate the clock from rendering** (HUD and debug logs through a logger), and unit test boundaries.

## Open questions

- How fine-grained should time be: minutes with free-form durations, or coarse slots (period of the day) as in the timetable? Slots simplify scheduling and balance, minutes feel more like a simulation.
- What scale should the map have: a handful of key places for one castle, or a larger sprawling world? A compact, dense map suits a text game.
- Should travel itself be content (encounters, shortcuts, risks), or just a time cost between places?
- Do we want weather and seasons as part of the world state?

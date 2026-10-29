# World, Locations & Time

Files: `src/core/domain/world/Location.ts` (27 lines), `WorldClock.ts` (44), `Item.ts` (14), location/time fields in `GameState`, `_move`/`_rest` in `TurnResolver`, time handling in `GameEngine`, `src/core/engine/TimeCost.ts`. Location data is hard-coded in `src/bootstrap/engineFactory.ts`. Tests: the clock appears only in `persistence.test.ts`.

## What it does

Provides the "where" and "when" of the game: a graph of locations the player moves through, and a clock that advances as actions cost time. It should also be the foundation for schedules, classes, NPC presence, curfew, and the school-year calendar.

## How it works

- **Locations:** a `Location` has `id`, `displayName`, `description`, `connectedLocationsIds` and `aliases` (nicknames such as "the hut" or "outside", matched as whole phrases by the resolver; the linter rejects two places that answer to the same name). There are exactly three, created in `engineFactory`: `startingVillage` (to `forest`, `market`), `forest` and `market` (both back to the village). `GameState.currentLocationId` defaults to `startingVillage`.
- **Movement:** `MOVE` checks the destination exists and is connected, costs 5 minutes (2 on a failed attempt), and the `LocationChanged` / `LocationsDiscovered` effects then set `currentLocationId`, mark the place visited and discover its exits.
- **Clock:** `WorldClock` stores `totalMinutes` since the start of day 1 (a Monday), starting at 8:00 AM, and never wraps. From it: `getDay()` (from 1), `getWeekday()` (a `DayOfWeek`, cycling every 7 days), `getMinutesOfDay()`, `getTotalMinutes()` and `timeOfDay` (`morning` 5-12, `afternoon` 12-17, `evening` 17-21, `night`; the first three are the timetable's `Period`s). `getCurrentTime` formats a 12-hour string. It saves as `{ totalMinutes }`, and `fromJSON` still reads the old `{ minutesOfDay }` shape as day 1.
- **Time costs:** each command returns a `TimeCost` (`none` or `minutes`); the engine advances the clock and emits `TimeAdvanced`. `REST` takes `60 * hours`.
- **Display:** the HUD shows the time, an icon, the weekday and day number, and the location; the renderer gets location, description, weekday, day number and time of day.

## Strengths

- **Simple, understandable model** that is cheap to save and easy to reason about.
- **Time cost as data** returned by rules, applied centrally by the engine.
- **`timeOfDay` is available to narration and the HUD,** which gives the player a sense of passing time ("Time passed: 60 minutes, morning to afternoon" is passed to the narrator).
- **Movement is validated against a connection graph,** with distinct failure messages and a small time penalty for a bad move.
- **Clock normalises its input** (`setMinutesOfDay` handles negatives and overflow). `WorldClock.fromJSON` reads only `{ totalMinutes }`; saves from before the calendar are refused (see 19).
- **Exploration is tracked in two lists:** `discoveredLocationIds` (found out about; you can only travel to these, and only if connected) and `visitedLocationIds` (been there). Standing in a place shows its exits, so arriving discovers them (`LocationsDiscovered`); `LocationDiscovered` / `LocationVisited` are emitted. Hidden places that something else must reveal are not authored yet.

## Weaknesses

1. **~~The clock has no days.~~ Fixed:** the clock now counts days and weekdays (see How it works). Still missing: weeks, terms, years, and anything that reads the date (timetable, schedules, curfew, exams). The original description follows. `minutesOfDay` wraps at midnight and nothing counts days, weekdays, weeks, terms or years. Without a date there is no timetable (see 12), no weekly schedule, no deadlines, no curfew, no exams, no seasons or holidays, and no way to say "tomorrow". Sleeping through the night or resting 24 hours changes nothing visible. This is the most important gap in the time model, since the setting is built on a school calendar.
2. **~~Timestamps are not monotonic.~~ Fixed:** `turnIndex` and `becameAvailableAt` now use `getTotalMinutes()`. `validUntilMinutes` on scene invitations should use the same reference when it is first used. The original description follows. Conversation memory (`turnIndex`) and spell `becameAvailableAt` are set from `getMinutesOfDay()`, which resets every midnight. Ordering, cooldowns and "how long ago" cannot be computed from them, and the expiry field on scene invitations (`validUntilMinutes`) has no meaningful reference.
3. **Partly fixed:** NPC presence and class attendance now depend on the weekday and period (night has no classes). Curfew, meals and closed places still do nothing. Original description: **Time has no consequences.** Night, curfew and mealtimes do nothing. Nothing is closed, NPCs do not appear or leave (see 14 and 17), energy does not drain or recover, and an action takes the same time whenever it happens. There is no concept of waiting or "until morning".
4. **Partly fixed:** the world now has a school wing (great hall, corridor, classroom, dungeon classroom, greenhouse, library, common room, headmaster's office, grounds, gamekeeper's hut) next to the old village, forest and market, with placeholder descriptions. A new game starts in the great hall. Original description: **The world is three locations** with one-line descriptions, none of them a school (see 09). There are no region or building levels, no doors, locks, keys or restricted areas, no hidden or secret locations, no travel time variation by distance, and no one-way connections. `startingVillage` is not in `discoveredLocationIds` at the start.
5. **Players cannot look.** There is no `LOOK`, `MAP`, `WAIT`, `WHERE` or inventory command in the intent list. The player learns exits and who is present only if the narrator mentions them, and the narrator is told nothing about exits. Failed moves cost 2 minutes and say "You can't move to X from Y" without listing options.
6. **Locations are passive descriptions.** No items to find, features to interact with, tags (public, private, classroom), capacity, ambient events, or time-dependent descriptions. `INTERACT` only acts on inventory (see 04). The class TODOs list factions, loot and restrictions, none implemented.
7. **Travel is instantaneous and unmodelled.** Moving anywhere takes 5 minutes, with no distance, encounters, or route choice, and nothing can happen on the way.
8. **Time is advanced in two places and debug logs every turn** (`[TIME DEBUG]` in the engine), and `REST` is the only way to pass time deliberately, yet it has no waiting-until semantics or interruption.
9. **Fixed:** locations are data (`world.json`). Original description: **Hard-coded world.** Locations are constructed in code, not from data, and the item class mixes definition and instance (see 09).
10. **No tests for the clock or movement:** wrap-around, time-of-day boundaries and move validation are untested.
11. **TODO: hidden places.** Every connected place is discovered the moment you arrive next to it, so discovery never gates anything beyond the graph. Planned: a `hidden` flag on locations in `world.json` that "seeing exits" skips, revealed by `LocationsDiscovered` effects from NPC conversation, lessons, items or story beats (see `Exploration.ts`).

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

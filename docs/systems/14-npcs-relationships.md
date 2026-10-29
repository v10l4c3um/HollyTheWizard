# NPCs, Profiles & Relationships

Files: `src/core/domain/npc/Npc.ts` (22 lines), `NpcProfile.ts` (17), `Relationship.ts` (36), content in `src/content/npcs/npcs.json` and `profiles.json`, state in `GameState` (`relationships`, `unlockedTopicsByNpc`, `conversationHistory`, `knownNPCIds`), registry in `Registry.ts`. The rules that use these are covered in 13 (conversation). No tests.

## What it does

Defines who the characters are (identity, voice, personality data) and how the player stands with each of them (a nine-axis relationship). It is meant to be the social layer: NPCs that remember, react and open up over time.

## How it works

- **`NPC`** (definition, in the registry): `id`, `name`, `dialogue[]` (a few sample lines "as a style guide"), `tag_description`. A commented TODO notes mood is missing.
- **`NpcConversationProfile`** (authored, in the registry): `traits`, `hardBoundaries`, `topicAffinities` (-2..+2 per topic), `locationModifiers`.
- **`RelationshipStats`** (per player and NPC, in `GameState.relationships[npcId]`): `trust`, `affection`, `respect`, `comfort`, `attraction`, `loyalty`, `resentment`, `fear`, `envy`, each clamped to -100..100 by `applyDelta`.
- **Other per-NPC state:** `unlockedTopicsByNpc`, `conversationHistory` (last 20 entries), `clues`/`rumors` keyed to a source NPC.
- **Content shipped:** six NPCs with matching profiles (Snape, Hagrid, Dumbledore, Harry, Hermione, Ron), plus a hard-coded `villager` in `engineFactory` with no profile.

## Strengths

- **Definition and state are separated:** static NPC and profile data in the registry, only relationship numbers and history in the save.
- **A rich relationship vocabulary.** Nine axes can express friendship, rivalry, fear, romance and resentment, and `applyDelta` clamps correctly (the one stat class that does).
- **Authored personality is data** with a simple, understandable shape: traits, boundaries, topic and location preferences. Writers can add characters without touching code.
- **Profiles exist for every shipped NPC,** and ids match across the two packs.
- **Memory is bounded and structured,** so it can feed future systems (gossip, grudges, callbacks).

## Weaknesses

1. **NPCs cannot be introduced.** `knownNPCIds` is never written, so no one is ever "met". There is no first-meeting event, no discovery by location, and no list of reachable characters. The campaign blueprint reads the registry's full NPC list and `knownNPCIds` (always empty), so story roles are assigned to people the player has not met.
2. **Initial relationship data is ignored.** Each NPC in `npcs.json` has an `affinity` number (85, 90, ...) that the `NPC` class does not declare, and nothing reads it. It looks like the intended starting disposition, but the semantics are unclear (Snape 85 toward the player?), and it conflicts with a model that starts at zero.
3. **Characters are thin.** An NPC is a name, three sample lines and one tag sentence. There is no role (teacher, student, staff), house or year, age, appearance, goals, secrets, knowledge, or relationships with other NPCs. Nothing lets one NPC react to what happened with another, so the world has no social graph.
4. **No NPC state over time.** No mood, no goals, no memory of the world beyond conversations, no change between years. Students do not progress, teachers do not change, and relationships have no decay or growth outside conversations.
5. **Profile traits are loose.** `traits` are an unstructured list used in one hard-coded check. (Topic and place ids in profiles are linted.)
6. **Voice is under-specified.** The `dialogue` array is a few quotes, without constraints (register, vocabulary, verbal tics, taboos), and nothing forces the narrator to use it (the renderer prompt does not include it, see 05).
7. **Naming and shape inconsistencies.** `tag_description` is snake_case in a camelCase codebase, `NPC` and `NpcConversationProfile` split what is one concept in two registries, and `Relationship` versus `RelationshipStats` are redundant.
8. **Relationship axes lack meaning in play.** Only trust, affection and resentment/fear are read by the conversation rules. `respect`, `attraction`, `loyalty`, `envy` and `comfort` are written occasionally or never read. There are no thresholds with consequences (friend, rival, ally), no UI to see standing, and the player cannot infer the state except through narration tags the narrator does not receive.
9. **Franchise content.** The six NPCs and their quotes are existing franchise characters, which affects what can be published; the system should work with any cast.
10. **Testing.** Profile loading and presence are tested (`npc-content.test.ts`, `presence*.test.ts`); stat clamping and relationship round-trips are not.

## Rework ideas

- **Make relationships real:** create the record when an NPC is first met (seeded from the NPC definition's starting stats, replacing the loose `affinity`), rehydrate it properly on load, and cover it with tests (shared with 06, 08 and 13).
- **One NPC model.** Merge `NPC` and `NpcConversationProfile` into a single validated `NpcDefinition` (identity, role, traits, voice guide, starting relationship, boundaries, topic affinities, home and schedule, knowledge/secrets), and delete the unused `Relationship` class.
- **Introduce NPCs through play:** a `Met` state, first-meeting scenes and events, the `knownNPCIds` list maintained by an effect (`NpcMet`), and a journal or contacts UI listing who you know and where they usually are.
- **Add presence:** a schedule per NPC (slots from the same timetable concept as 12), a world-tick that updates `npcLocations`, and rules that `TALK` requires the NPC to be here and available. Let the player find people by looking around.
- **Resolve names properly** (display name, nicknames, titles) so "talk to Snape" works (see 03).
- **Give NPCs goals and state:** mood, current concern, secrets the story can unlock, and relationships between NPCs so gossip, jealousy and alliances can emerge.
- **Define what each axis does** and cut the rest, or tie each to concrete outcomes (an ally helps, a rival sabotages), and display standing qualitatively to the player.
- **Make voice usable:** a compact voice spec (register, verbal habits, forbidden phrases), included in the narrator prompt and checked by the dialogue system (see 05 and 13).
- **Validate content** (Zod, cross-reference topics and locations) and keep franchise names in a swappable pack.

## Open questions

- How large is the cast, and how deep is each character? A small cast with real schedules, secrets and arcs usually beats many thin ones.
- Do NPCs act on their own (move, talk to each other, change over the years), or only react to the player?
- Is a nine-axis relationship model worth its complexity, or would four to five axes (trust, affection, respect, resentment, plus a romance track if kept) suffice?
- Should NPC data be authored by hand, generated by the LLM at campaign start under constraints (like the blueprint), or both?

## Aliases

`NPC.aliases` holds in-world epithets ("the boy who lived", "the gamekeeper"). They are matched by the resolver (`EntityMatcher`) as **whole phrases only**, never by one of their words, so a common word can't pull in the wrong NPC. Keep them few and distinctive: `npc-content.test.ts` enforces at most two per NPC and no collision with any other NPC's id, name or alias. NPCs load from JSON without validation, so code reads `npc.aliases ?? []`.

## Where NPCs are

`NPC.schedule = { home, attendsClasses?, teaches?, slots? }`; `Presence.npcLocation` resolves it in this order: a timetabled class the NPC attends or teaches (that class's room), the first matching slot (`days` and `periods` omitted mean any; `night` is a period here), then `home`. An NPC with no schedule is nowhere. `npcsAt` lists who is in a place; the narrator's "nearby" list is built from it. Content check: every NPC needs a schedule, and its places and taught subjects must exist.

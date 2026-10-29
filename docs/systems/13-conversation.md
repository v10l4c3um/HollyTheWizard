# Conversation System

Files: `src/core/domain/npc/Conversation.ts` (503 lines), `ConversationTypes.ts`, `TopicRegistry.ts` (134), `NpcProfile.ts` (17), `Relationship.ts`. Caller: `TurnResolver._talk`. Content: `src/content/packs/npc-profiles.json`. No tests found for it (no test file mentions conversations).

## What it does

Decides, with rules and no LLM, how an NPC reacts when the player talks to them about a topic. The result is one of six outcomes (`refusal`, `deflection`, `partial`, `success`, `reveal`, `invitation`), a list of effects (relationship changes, unlocked topics, clues, rumors, scene invitations, memory entries), and `narrationTags` for tone. The LLM never decides the outcome.

## How it works

`evaluateConversation(ctx)` is a pure function over a `ConversationContext` (NPC id, topic and its definition, NPC profile, relationship stats, privacy, location, flags, last conversation entries, recent event strings, clock minutes).

Hard gates return immediately:

1. NPC `hardBoundaries` contains the topic: refusal (+1 resentment).
2. The topic's `minTrust`, `minAffection` or `requiresFlags` are unmet: deflection and sets a `deflected.<npc>.<topic>` flag.
3. Hostility (`resentment + fear >= 40`): refusal.
4. Pushing a topic that was just deflected: refusal (+3 resentment, -2 trust, flag consumed).

Otherwise a score is accumulated:

3. Location fit: -1 or +1 against `topicDef.locationRelevance`.
4. Relationship: trust tier (high +2, moderate +1, low -1), high affection +1, wary -1, private and not-low trust +1.
5. History: repeat of a topic in the last 3 entries (-1 or -2), respectful handling after a refusal (+1), any earlier reveal (+1).
6. Event mood: recent facts nudge +1 (a spell mastered, new places seen on arriving, a lesson attended).
7. Profile: the NPC's `topicAffinities[topic]` and `locationModifiers[location]`.
8. Mapping: `<= -2` deflection, `-1..0` partial, `1..2` success, `3` reveal, `4+` invitation (private and affection >= 30) or reveal.

Each outcome emits effects (a trust gain on success, topic unlock on partial/success, a clue on reveal, a scene invitation, always a memory entry). `TurnResolver` applies them, emits five bus events, and passes only a one-line summary to the renderer.

## Strengths

- **A real, readable rule engine.** Pure, deterministic, ordered phases with clear comments. This is the most developed gameplay system in the project, and the clearest expression of the "engine decides, LLM narrates" idea.
- **Hard gates before scoring** make boundaries and consequences predictable, and "pushing after a deflection" is a nice social rule.
- **Memory with bounded history** (20 entries) gives conversations continuity: repeat questions are penalised, respect after refusal is rewarded.
- **Authored personality is separate data** (`NpcConversationProfile`: traits, boundaries, topic affinities, location modifiers), so characters can differ without code.
- **Outputs are effects and tags,** so the evaluator has no side effects and is trivially testable.
- **Topic metadata** (category, sensitivity, minimum trust and affection, required flags, relevant locations) is a good vocabulary for a social system.
- **Six outcomes** give a useful ladder from refusal to invitation that the narrator can color.

## Weaknesses

1. **The upper rungs of the ladder take many conversations.** Relationship records are created on the first talk and every outcome moves trust (table below), but with trust near 0 the tier is `low` (-1 score), so an open topic with no profile modifiers yields `partial`. `success` needs a score of at least 1, `reveal` 3, and `invitation` 4 with affection of 30; topics with a `minTrust` (family, gossip, romance, dark arts) deflect until trust reaches it.
2. **No content behind the outcomes.** A reveal creates a clue id (`<npc>.<topic>`) and a rumor id, but nothing defines what the clue or rumor says, what it unlocks, or how it ties to the campaign blueprint's `clueSeeds`. The player is told "you learned something significant" with no information. Dialogue is invented by the narrator (see 05), so what the NPC says need not match the clue.
3. **Unused fields.** `sensitivity` and `cooldownTurns` are never read, `traits` is used only for one academic check, `requiresFlags` has no flags producing them, and `romance` + `romantic_adjacent` + `romanceIntensity` exist with no behavior. Relationship axes `attraction`, `loyalty`, `envy` and `comfort` are barely used.
4. **Conversation is one verb and one roll.** "Talk to X about Y" costs a fixed 15 minutes and resolves in one step. There is no back and forth, no choice of tone (kind, direct, flattering), no way to ask follow-ups, give gifts, share a secret or make a promise, and nothing the player does within the conversation changes the outcome. The only lever is topic choice. Success is largely determined before the player speaks.
5. **Flat, small numbers and opaque scoring.** Score runs about -4 to +4, thresholds are magic numbers, and tier cutoffs (15/40, 10/30, 20/40) are scattered inline. The player gets no feedback on why a conversation went the way it did (the tags go to the narrator, but the narrator never receives them). Balance cannot be tuned without editing code.
6. **No NPC state beyond relationship.** No mood, busyness, knowledge of events, or secrets keyed to world state. The NPC cannot refuse because they are in a hurry, nor react to something the player did that day beyond the recent-facts nudge. (Where an NPC is follows its schedule.)
7. **Repetitive code.** `buildOutcome` repeats the memory-entry construction six times, the "deflect flag" key is computed twice, and the first-contact fake relationship in the `talk` rule (with a no-op `applyDelta`) bypasses the real type.
8. **Narration coupling is one-way.** The evaluator computes rich tags and the renderer receives none (see 05); the player gets one canned sentence per outcome.

## Rework ideas

- **Get the loop working first:** create relationships on first contact, give first-meeting and baseline values from the NPC profile, and verify with a test that two or three good conversations move an NPC from `partial` to `success` and eventually `reveal`.
- **Typed topics, not free text.** Have the player choose from topics they know (a menu of unlocked and visible topics per NPC, or match free text to topic ids with fuzzy matching and aliases), and show the available ones in the UI. This makes gating, discovery and progress legible.
- **Add content for outcomes:** authored clue and rumor definitions (text, source NPC, unlocks, link to blueprint seeds), plus authored dialogue lines per outcome and tone that the narrator rephrases instead of inventing.
- **Introduce player intent/tone** per turn (friendly, probing, persuasive, honest) with its own modifiers, so the player can choose how to approach, not only what to ask.
- **Make the score explainable.** Return the list of contributing factors (`+1 location fit`, `-1 low trust`), expose it in a debug view, and optionally as a hint to the player ("she seems wary").
- **Replace magic numbers with data** (thresholds in a config object or in the NPC profile), and compute tiers in one place.
- **Align world and content:** topic location relevance should use location tags (`classroom`, `public`, `private`) defined on `Location` data, not specific ids.
- **Add NPC state:** mood, availability and per-NPC knowledge, tied to the scheduler (see 17), so that talking is possible only when the NPC is present and receptive.
- **Pass the facts to the renderer:** result, tags, topic, score factors and the exact clue text revealed.
- **Refactor `buildOutcome`** into a table of outcome definitions, and add table-driven unit tests for each phase.
- **Consider multi-turn scenes:** a conversation as a short state machine (opening, topic, response, close) with two or three player choices, so the system supports invitations and scene types already in the data model.

## Open questions

- Is conversation the heart of the game (relationship sim, with secrets and romance)? If so it deserves multi-step interaction, authored content and a visible relationship UI; if not, the current single-roll model might be enough but needs trimming.
- Should NPC dialogue be fully authored (selected by the engine), fully generated, or hybrid (authored key facts, generated wording)?
- How should romance and `romanceIntensity` be scoped, and should it exist in the first version?
- Do we want the player to see the numbers (relationship bars) or only qualitative cues?

## Trust per outcome

Every conversation moves trust (`TRUST_DELTA` in `Conversation.ts`, one place to tune):

| outcome | trust |
|---|---|
| partial (neutral) | +0.5 |
| success, reveal, invitation | +2 |
| deflection | -1 |
| refusal (hard boundary, hostility, pushing after a deflection) | -2 |

Pacing: plain chats take about 30 talks to reach the "moderate" tier (15 trust); a topic the NPC likes takes roughly 8. Repeating the same topic quickly scores lower, so it falls back to +0.5.

# Phase 2 — World Dynamism

Phase 2 is where the game starts to feel alive. Phase 1 gives you a stable engine and a reliable core loop. Phase 2 turns that core into a living school world with moving people, evolving relationships, emerging consequences, and the first real sense that the player is part of an institution with its own rhythm and secrets.

The focus of this phase is not raw content volume. It is **reactivity**. The world should begin reacting to time, choices, presence, absences, loyalties, mistakes, and discoveries. This is also the phase where your game begins to feel much less like a static interactive fiction shell and much more like a proper RPG simulation.

## Core objective

Build a dynamic world layer where:

- NPCs have schedules and availability
- relationships evolve over time and through interaction
- events and systems react to what the player has done
- quests become more structured and branch-capable
- intrigue and mystery arcs start to progress through triggers and reveals
- recaps and journal features help the player keep track of a growing world

By the end of this phase, the player should feel that missing an afternoon, choosing one person over another, or breaking curfew actually changes what the world offers back.

## Main architectural outcome

At the end of Phase 2, the engine should no longer feel purely transactional. It should support:

- scheduled NPC movement and routines
- event-driven secondary effects
- relationship state transitions
- multi-stage quest progression
- arc-based narrative escalation
- world-side reactions independent of direct player input

This phase makes the engine deeper without breaking the deterministic principles established earlier.

## What Phase 2 should include

### 1. NPC schedules and presence

The biggest leap in perceived world realism often comes from schedules. Instead of NPCs existing in a vacuum whenever the player wants them, they should now exist in place and time.

Each major NPC should have:

- default daily schedule
- location by time block
- exceptions driven by quest state or special events
- availability tags such as busy, private, open, hostile, absent
- occasional dynamic overrides from the scheduler

This allows scenes such as:

- a teacher only being available in office hours
- a rival appearing in the training chamber after class
- a quiet student becoming easier to talk to in the library at night
- a suspicious professor disappearing during key mystery beats

Architecturally, this usually belongs in a scheduler system backed by content definitions plus event-driven overrides.

### 2. Event bus and reaction model

If Phase 1 included light event handling, Phase 2 should make events central. Once systems start reacting to each other, direct coupling becomes expensive and fragile.

You should formalize domain events like:

- `ClassAttended`
- `CurfewBroken`
- `ConversationCompleted`
- `SecretDiscovered`
- `SpellMasteryIncreased`
- `RelationshipChanged`
- `QuestStageAdvanced`
- `RestrictedAreaEntered`

Then add handlers that respond to them in separate modules.

Examples:

- breaking curfew may increase suspicion from authority figures
- mastering a spell may unlock a professor follow-up scene
- repeated library visits may surface a rumor event
- helping an NPC may alter trust and also trigger a side quest

This event-driven shape is what keeps the architecture scalable as system interactions multiply.

### 3. Relationship engine, version 1

Relationships should now become a genuine subsystem rather than placeholders. Avoid reducing them to a single number.

A good early multi-axis relationship model includes:

- trust
- affection
- admiration
- comfort
- suspicion
- resentment
- attraction
- loyalty

Not every NPC needs to use every axis equally, but the model should allow it.

Important design suggestion:

- treat relationship change as a formal effect with typed causes
- keep a small relationship history log for explainability
- distinguish between temporary mood changes and persistent bond changes

For example, an NPC may be irritated today but still fundamentally trust the player.

### 4. Social scenes and conversation outcomes

Phase 2 is a good time to make conversations mechanically meaningful.

Conversation resolution can consider:

- current relationship state
- recent shared history
- NPC traits and boundaries
- topic relevance
- current mood or recent events
- location context

Possible outcomes include:

- relationship shifts
- clue reveal
- topic unlock
- invitation to a later scene
- refusal or deflection
- rumor gain
- romance flag progression for adult characters if applicable later

The key is that conversations should stop being decorative and start becoming one of the main ways the player shapes the world.

### 5. Structured quest system

Phase 1 only needs flags. Phase 2 should introduce proper staged quests.

A Phase 2 quest model should support:

- entry conditions
- visible and hidden objectives
- current stage
- branching conditions
- rewards or consequences
- involved NPCs
- optional failure or timeout states

Not every quest must be huge. Even small quests become more satisfying when they are staged, reactive, and connected to world systems.

Examples:

- help a classmate recover a forbidden book before a professor notices
- investigate strange activity near a greenhouse over several evenings
- prepare for a practical exam while juggling a rumor about missing records

The moment quests begin responding to schedules and relationships, the game starts to feel much deeper.

### 6. Intrigue and mystery arcs, version 1

This phase is where long-form narrative structure starts to matter. The best approach is not to make one giant mystery blob. Instead, create arcs with progressive reveals.

A basic arc design should include:

- theme or premise
- key characters and factions
- hidden truth
- reveal ladder
- trigger conditions
- escalation thresholds
- one or more climax paths

A reveal ladder is especially important. The player should not uncover the truth all at once. They should move through layers of understanding.

Example ladder:

- rumors of unusual lights
- records showing a sealed chamber was recently accessed
- an NPC behaving evasively around that area
- evidence tying an old school incident to current events
- revelation that the chamber protects or conceals something larger

This kind of pacing makes intrigue satisfying.

### 7. Recap, journal, and memory aids

By Phase 2, the player can no longer reasonably remember everything unaided. The game should start helping.

Useful additions:

- a journal that records recent major actions
- quest log summaries
- known clues and rumors list
- relationship notes or status hints
- optional end-of-day recap

If AI is used here, it should summarize from structured state, not invent facts. A journal is one of the best places to use AI for flavor while keeping state deterministic.

### 8. World-side progression independent of the player

A more alive world means some things happen even if the player does nothing about them.

Examples:

- a professor grows suspicious after repeated incidents
- two NPCs have a falling out
- a club meeting happens without the player
- an exam date approaches
- a secret faction advances its own plan off-screen

This can be implemented through the scheduler, timed arc triggers, and background event tables. The important thing is moderation. Too much off-screen change can feel unfair. Enough to create urgency and realism is ideal.

## Suggested scope for Phase 2

A strong scope for this phase might include:

- 6 to 10 major NPCs with schedules
- 3 to 5 multi-stage quests
- 1 or 2 intrigue arcs with reveal ladders
- a functional relationship engine
- a journal or recap system
- at least one rule-driven curfew or discipline mechanic

That is enough to create the feeling of a living institution.

## Important systems to emphasize in code

Phase 2 should strengthen these modules:

- `core/engine/Scheduler`
- `core/engine/EventBus`
- `core/domain/npc`
- `core/domain/quest`
- `core/domain/relationship`
- `core/application/queries` for journal and status views
- `ai/narration/ContextAssembler`

The scheduler and event bus are especially critical here.

## Design suggestions and best practices for Phase 2

### Keep scheduling data-driven

Do not hardcode NPC movement logic in giant `if` chains. Let content define routines, and let the scheduler apply overrides.

### Separate triggers from narration

An intrigue reveal should unlock because the engine says so, not because the AI happened to mention it.

### Keep relationships explainable

If trust changed, you should be able to point to why. Debuggability matters here because social systems are otherwise hard to tune.

### Avoid pure checkbox conversations

Conversation outcomes should feel contextual, not like selecting the mathematically optimal line every time.

### Introduce uncertainty carefully

It is fine for the player to not know every hidden variable, but the consequences should still feel fair and interpretable.

### Build recaps from formal events

Whether deterministic or AI-assisted, recaps should be grounded in event history and current quest state.

## Risks to avoid in Phase 2

Common failures in this phase include:

- adding too many NPCs before schedules are robust
- making relationships change too abruptly
- letting intrigue arcs advance without clear triggers
- tying too much to opaque random tables
- creating so many reactive systems that balancing becomes impossible
- relying on AI to remember clues instead of formal state

The solution is almost always the same: encode important facts structurally, then narrate them richly.

## Definition of done for Phase 2

Phase 2 is complete when the player can experience a believable day-to-day world where:

1. NPCs are in different places at different times
2. conversations affect relationships and future availability
3. quests can progress in multiple stages
4. at least one intrigue arc reveals itself over time
5. the world reacts to actions like sneaking, studying, helping, or neglecting
6. the player can consult a journal or recap to understand recent developments

When those pieces work together, the game starts to feel genuinely alive.

## Suggested implementation order

A practical build order for this phase is:

1. formalize domain events
2. implement scheduler and NPC routines
3. add basic relationship axes and update rules
4. improve conversation resolution
5. introduce staged quests
6. add intrigue arcs and reveal ladders
7. build journal and recap views
8. tune pacing and fairness through playtests

This order keeps the world legible as it becomes more complex.

## Final guidance for this phase

Phase 2 is about the difference between a world the player visits and a world the player inhabits. If you make time, presence, relationships, and consequences matter, then even small content packs will feel surprisingly rich. The game does not need massive scope yet. It needs a sense that people live here, secrets move here, and the player’s actions ripple outward.

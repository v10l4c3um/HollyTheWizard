# Gradual conversion plan: From “many specific events” → “events + effects + derived milestones”

This plan assumes you already have:

- an Engine → Resolver → Renderer loop
- a `TypedBus<GameEvents>`
- current gameplay events like `LessonAttended`, `SpellPracticed`, `AttributeGained`, etc.

The goal is to evolve (without a rewrite) toward a Phase-2-ready shape:

**Action resolution emits a small set of “what happened” events → independent systems react and output Effects → one central EffectApplier mutates state → optional derived milestone events are emitted.**

That keeps systems decoupled, prevents “listener explosion,” and makes it easier to add new mechanics without inventing new event types each time.

---

## Step 0 — Define target responsibilities (no code change yet)

Decide and document these boundaries (they become your team contract):

- **Resolver**: decides outcomes deterministically, emits *cause events*.
- **Systems/Reactors**: listen to cause events and produce *effects*.
- **EffectApplier**: applies effects to the canonical `GameState` and may emit *derived milestone events* (threshold crossings).
- **Renderer/Narrator**: uses (events + effects + state) to describe the outcome.

If you keep those responsibilities crisp, you’ll stop feeling like you must predict every quest/listener case.

---

## Step 1 — Introduce an `Effect` model (additive)

Add a new type that represents canonical state changes in a uniform way.

Recommended minimal effect set (Phase 2-friendly):

- `ProgressDelta(track, delta, reason, tags?)`
- `AttributeDelta(attributeId, delta, reason, tags?)`
- `ResourceDelta(resourceId, delta, reason, tags?)` (energy/stress/reputation/suspicion)
- `RelationshipDelta(npcId, axis, delta, reason, tags?)`
- `FlagSet(flagId, value, reason, tags?)`
- `InventoryDelta(itemId, delta, reason, tags?)`

Do **not** apply effects in the listeners. Listeners should only *return* effects.

**Deliverable:** `effects.ts` with `GameEffect` union + helper constructors.

---

## Step 2 — Add a central `applyEffects(state, effects)` (additive)

Implement an EffectApplier that:

- takes `GameState` and `GameEffect[]`
- applies them in order (or grouped by type)
- returns updated state
- optionally returns a list of “derived events” (next step)

At this step, you can apply effects directly without emitting new events.

**Deliverable:** `applyEffects()` plus unit tests for each effect type.

---

## Step 3 — Add “derived milestone” detection *inside* the EffectApplier

This is where you eliminate a lot of manual event wiring.

Examples:

- When `ProgressDelta(track="spell.<id>.proficiency")` causes value to cross `learnedThreshold`, emit `SpellLearned`.
- When proficiency crosses `masteredThreshold`, emit `SpellMastered`.
- When relationship crosses a milestone band, emit `RelationshipMilestoneReached` (optional).

Key rule:

- **Resolvers shouldn’t emit `SpellLearned`/`SpellMastered` directly** (unless you’re in the middle of migration). They should emit the action event and/or a check event. The EffectApplier derives “learned/mastered” from the resulting state.

**Deliverable:** derived milestone emission in `applyEffects()`.

---

## Step 4 — Introduce a small set of “cause events” and start shifting logic to systems

Right now, some of your events are “effect-like summaries” (they include deltas and new totals). Begin shifting those responsibilities.

### 4A. Keep (good “cause events”)

Keep these as events because they describe meaningful happenings:

- `LessonAttended`
- `LessonSkipped`
- `NpcTalkedTo`
- `LocationVisited`
- `LocationDiscovered`
- `TimeAdvanced`
- `YearAdvanced`
- `BlueprintGenerated`
- `BlueprintMilestoneReached`

These are excellent triggers for independent systems.

### 4B. Begin deprecating (convert to effects)

Gradually stop relying on these as events in gameplay logic:

- `AttributeGained` → becomes `Effect: AttributeDelta`
- `QuestFlagSet` → becomes `Effect: FlagSet`
- `SubjectStudied` (as currently shaped) → becomes `Event: SubjectStudied` **without totals**, plus `Effect: ProgressDelta(track="subject.<id>.knowledge")`

Why: events should not need to carry “newValue” totals; totals are state. Effects carry deltas.

**Deliverable:** a migration note in code comments: “deprecated as event; prefer effects.”

---

## Step 5 — Add 3–5 Phase-2 systems (reactors) that produce effects

Create a simple pattern:

- `class SomeSystem { register(bus, effectCollector) }`
- system listens to a small subset of events
- system returns/collects `GameEffect[]`

Start with systems that are broadly useful:

### 5A. LearningSystem

Listens to:

- `LessonAttended`
- `SpellRevealed` (optional)
- `SpellPracticed` (if you keep it temporarily)

Outputs:

- `ProgressDelta` (subject knowledge, spell proficiency)
- maybe `AttributeDelta` if attributes increase slowly

### 5B. FatigueSystem

Listens to:

- `LessonAttended`, `LessonSkipped`
- practice/study actions
- `TimeAdvanced`

Outputs:

- `ResourceDelta(energy)`
- `ResourceDelta(stress)`

### 5C. ExplorationSystem

Listens to:

- `LocationVisited`

Outputs:

- `FlagSet(location.<id>.first_visit)` (if you want explicit flags)
- potential `ProgressDelta(track="exploration")` or “curiosity” resource

### 5D. SocialSystem (light)

Listens to:

- `NpcTalkedTo`

Outputs:

- `RelationshipDelta` (trust/affinity)

### 5E. YearStartSystem

Listens to:

- `YearAdvanced`
- `BlueprintGenerated(scope="year")`

Outputs:

- `FlagSet(year.<n>.started)`
- scheduling or unlock flags

**Deliverable:** 3–5 systems + tests that “given event X, produces effects Y.”

---

## Step 6 — Add a lightweight `ActionResolved` event (recommended)

Right now you have many highly specific events (good for readability), but you’ll eventually want one broad hook.

Add an event like:

- `ActionResolved { actionType, locationId, outcome, tags, visibility? }`

You do **not** need to delete your specific events. You can emit both during migration.

Why it helps:

- generic systems (rumors, suspicion, achievements, analytics, generic triggers) can listen to one event
- you avoid inventing new event types whenever you add a new verb

**Deliverable:** `ActionResolved` event + emitted from every command.

---

## Step 7 — Tighten your existing events by removing “effect totals” over time

As the EffectApplier becomes the canonical state mutation path, your events should carry:

- ids
- context
- outcome
- tags

…and not carry “new totals.”

For example, evolve:

- `SubjectStudied { subjectId, knowledgeGain, totalKnowledge }`

into:

- `SubjectStudied { subjectId, method: "reading"|"practice"|..., intensity }`

Then the LearningSystem computes deltas and emits effects.

This ensures you have one source of truth (state), rather than event payloads duplicating state.

---

## Step 8 — Recommended subsets (Actions and Events)

### 8A. Recommended *Action* subset (Phase 1/early Phase 2)

Keep your action set small and orthogonal. A strong starter set:

- `ATTEND_LESSON(subjectId, lessonId)`
- `STUDY(subjectId, minutes|intensity)`
- `PRACTICE_SPELL(spellId, minutes|attempts)`
- `VISIT_LOCATION(locationId)`
- `TALK_TO_NPC(npcId, topic?)`
- `REST(minutes|untilNextBlock)`
- `SAVE(slot)` / `LOAD(slot)`

You can add duels, sneaking, item use later.

### 8B. Recommended *Event* subset (cause events)

These are the events you want most systems to listen to:

- `ActionResolved`
- `LessonAttended` / `LessonSkipped`
- `SubjectStudied` (without totals)
- `LocationVisited` / `LocationDiscovered`
- `NpcTalkedTo`
- `TimeAdvanced`
- `YearAdvanced`
- `BlueprintGenerated` / `BlueprintMilestoneReached`

### 8C. Recommended *derived milestone events*

Emit these from EffectApplier (threshold crossings):

- `SpellLearned`
- `SpellMastered`
- optionally `AttributeMilestoneReached`
- optionally `RelationshipMilestoneReached`

These should not be the primary “cause events.” They are “state has reached a new band.”

---

## Step 9 — Where your existing events fit after migration (quick mapping)

- `AttributeGained` → becomes `Effect: AttributeDelta` (optional derived event when crossing a milestone)
- `SubjectStudied` → keep as event but drop `totalKnowledge`; compute totals from state
- `SpellPracticed` → either replace with `ActionResolved(PRACTICE_SPELL)` + `CheckResolved`, or keep temporarily but remove `proficiency`
- `QuestFlagSet` → becomes `Effect: FlagSet` (quests later)
- `QuestActivated/Completed` → can remain as events, but later will be driven by quest state machine / predicates

---

## Step 10 — Definition of done for this conversion

You’re “done” (for Phase 2 readiness) when:

- at least 60–80 percent of state mutation happens via `applyEffects()`
- most systems produce effects instead of mutating state directly
- `SpellLearned/SpellMastered` are derived from progress thresholds, not manually emitted
- your renderer can show: (action outcome) + (effects summary)
- adding a new subsystem does not require editing resolvers

---

## Notes on migration strategy (to keep velocity)

- Don’t do a big bang rewrite.
- Emit both old and new events during transition if needed.
- Move one subsystem at a time (learning first, then fatigue, then social).
- Keep a debug mode that prints “events emitted” and “effects applied” for one turn—this will save you hours.

---

## Optional: Phase-2 “RuleViolated” addition (when you introduce curfew/restricted rules)

Once you have curfew/restricted areas, add a cause event:

- `RuleViolated { ruleId, severity, locationId, visibility }`

This prevents dozens of special-case events later. Many systems can react to it generically (authority suspicion, patrol scheduling, reputation, NPC trust).

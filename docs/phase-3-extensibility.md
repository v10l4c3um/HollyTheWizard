# Phase 3 — Extensibility

Phase 3 is where the project stops being only a game and starts becoming a **game platform**. By this point, the deterministic core should be stable and the world should already feel reactive. Now the priority shifts toward making future growth cheaper, safer, and more modular.

This is the phase where you deliberately invest in systems that reduce future rewrite pressure. That includes content packs, hook systems, provider abstraction maturity, versioning, migration support, and internal tooling. The purpose is not abstraction for its own sake. The purpose is to make adding new schools of magic, quests, romance arcs, mystery modules, and even entirely new subsystems feel routine instead of painful.

## Core objective

Build an architecture that allows the project to grow through:

- data-driven content packs
- reusable rule hooks
- pluggable AI providers and fallback strategies
- versioned save and content schemas
- safer loading and validation boundaries
- tooling for content authors and future contributors

By the end of this phase, the codebase should be ready to expand significantly without every feature becoming a custom engineering problem.

## Main architectural outcome

At the end of Phase 3, the project should support:

- content being loaded from multiple packs
- rules reacting through hook registration rather than core edits alone
- alternative providers for narration and possibly storage or logging
- save migration strategies
- internal APIs stable enough for future plugins
- a clearer separation between engine code and game-specific content

This phase creates leverage.

## What Phase 3 should include

### 1. Content pack architecture

Content packs are the most important extensibility feature to build first. They let you separate engine capability from game-specific material.

A content pack should be able to define or contribute:

- spells
- items
- locations
- NPCs
- schedules
- quests
- plot arcs
- encounter tables
- dialogue topics
- relationship events
- style and lore snippets for narration support

Each pack should have a descriptor with fields like:

- id
- version
- dependencies
- compatibility range
- exported content blocks
- optional hooks or registrations

This makes the content system composable rather than monolithic.

### 2. Content registry and merge rules

Once multiple packs exist, you need a registry that loads and merges them predictably.

Important decisions:

- how duplicate ids are handled
- whether packs may override content intentionally
- how dependencies are resolved
- how load order is determined
- how conflicts are reported

Do not leave this ambiguous. Pack loading needs deterministic rules or debugging becomes miserable.

A sensible approach is:

- require globally unique ids by default
- allow explicit override declarations if needed later
- load dependencies first
- fail fast on unresolved or incompatible packs

### 3. Schema validation and static safety

Extensibility is only useful if malformed content can be caught early. Every externalized content block should be validated before the game starts.

Use runtime schemas for:

- spells
- quest definitions
- locations
- NPC schedule entries
- relationship event templates
- pack manifests

Validation should be strict and user-friendly. The more content becomes data-driven, the more important diagnostic quality becomes.

### 4. Rule hooks

Rule hooks are the next level after data-driven content. They allow content or modules to react to events without rewriting core engine files.

A hook may specify:

- which event or lifecycle point it listens to
- conditions under which it activates
- effects it applies
- priority or ordering rules

Example use cases:

- when the player learns an advanced warding spell, unlock a hidden library event
- during a festival week, increase social encounter odds in the courtyard
- if suspicion exceeds a threshold, intensify patrol events at night
- if trust and attraction are both high enough for an adult NPC, mark a relationship milestone as available

Hooks create flexibility while preserving deterministic control.

### 5. Provider abstraction maturity

By Phase 3, the narration provider should be more than a simple adapter. It should become a robust subsystem.

You should support:

- multiple AI providers behind a common interface
- provider-specific configuration
- graceful failover and fallback narration
- optional caching of repeated prompts
- test doubles and offline simulation

If costs or latency become concerns, this phase is also a good time to introduce context compression, summary memory, and prompt versioning.

### 6. Prompt and context versioning

As the game grows, prompts become part of your application contract. Changing them carelessly can create output drift or subtle regressions.

Version:

- prompt templates
- narration styles
- summary strategies
- output parsing rules

This becomes surprisingly important once you start tuning tone and consistency across many scene types.

### 7. Save schema versioning and migrations

This is one of the least glamorous but highest-value investments in the whole project.

Once content packs, new systems, and evolving state models arrive, save files will drift. Plan for this early.

A good migration strategy includes:

- save schema version on every snapshot
- one-direction upgrade functions between versions
- test fixtures for old save samples
- explicit handling of removed or renamed content ids
- diagnostics when a save depends on unavailable content packs

If you skip this, every refactor becomes scary.

### 8. Internal tooling for content authorship

As soon as content grows, authoring ergonomics start affecting delivery speed. Phase 3 should invest in basic tools.

Useful tools include:

- content validation CLI command
- pack dependency checker
- spell or quest linter
- reference finder for ids and dependencies
- test harness for loading only selected packs
- debug command to inspect current state, active hooks, and triggered arcs

Even modest tooling pays off quickly.

### 9. Stable internal extension APIs

You do not need a full public modding SDK yet, but you should begin stabilizing internal contracts.

The most important extension interfaces are likely:

- content pack manifest interface
- hook registration interface
- narration provider interface
- repository interface
- renderer extension points if the CLI grows richer

Keep them documented. Future growth becomes much easier when the seams are named and explicit.

## Suggested scope for Phase 3

A strong scope for this phase might include:

- 3 to 5 content packs loaded together
- pack dependency resolution and validation
- event-driven hook registration
- two narration providers plus fallback
- save schema versioning and one or two real migrations
- internal authoring and debug commands

That is enough to meaningfully reduce future friction.

## Important systems to emphasize in code

Phase 3 should strengthen these areas:

- `content/loader`
- `content/registry`
- `content/validator`
- `plugins/api` or internal extension interfaces
- `ai/providers`
- `ai/memory`
- `infrastructure/persistence/migrations`
- `interfaces/cli/commands/debug`

This phase is more infrastructural than player-facing, but it pays off across every later feature.

## Design suggestions and best practices for Phase 3

### Prefer declarative content where possible

If a quest branch can be represented in data and conditions, prefer that to custom one-off code.

### Keep hooks bounded

Hooks are powerful, but they can become invisible complexity. Give them clear lifecycle points, priorities, and diagnostics.

### Log extension behavior in debug mode

If a hook fired or a pack registered content, developers should be able to inspect that easily.

### Document contracts as code and prose

TypeScript interfaces are good, but extension points also deserve short human-readable docs.

### Keep fallback paths first-class

Extensibility should not increase brittleness. If a provider or optional pack fails, error handling should be graceful and clear.

### Separate compatibility from availability

A save may be valid in structure but depend on packs that are not currently installed. Model that explicitly.

## Risks to avoid in Phase 3

This phase often fails through overengineering or under-constraining.

Watch out for:

- creating a plugin system before content packs are stable
- allowing hooks to mutate anything without guardrails
- weak validation leading to silent broken content
- treating prompt changes as harmless text edits
- letting extension APIs drift without versioning
- designing generic systems no real content currently needs

The goal is leverage, not complexity theater.

## Definition of done for Phase 3

Phase 3 is complete when you can:

1. load multiple content packs into the same game
2. validate and diagnose malformed content before runtime
3. register event-driven hooks without editing core engine files every time
4. switch between narration providers with minimal code change
5. upgrade at least one older save file through migrations
6. use internal tools to inspect content and runtime behavior

At that point, the project becomes much easier to extend responsibly.

## Suggested implementation order

A practical build order for this phase is:

1. formalize pack manifest schemas
2. build content registry and merge logic
3. add strict validation and diagnostics
4. implement hook registration and lifecycle points
5. strengthen narration provider abstraction and fallback chains
6. add prompt and save versioning
7. implement migrations
8. build authoring and debug tools
9. document extension interfaces

That path builds leverage without requiring a giant upfront redesign.

## Final guidance for this phase

Phase 3 is about making future ambition cheap. If you execute it well, new questlines, romance modules, schools of magic, side systems, and narration styles become additive work rather than destabilizing work. The project starts to feel less like a fragile codebase and more like a well-shaped engine for magical-school storytelling.

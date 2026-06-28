# CLI RPG Architecture Summary

This project should be built as a **modular monolith** in **TypeScript** with a **deterministic game engine** and an **AI narration layer** on top of it. The engine owns all rules and state changes, while AI is used for scene description, dialogue flavor, recaps, and immersive presentation. This separation is the most important architectural decision because it keeps the system testable, consistent, and extensible.

## Core architectural approach

The recommended style is a combination of **domain-driven design**, **ports and adapters**, and **event-driven internals**. In practice, this means the game should be split into a few clear layers:

- **Domain layer** for pure game rules and entities
- **Application layer** for use cases and orchestration
- **Engine layer** for turn resolution, events, scheduling, and effect processing
- **AI layer** for narration, prompt building, and model provider abstraction
- **CLI layer** for command parsing and output rendering
- **Infrastructure layer** for persistence, config, logging, and external APIs
- **Content layer** for spells, NPCs, quests, locations, plot arcs, and future content packs

This structure gives strong separation of concerns without making the project unnecessarily complex.

## Key design principle

The game engine must be the source of truth. It should deterministically decide:

- what actions are allowed
- whether a spell succeeds or fails
- how relationships change
- how quests advance
- how time moves forward
- what events are triggered

The AI should only interpret and narrate those outcomes. It should never directly mutate canonical game state.

## Main domain concepts

The core domain should include:

- **GameState**: the full current playthrough state
- **Player**: attributes, stats, spellbook, inventory, affiliations, energy, stress
- **Npc**: personality, schedule, secrets, faction ties, relationship state
- **Spell**: prerequisites, mastery, difficulty, effects, miscast rules, narrative tags
- **Relationship**: trust, affection, admiration, attraction, comfort, resentment, suspicion, loyalty
- **Quest** and **PlotArc**: staged progression units and longer narrative structures
- **SceneContext**: structured input for narration generation

These should be represented with clear TypeScript interfaces or classes and kept free from IO concerns.

## Engine responsibilities

The engine should process the game as a structured loop:

1. Read player input from the CLI
2. Parse it into a typed game action
3. Validate the action against current state and rules
4. Apply state changes through deterministic logic
5. Emit domain events
6. Run secondary systems such as quest progression, scheduling, and relationship updates
7. Build a narration context from state plus recent events
8. Ask the AI layer for prose
9. Render the result back in the CLI

Important engine subsystems include:

- **Turn and time system** using discrete time blocks such as morning, afternoon, evening, and night
- **Action system** using typed action objects rather than raw command strings
- **Event bus** to decouple subsystems
- **Scheduler** for world events, classes, NPC routines, and plot escalation
- **Condition/effect system** for flexible gameplay rules and content-driven behavior

## AI subsystem

The AI system should be treated as its own module with strict boundaries. It should include:

- a **provider abstraction** so different LLM vendors can be swapped easily
- **prompt builders** specialized for narration, dialogue, recaps, rumors, dreams, and letters
- a **context assembler** that selects only relevant state instead of dumping the entire game
- an **output parser and policy layer** that validates AI responses
- a **fallback deterministic narrator** in case AI is unavailable

The AI should receive structured context, not raw state dumps. That keeps outputs more coherent and less expensive.

## Content and extensibility

To maximize flexibility, all setting-specific content should live outside the core engine. The engine should be reusable, while game-specific material is loaded through **content packs**.

A content pack can define:

- spells
- items
- locations
- NPCs
- quests
- plot arcs
- schedules
- encounter tables
- relationship events
- lore and narration style rules

The project should support at least three levels of extensibility:

1. **Content extension** for new spells, quests, NPCs, and areas
2. **Rule hooks** for reacting to events without changing engine code
3. **Plugins** for major new systems later on

This approach makes the game easier to expand, rebalance, and potentially mod.

## Persistence strategy

Use **SQLite** as the main save system and allow optional **JSON export/import** for debugging and portability. Canonical state should be saved separately from generated prose. AI text may be cached, but it should never be the authoritative save source.

Version the following from the start:

- save schema
- content packs
- plugin API
- prompt templates

That will make future migrations much easier.

## Recommended technical stack

A practical stack for this project is:

- **Node.js + TypeScript**
- **ESM modules**
- **Vitest** for testing
- **Zod** for schema validation
- **Commander** or **Clack** for CLI interaction
- **SQLite** with a lightweight data layer
- **Pino** for logging if structured logs are needed
- **tsx** for local development

TypeScript should run in **strict mode**, and the project should favor interfaces, pure functions, and explicit action/result contracts.

## Testing strategy

The project should be tested at multiple levels:

- **Unit tests** for spell rules, quest branching, relationship changes, time advancement, and effect resolution
- **Integration tests** for action flows, saving/loading, and cross-system interactions
- **Contract tests** for repositories, AI providers, and content loaders
- **Golden or snapshot tests** for prompts, summaries, and CLI rendering

The highest priority is testing the deterministic engine, not the exact prose style.

## Recommended development sequence

A sensible build order is:

### Phase 1
Build the deterministic core:

- game state
- player actions
- spell learning basics
- locations
- time system
- save/load
- simple narration integration

### Phase 2
Add world dynamism:

- NPC schedules
- relationship engine
- event bus
- quest system
- intrigue arcs
- recap or journal generation

### Phase 3
Add extensibility:

- content pack loader
- hook system
- multiple narration providers
- migration support

### Phase 4
Deepen systems:

- advanced dueling
- richer romance and social simulation
- more layered plot arc combinatorics
- tooling for content authoring

## Final recommendation

The best architecture for this game is a **modular TypeScript CLI engine** where deterministic systems control mechanics and AI adds presentation, flavor, and dynamic scene writing. The design should prioritize strong boundaries, typed interfaces, event-driven coordination, content-driven worldbuilding, and graceful fallback behavior when AI is unavailable.

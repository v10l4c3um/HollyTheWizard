# Phase 1 — Deterministic Core

Phase 1 is where the project earns its long-term stability. The goal is not to make the game feel huge yet. The goal is to make it **trustworthy**. By the end of this phase, the game should already be playable as a CLI RPG with a coherent loop, clear state transitions, save and load support, basic spell learning, a small explorable environment, and AI-assisted narration layered on top of a deterministic engine.

This phase should deliberately avoid overreaching. Do not try to implement complex social simulation, rich procedural intrigue, or deep plugin support here. Instead, establish the contracts and boundaries that every later phase will depend on.

## Core objective

Build a small but solid vertical slice where:

- the player can start a new game
- the world has a canonical game state
- the CLI accepts typed commands
- actions resolve deterministically
- time advances in a controlled way
- spells can be learned and practiced
- simple quest flags can advance
- scenes can be narrated through an AI provider or a fallback narrator
- the session can be saved and loaded reliably

If that works well, every future feature becomes much safer to add.

## Main architectural outcome

At the end of Phase 1, the codebase should already reflect the intended architecture:

- **domain layer** for core entities and rules
- **application layer** for use cases such as starting a game and performing actions
- **engine layer** for action resolution and time progression
- **AI layer** for narration abstraction
- **CLI layer** for input and output
- **infrastructure layer** for persistence and configuration

Even if each layer is still small, the boundaries should be real from day one.

## What Phase 1 should include

### 1. Game bootstrap and runtime wiring

The game needs a clean bootstrap path that initializes configuration, content, persistence, RNG, narration provider, and the engine itself. This is where dependency injection starts to matter.

Key recommendations:

- use one clear `bootstrap.ts` or equivalent composition root
- keep construction of services out of domain code
- initialize providers and adapters once, then pass them through interfaces
- support a mock narration provider for tests and offline development

This makes the project easier to reason about and much easier to test.

### 2. Canonical game state model

Define a single canonical state shape for a save file and runtime session. This does not need to be maximally detailed yet, but it should be stable and explicit.

At minimum, `GameState` should include:

- metadata such as save version and created timestamp
- world clock and current time block
- current location
- player identity and stats
- spellbook and spell progression
- simple inventory
- discovered locations
- active and completed quest flags
- known NPCs and minimal relationship placeholders
- recent events or action history
- settings such as narration mode or romance intensity setting for future use

The important thing is not how many fields exist. The important thing is that all gameplay systems agree this is the source of truth.

### 3. Player model and attributes

The player model should be just rich enough to support meaningful decisions. Keep it compact.

A good first version includes:

- background or archetype
- a few core attributes such as intellect, nerve, empathy, discipline, charm
- resource tracks like energy, stress, and light injury
- faction or house-like affiliation if your setting uses one
- spellbook progress
- inventory

Do not try to model personality simulation in code yet. What matters first is a player object that can support action checks and progression.

### 4. Location graph

Build a small, explicit map of locations connected by allowed movement paths. Even if the world is tiny at first, locations should already feel like first-class game objects.

Suggested initial locations:

- entrance hall
- common room or dormitory equivalent
- classroom
- library
- courtyard
- training chamber

Each location definition should support:

- unique id and display name
- description seed
- connected locations
- tags such as `study`, `social`, `restricted`, `practice`
- optional modifiers that affect actions

This will become important later when scheduling, secrets, and scene generation grow more advanced.

### 5. Typed action system

The CLI should never directly mutate the world based on freeform strings. Instead, user input should be parsed into a typed action union or a command object.

Initial actions should stay intentionally small:

- move or explore
- attend class
- study
- practice spell
- inspect spellbook
- rest
- talk to NPC
- save
- load
- help

Why this matters:

- better type safety
- clearer resolution logic
- easier testing
- easier expansion later when more actions are added

### 6. Action validation and deterministic resolution

This is one of the most important deliverables in Phase 1. Every action must go through a standard pipeline:

1. parse input
2. validate action against current state
3. resolve action through game rules
4. apply state changes
5. emit outcome data for narration and rendering

Validation should answer questions like:

- is the action allowed in the current location?
- does the player know the relevant spell?
- does the player have enough energy?
- is the target NPC present?
- is the destination connected?

Resolution should produce a structured result instead of directly printing output. That result can include:

- updated state
- mechanical consequences
- events emitted
- narration context hints
- user-facing summary metadata

### 7. Turn loop and time progression

Phase 1 should establish a discrete time model, because later systems depend on it. A simple model like morning, afternoon, evening, and night is enough.

Every meaningful action should either:

- consume a time block
- partially consume a time block
- or be explicitly free

Recommended approach:

- movement inside a local zone may be free or cheap
- attending class consumes a major block
- studying or practicing consumes a block
- resting advances time in a predictable way

Time progression immediately creates structure. It also lays groundwork for future schedules, curfews, classes, romance scenes, and intrigue events.

### 8. Spell learning subsystem, version 1

Spell learning is one of your central promises, so it needs to appear in Phase 1 even if it is still simple.

A first implementation should support:

- spell definitions loaded from content
- prerequisites such as class exposure or required attribute threshold
- progress states such as unknown, exposed, learning, competent
- practice outcomes based on deterministic rules plus randomness
- energy cost and stress interaction
- mastery gain from study and use

Keep combat-grade spell variety out of scope for now. Focus on the loop of:

- gain exposure
- practice
- improve
- unlock reliable use

This already creates a satisfying progression spine.

### 9. Minimal quest and flag system

Do not build a full branching quest engine yet, but do create a clean structure for simple progress flags.

Examples of early flags:

- attended first lesson
- met mentor NPC
- discovered restricted wing rumor
- learned first basic spell
- entered library at night

These flags should be stored as formal state, not buried in narration history. Later plot arcs will be built on top of this foundation.

### 10. Persistence

Phase 1 must include working save and load behavior. This is not optional. It is a core confidence feature for both players and developers.

Recommended approach:

- use a repository interface from day one
- start with JSON snapshots if that speeds iteration
- optionally wire SQLite immediately if you already know you want it
- version the save shape from the start
- keep generated narration outside canonical mechanics if possible

If using JSON first, design the repository interface so SQLite can replace it later without touching domain logic.

### 11. Narration abstraction and fallback path

Phase 1 should include AI narration, but as a thin integration, not as a sprawling subsystem. The key is to establish the boundary correctly.

Implement:

- `NarrationPort` or equivalent interface
- one real provider adapter
- one mock provider
- one fallback deterministic narrator

The fallback narrator matters because the game should still function if the model is unavailable, slow, or expensive.

A strong early rule is:

- mechanics happen first
- narration happens second
- narration failure must not break gameplay

### 12. CLI shell and rendering

The CLI should already feel pleasant in Phase 1. It does not need rich TUI graphics, but it should be clean, legible, and consistent.

A good CLI should provide:

- a command prompt
- parsing and helpful error messages
- scene summary rendering
- action result rendering
- clear display of time, location, and basic stats
- help text and command hints

Keep rendering separate from game logic. The CLI should format results, not decide outcomes.

## Suggested scope for the Phase 1 vertical slice

A realistic Phase 1 vertical slice could include:

- 5 to 6 locations
- 2 to 3 NPCs
- 4 to 6 basic spells
- 1 small introductory questline
- 1 school day or short early progression segment
- 8 to 10 supported player commands

That is enough to validate the architecture without turning the project into a content marathon too early.

## Recommended folder emphasis in this phase

Phase 1 should focus on establishing these key modules:

- `core/domain/world`
- `core/domain/player`
- `core/domain/magic`
- `core/application/use-cases`
- `core/engine`
- `interfaces/cli`
- `infrastructure/persistence`
- `ai/providers`
- `content/packs/academy-core`

Do not expand plugins or advanced content tooling yet unless needed for velocity.

## Design suggestions and best practices for Phase 1

### Keep domain logic pure

No direct file system access, terminal calls, or model API calls inside the domain. This makes unit testing dramatically easier.

### Favor explicit state transitions

A predictable result object is better than scattered mutation. It should always be obvious why the state changed.

### Use schema validation for content

Even early content should be validated. If a spell definition is malformed, the system should fail fast at load time.

### Keep random behavior injectable

Use a random provider interface. That lets you create deterministic tests with fixed seeds.

### Version early

Even before SQLite or plugins arrive, version save files and content packs. Migration pain compounds quickly if ignored.

### Resist building general engines too early

It is tempting to invent a giant universal rules engine immediately. Do not. Build a few clean, explicit systems first, then generalize only where repetition genuinely appears.

## Risks to avoid in Phase 1

The biggest mistakes at this stage are usually structural, not algorithmic.

Watch out for:

- putting game logic inside the CLI parser
- letting the AI provider decide mechanics
- hardcoding content inside rule resolution methods
- skipping save and load because it feels boring
- building too many commands before the core loop feels right
- overdesigning plugins before the domain stabilizes

If any of those happen, later phases become slower and messier.

## Definition of done for Phase 1

Phase 1 is complete when you can confidently demonstrate this flow:

1. start a new game
2. enter a small school-like environment
3. move between locations
4. attend a lesson or study
5. gain progress toward or learn a basic spell
6. practice the spell and see deterministic consequences
7. advance a simple quest flag
8. save the game
9. load the game
10. receive AI-generated or fallback narration describing what happened

If all of that works, you have the right foundation.

## Suggested implementation order

A practical build order inside this phase is:

1. define core types and `GameState`
2. implement player, location, and spell definitions
3. build command parsing into typed actions
4. implement action validation and turn resolution
5. add time progression
6. add spell learning and practice flow
7. add quest flags
8. add save and load
9. add narration abstraction and fallback provider
10. polish CLI rendering and error handling

That sequence minimizes backtracking.

## Final guidance for this phase

Phase 1 should feel almost conservative. That is a good thing. It is where the game stops being an idea and becomes a system. If you make the deterministic core feel clean, reliable, and legible now, then Phase 2 through Phase 4 can become ambitious without collapsing into chaos.

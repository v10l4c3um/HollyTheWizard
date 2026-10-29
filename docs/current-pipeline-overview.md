# HollyTheWizard — Current Workflow & Pipeline Overview

*Purpose: context document for a design agent. Describes the living codebase as of mid-2026, see docs/systems/00-synthesis.md for current status. Use this to reason about what already exists before proposing features or improvements.*

---

## Project in One Sentence

A TypeScript terminal RPG set in a wizard school where the game engine is fully deterministic and Ollama (local LLM) is used only for three narrow jobs: parsing player intent, generating immersive prose, and generating the campaign story blueprint at startup.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js + TypeScript (ESM, `tsx`) |
| Terminal UI | React + Ink (React-for-CLI) |
| LLM | Ollama running locally on `localhost:11434` |
| Validation | Zod |
| Persistence | Plain JSON files in `./saves/` |
| Entry point | `src/ui/ink/entry.ts` |

---

## Top-Level Data Flow (One Turn)

```
Player types text
  → Resolver (LLM #1: intent + arg extraction)
  → TurnResolver (pure deterministic dispatch)
      → evaluateConversation / CurriculumService / SpellRevealService
      → applyEffects(state, effects[], bus)   ← only sanctioned mutation path
      → emit GameEvents on bus
  → (time and the event log are applied as effects inside TurnResolver.apply)
  → Renderer (LLM #2: produce 3–5 sentence prose paragraph)
  → BlueprintProgressService.checkMilestones
  → InkApp re-renders with state.output
```

---

## Component Map

### Entry & Bootstrap (`src/ui/ink/entry.ts`, `src/bootstrap/engineFactory.ts`)

`engineFactory` is the composition root. It:
1. Builds the `Registry` (hard-coded starter locations + JSON content packs for spells and NPCs)
2. Loads curriculum/timetable data via `SchoolDataLoader`
3. Creates `GameEngine` and the `GameBus`
4. Wires four bus listeners that write `questFlags` on: `LessonAttended`, `LocationDiscovered`, `SpellRevealed`, `SpellMastered`
5. Initialises all spells to `hidden` state
6. Probes Ollama (connectivity + model warmup) then generates the `CampaignBlueprint` + `YearBlueprint` via LLM (with deterministic fallbacks)

`InkApp` is a 4-phase state machine: `menu → loading → game → startup-error`.

---

### Registry (`src/core/Registry.ts`)

Immutable after startup. Four `Map<id, T>` stores: locations, NPCs, items, spells. Also holds `schoolData`. All runtime lookups go here; nothing is fetched from disk during play.

---

### GameState (`src/core/domain/world/GameState.ts`)

The complete save-file and runtime state. One class instance is the single source of truth. Key groups:

| Group | Fields |
|---|---|
| World | `worldClock`, `currentLocationId`, `discoveredLocationIds` |
| Player | `player` (AttributeStats × 10, ResourceStats × 5), `spellbook` |
| Academic | `academicState` (per-subject knowledge, lesson progress) |
| Social | `relationships[npcId]` (9 axes), `unlockedTopicsByNpc`, `knownNPCIds` |
| Narrative | `questFlags`, `flags`, `clues`, `rumors`, `sceneInvitations`, `recentEvents` |
| Blueprint | `campaignBlueprint`, `yearBlueprints`, `yearProgress` |
| Meta | `currentYear` (1–7), `settings` (narrationMode, romanceIntensity), `output` |

`GameState.fromPlainObject()` rehydrates class instances (`WorldClock`, `SpellBook`) on load.

---

### Effect System (`src/core/domain/effects/`)

**`GameEffects.ts`** — discriminated union of 10 effect types:

| Type | What it does |
|---|---|
| `ProgressDelta` | Adds to a named numeric track (e.g. `subject.charms.knowledge`) |
| `AttributeDelta` | Adjusts one of 10 player attributes |
| `ResourceDelta` | Adjusts health / mana / energy / reputation |
| `RelationshipDelta` | Adjusts one or more axes on an NPC relationship |
| `FlagSet` | Sets a generic key/value flag |
| `InventoryDelta` | Adds or removes item quantity |
| `TopicUnlocked` | Marks a conversation topic as available for an NPC |
| `ClueRevealed` | Records a discovered investigation clue |
| `RumorLearned` | Records a known rumor |
| `SceneInvitationCreated` | Queues a scene invitation from an NPC |

Every effect carries a mandatory `reason: string` field for auditability.

**`EffectApplier.ts`** — `applyEffects(state, effects[], bus?)` is the only sanctioned mutation path for `GameState`. All command handlers build an `effects[]` array and pass it here; direct field assignment to `state` is avoided outside this function (except `SpellBook` which has a known TODO).

---

### Event Bus (`src/core/engine/EventBus.ts`, `src/core/domain/events/GameEvents.ts`)

`TypedBus<GameEvents>` is a minimal typed pub/sub (`on / off / emit`). ~20 typed event payloads cover spells, lessons, locations, NPCs, quests, time, saves, year advancement, and blueprints.

Design rule: command handlers call `applyEffects` first (mutation), then `emit` semantic events (notification). Observers react to events but do not mutate state directly — they call back through effects or set quest flags.

---

### TurnResolver (`src/core/engine/TurnResolver.ts`)

Pure deterministic dispatch — no LLM calls, no I/O. Handles 8 command types:

| Command | Time cost | Core action |
|---|---|---|
| `MOVE` | 5 min | Validates connected locations, updates currentLocationId, emits LocationVisited/Discovered |
| `TALK` | 15 min | Calls `evaluateConversation`, applies relationship/topic/clue effects |
| `STUDY` | 60 min/hr | ProgressDelta on subject knowledge + SpellRevealService check |
| `ATTEND_CLASS` | 60 min | Fetches lesson from CurriculumService, applies attribute + progress rewards, spell reveal opportunity |
| `PRACTICE` | 60 min/hr | Runs `applySpellUse` × 10 per hour through SpellProgressionService |
| `REST` | variable | No state change, just time advance |
| `INTERACT` | 10 min | Item lookup |
| `SAVE` / `LOAD` | 0 | Handled in GameEngine before reaching TurnResolver |

---

### Conversation System (`src/core/domain/npc/Conversation.ts`)

`evaluateConversation(ctx)` — pure function, deterministic, no randomness. Evaluates 9 priority-ordered rules based on `RelationshipStats` and topic type:

- Trust < 15 = low, 15–39 = moderate, ≥ 40 = high
- Topic sensitivity: sensitive (death/curse/forbidden/…), guarded (romance/politics/…), open (everything else)
- Outcomes: `refusal`, `deflection`, `partial`, `success`, `reveal`, `invitation`
- Returns `GameEffect[]` (relationship deltas, topic unlocks, clue reveals, scene invitations)
- Returns `narrationTags[]` (e.g. `["tense","guarded"]`) passed to Renderer for tone adjustment

The LLM does not decide conversation outcomes. It only renders prose around them.

---

### NPC & Relationship Model

`Npc.ts` is intentionally thin: `id`, `name`, `dialogue[]` (style guide for the NPC's voice), `tag_description`. All dynamic state lives in `GameState.relationships[npcId]`: nine axes (`trust`, `affection`, `respect`, `comfort`, `attraction`, `loyalty`, `resentment`, `fear`, `envy`), each clamped –100 to +100.

---

### Spell System

**Spell definition** (`SpellDefinition` + `SpellBalance`): id, name, level, usageType, revealCondition, castCondition, manaCost, backfireRisk, learningDifficulty, practiceRequirement.

**Spell state** (per-player, lives in `SpellBook`): `knowledgeState` (`hidden → available → learned → mastered`), `masteryTier`, `proficiency` (0–100), `practicePoints`, `stability`, `reliability`.

**SpellProgressionService** — `applySpellUse(spell, state)` calculates proficiency gain, stability, reliability, and mastery tier transitions after each practice attempt. The result is written with a `SpellStateUpdated` effect.

**SpellRevealService** — unlocks spells from `hidden` to `available` based on `revealCondition` checks + chance rolls. `checkRevealCondition` currently always returns `false` (wired but not fully implemented).

---

### Magic / Academic Progression

27 wizard-school subjects (`SubjectType` union). Each subject has:
- `knowledge` (numeric, incremented by STUDY and ATTEND_CLASS)
- `currentLessonOrder` (lesson index within the year curriculum)
- `attendedLessons` / `skippedLessons` counts

`CurriculumService.getCurrentLesson(state, subjectId)` returns the current `LessonDefinition`. The `LessonAdvanced` effect increments the counter. Each lesson definition can carry `SpellRevealOpportunity` entries (spell id + success probability).

---

### Blueprint / Campaign System

**CampaignBlueprintBase** (generated once at New Game by LLM):
- `runThemes` (1–3 from a 6-item allowlist), `toneProfile`, `runTruths` (4 booleans), `longLivedRoles`
- Falls back to a safe lighthearted/discovery preset if LLM or Zod validation fails

**YearBlueprint** (generated at each year start by LLM, with allowlists to prevent hallucination):
- `arcModules` (1–2), `moduleRoles`, `clueSeeds`, `gates`, `milestones` (1–8), `climaxOptions`
- Falls back to `buildSafeYearBlueprint`

**BlueprintProgressService** — runs after every turn; checks unsatisfied milestones against trigger conditions (`questFlag` or `yearStart`). Emits `BlueprintMilestoneReached` on completion.

**AdvanceYear** — summarises completed year, generates new `YearBlueprint`, updates `currentYear`, emits `YearAdvanced`.

---

### Ollama Integration (`src/ai/`)

Three roles, three configs (all default to `localhost:11434`):

| Role | Model | When called |
|---|---|---|
| Resolver | `qwen3-4b-instruct-gguf:Q4_K_M` | Every turn (2 calls: intent + args) |
| Renderer | `llama3.1:8b-instruct-q4_K_M` | Every turn (1 call: prose paragraph) |
| Blueprint | `llama3.1:8b-instruct-q4_K_M` | New game + each year advance |

**OllamaClient** wraps the `/api/generate` endpoint with:
- Exponential backoff retry (3 retries, base 250ms)
- `AbortController` timeout
- Optional structured JSON output (schema passed to `format:`)
- Typed error codes: `timeout`, `unavailable`, `http`, `invalid_response`, `empty_response`

**Resolver repair passes**: on Zod validation failure, tries (1) deep-flatten, (2) enum-scan before falling back to `{ type: "REST" }`.

**Blueprint repair**: on Zod failure, sends a second LLM call with the raw response + error list as context. Returns `null` on final failure, callers use deterministic fallbacks.

---

### Persistence (`src/infrastructure/persistence/json/`)

`JsonPersistenceRepository`:
- Saves: `JSON.stringify(state, null, 2)` to `./saves/<sanitized>.json`
- Loads: `GameState.fromPlainObject(data)` — reconstructs `WorldClock` and `SpellBook` class instances
- Path sanitization: `path.basename` + strip non-alphanumeric characters

---

### UI (`src/ui/ink/`)

React + Ink state machine:

| Phase | Component | What shows |
|---|---|---|
| `menu` | `MainMenu` | New Game / Continue / Load / Options / Quit |
| `loading` | `LoadingScreen` | 6 startup milestones with status indicators |
| `game` | `GameScreen` | OutputPanel + CommandInput + HUD + SpellbookWidget |
| `startup-error` | inline | Error message |

`GameScreen` calls `engine.handleCommand(input)` on submit and shows the returned `TurnOutcome.narration`, marking errors with `✗`. The UI gets the engine from `engineFactory`; it still imports a few core types directly (see systems/20).

---

## What Is Not Yet Implemented (Phase 2+ Work)

| Area | Status |
|---|---|
| NPC schedules | Presence is derived from NPC schedules (`Presence.ts`); no autonomous NPC simulation |
| SpellRevealService condition checks | `checkRevealCondition` always returns false |
| Full quest system | Only `questFlags` string lists, no structured quests |
| Scene invitations / special encounters | Data model exists, no handler |
| Dueling / combat | Not started |
| Multiple narration providers | Only Ollama; interface not abstracted |

---

## Key Design Invariants (Do Not Break)

1. **Engine decides outcomes; LLM only renders and parses.** The Resolver and Renderer wrap a deterministic core — Ollama never determines whether a spell works, a relationship improves, or a quest advances.
2. **`applyEffects` is the only mutation path.** Command handlers build `GameEffect[]` and call `applyEffects(state, effects, bus)`. Direct field mutation on `GameState` should be ported to effects.
3. **Registry is treated as read-only after startup.** Nothing enforces it in code.
4. **Fallbacks everywhere around LLM calls.** Every Ollama call has a deterministic fallback so the game is playable without a running Ollama instance (degraded experience only).
5. **Events notify; effects mutate.** Observers on the bus react by setting flags or scheduling follow-up effects — they do not directly modify `GameState` fields.

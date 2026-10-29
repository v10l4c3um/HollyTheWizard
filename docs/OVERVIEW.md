# HollyTheWizard — High-Level Overview

## What it is

A single-player terminal RPG set in a wizard school. You type free-form commands ("go to the library", "ask Holly about the curse", "practice Lumos for two hours"), and the game responds with short immersive prose. You attend classes, study, learn and master spells, build relationships with NPCs, and progress through a multi-year campaign (years 1–7).

The central design idea: **the engine is deterministic, the LLM is only a translator.** A local LLM (via Ollama) turns your text into a structured command and turns the engine's result into prose. It never decides outcomes.

## The turn loop

```
Player text
  → Resolver      (LLM: text → structured command, validated with Zod)
  → TurnResolver  (pure code: MOVE / TALK / STUDY / ATTEND_CLASS / PRACTICE / REST / INTERACT)
      → builds GameEffect[]
      → applyEffects(state, effects, bus)   ← the only way state changes
      → emits events on the bus
  → GameEngine    (advances the world clock, applies state changes)
  → Renderer      (LLM: outcome + tags → 3–5 sentences of prose)
  → BlueprintProgressService (checks story milestones)
  → UI re-renders
```

If Ollama is unavailable or returns garbage, every LLM step has a deterministic fallback, so the game still runs (with blunter text).

## Major subsystems

| Area | Where | Role |
|---|---|---|
| Engine | `src/core/engine/` | `GameEngine`, `TurnResolver`, intent `Resolver`, `Renderer`, typed `EventBus`, time costs |
| Domain | `src/core/domain/` | Pure game rules: player stats, spells, NPCs/relationships, conversation, curriculum, campaign blueprint, world state |
| Effects | `src/core/domain/effects/` | Discriminated union of state changes (progress, attributes, resources, relationships, flags, inventory, topics, clues, rumors, scene invitations), each with an audit `reason` |
| Conversations | `src/core/domain/npc/` | `evaluateConversation` picks an outcome (refusal → invitation) from trust and topic sensitivity; the LLM only voices it. NPC profiles add per-character behavior |
| Spells | `src/core/domain/magic/` | Spells move `hidden → available → learned → mastered`; practice raises proficiency, stability and reliability |
| Curriculum | `src/core/domain/quest/`, `src/content/curriculum/` | 27 subjects, timetables, per-year lessons that can reveal spells |
| Campaign | `src/core/domain/campaign/` | LLM-generated (schema-validated, allowlisted) campaign and per-year blueprints with themes, clue seeds, gates and milestones; safe fallbacks |
| Content | `src/content/`, `src/core/content/` | Data-driven JSON packs for spells, NPCs, NPC profiles and curriculum, loaded into an immutable `Registry` at startup |
| AI | `src/ai/` | `OllamaClient` (retry, timeout, structured output), narration prompts, blueprint provider |
| Persistence | `src/infrastructure/persistence/json/` | Saves `GameState` as JSON in `./saves/` |
| UI | `src/ui/ink/` | React + Ink terminal UI: menu → loading → game (output, input, HUD, spellbook) |
| Composition | `src/bootstrap/engineFactory.ts` | Wires registry, content, engine, bus listeners, Ollama probe and blueprint generation |

## Design invariants

1. The engine decides outcomes; the LLM only parses and narrates.
2. `applyEffects` is the sole mutation path for `GameState`.
3. Events notify; effects mutate.
4. The `Registry` is immutable after startup.
5. Every LLM call has a deterministic fallback.

## Known gaps

spell reveal condition checks, no structured quest system, scene invitations lack handlers, no dueling/combat.

## Further reading

- [current-pipeline-overview.md](current-pipeline-overview.md) — detailed pipeline reference
- [CONTENT_SYSTEM.md](CONTENT_SYSTEM.md), [ADDING_SPELLS.md](ADDING_SPELLS.md) — authoring content
- `phase-1…4-*.md` — roadmap

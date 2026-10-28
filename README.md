# HollyTheWizard

A terminal RPG set in a wizard school. Type natural-language commands, attend classes, learn spells, and build relationships with NPCs across a seven-year campaign.

The game engine is fully deterministic. A local LLM ([Ollama](https://ollama.com)) is used only to parse your input, narrate results, and generate the campaign's story blueprint. If Ollama isn't running, the game falls back to deterministic behavior.

## Requirements

- Node.js 24.18.x (see `.nvmrc`)
- Ollama on `localhost:11434` (optional but recommended). Default models:
  - Resolver: `qwen3-4b-instruct-gguf:Q4_K_M`
  - Renderer and blueprint: `llama3.1:8b-instruct-q4_K_M`

## Getting started

```bash
npm install
npm start      # launches the Ink terminal UI
npm test       # runs the Jest suite
npm run build  # type-check / compile with tsc
```

Saves are written as JSON to `./saves/`.

## Project layout

```
src/
  core/        engine, domain rules, effects, content loading, registry
  ai/          Ollama client, narration and blueprint providers
  content/     JSON packs: spells, NPCs, NPC profiles, curriculum
  bootstrap/   engineFactory (composition root)
  ui/ink/      React + Ink terminal UI (entry: entry.ts)
  test/        Jest tests
docs/          architecture and content-authoring docs
```

## How it works

Each turn: player text → LLM resolver (structured command) → deterministic `TurnResolver` → effects applied via `applyEffects` → events emitted → LLM renderer (prose). See [docs/OVERVIEW.md](docs/OVERVIEW.md) for the high-level picture and [docs/current-pipeline-overview.md](docs/current-pipeline-overview.md) for details.

## Extending

- Add spells: [docs/ADDING_SPELLS.md](docs/ADDING_SPELLS.md)
- Content packs: [docs/CONTENT_SYSTEM.md](docs/CONTENT_SYSTEM.md)
- Roadmap: `docs/phase-*.md`

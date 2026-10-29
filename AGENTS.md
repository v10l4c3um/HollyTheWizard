# AGENTS.md

Guidance for anyone (human or AI agent) working in this repository.

## Docs

- **When a problem listed in `docs/` is fixed, remove it.** Do not cross it out (`~~…~~`), do not mark it "Fixed", and do not leave a tombstone. Delete the entry (the weakness row, the bullet, the table row) and renumber the list around it. Git history keeps what was there.
  - If a fix is only partial, keep the entry and rewrite it to describe what is still open.
  - Update any other docs that describe the old behaviour at the same time.
- Docs describe the code as it is now. Keep them in step with the change in the same commit.

## Working here

- `npm test` runs the Jest suite; `npx tsc --noEmit` type-checks. Both must pass before a commit.
- `npm run eval:resolver` and `npm run eval:blueprint` measure the language-model parts against a local Ollama. They are manual and not part of `npm test`; run them when you change prompts, grounding or schemas.
- The LLM is required by design. Deterministic fallbacks exist only for tests and development.
- All game-state changes go through effects (`applyEffects`); the engine does not write state directly.

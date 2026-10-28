# Testing

Files: `jest.config.js`, `tsconfig.json`, `src/test/*.test.ts` (8 files, ~1,300 lines). Scripts: `npm test` (`jest`), `npm run build` (`npx tsc`). Note: I could not run the suite in this session — `node_modules` is not installed, so `npx jest` failed with "Preset ts-jest not found". All counts below come from reading the test files, not from a run.

## What it does

Provides automated checks for part of the code with Jest and `ts-jest` (Node environment, tests discovered as `src/**/*.test.ts`). No CI configuration, coverage threshold or pre-commit hook is present in the repository.

## What is covered

| File | Cases | Covers |
|---|---|---|
| `ollama-client.test.ts` | 11 | Success path, thinking flag, HTTP/unavailable/timeout error normalisation, debug-mode no-timeout, retry with backoff, retry exhaustion, health and connectivity probes |
| `persistence.test.ts` | 14 | Save/load round trip for clock and spellbook, default name, sanitisation, directory creation, JSON formatting, overwrite, multiple saves, missing file |
| `blueprint.test.ts` | 12 | Zod schemas, semantic validation, fallback builders, `AdvanceYear` with a stubbed provider, an extra persistence round trip |
| `resolver.test.ts` | 8 | Two-stage parse, number coercion, Ollama unavailable/non-JSON fallback, three repair paths |
| `renderer.test.ts` | 3 | Success, unavailable, malformed response |
| `spell-progression.test.ts` | 5 | Hidden start, learned transition, practice raising proficiency, academic state init, spellbook methods |
| `engine-factory.test.ts` | 1 | Startup fails with an Ollama error |
| `blueprint-llm-provider.test.ts` | 1 | Provider behaviour |

About 55 cases in total. Strongest areas: the Ollama client, the blueprint pipeline's validation, and the resolver's repair code. These are the parts that touch external or untrusted input.

## Strengths

- **The riskiest I/O boundary is well tested** (the Ollama client, with fake timers and a mocked `fetch`), including failure modes.
- **Validation layers are tested** (schemas, semantic checks, fallbacks), which protects the "LLM output is untrusted" principle.
- **Tests do not need a running model:** `fetch` is mocked, so the suite is deterministic and fast.
- **Standard, low-friction setup:** `ts-jest`, a single config, tests next to nothing exotic.
- **Strict TypeScript** (`"strict": true`) catches a large class of bugs at compile time.

## Weaknesses

1. **The core game rules are essentially untested.** There are no tests for `TurnResolver` (every command), `evaluateConversation`, `applyEffects`, `GameEngine.handleCommand`, `CurriculumService`, `SpellRevealService`, `WorldClock`, `BlueprintProgressService`, `Registry`/`ContentLoader`, or any UI component. This is where the findings in the system notes cluster, and they are invisible to the current suite: relationship effects dropped (06), practice unreachable (11), reveal downgrade (11), load breaking player stats (08), dead event-mood phase (13), year transition (12).
2. **Tests assert implementation shape rather than behaviour in places.** The resolver test locks in "failure becomes `REST`", the renderer test locks in the placeholder fallback string, and the persistence test checks only the clock and spellbook, which is why a broken load passes (08, 19).
3. **The suite writes to the real `./saves` directory.** One test saves `autosave` there and cleanup removes only `test-save-*` files, so running `npm test` can overwrite a player's actual autosave. The `blueprint.test.ts` round trip is another writer.
4. **No end-to-end test of a turn,** not even with fake resolver and renderer. A single "new game, move, attend class, save, load, attend class again" scenario would have caught several defects.
5. **Nothing uses randomness control.** `Math.random` is called in practice and reveal logic, so those paths cannot be tested deterministically (04, 11).
6. **No content tests:** nothing validates that packs parse, that ids cross-reference (spells in lessons, profiles for NPCs, exits between locations), or that the starting game is playable (09).
7. **Mixed test style and naming:** `it` and `test` are both used, and no shared fixtures or builders exist (each test constructs state by hand), which makes adding tests expensive.
8. **Coverage is unknown.** No coverage script or threshold, and the Jest config collects coverage from `src/**/*.ts` (including the untested UI `.tsx` only partially, since `.tsx` is excluded by the glob).
9. **No CI, lint or format step** is configured (no GitHub Actions file, ESLint or Prettier config seen), so tests run only when someone remembers. `.vscode/settings.json` is the only tooling config.
10. **Build/test configuration quirks:** `tsconfig.json` uses CommonJS while `tsconfig.runtime.json` and the UI package use ESM (`bundler` resolution), and `npm run build` would emit to `dist` without copying the JSON content (see 09). The test and runtime paths are therefore different module systems, which can hide ESM-only problems.
11. **Fixtures with placeholder shapes:** several tests use `as any` for spell states with fields that do not exist (`practiceAttempts`, `successfulCasts`), so type checking does not protect them.
12. **No LLM-quality testing.** There are no prompt regression sets (a list of inputs and the expected command), which matters most for the resolver (03) and narrator (05).

## Rework ideas

- **Decide the test pyramid:**
  1. **Unit tests** for pure rules: conversation phases, spell progression, clock, requirement checks, effect application (table-driven, one effect type per case).
  2. **Scenario tests** that drive the engine with a scripted fake LLM client and a seeded RNG: a deterministic playthrough of the first day, with assertions on state, not text.
  3. **Content tests** (a linter run in CI) over packs and curriculum.
  4. **LLM evaluation set** (optional, run manually against a real model): 100 to 200 player inputs with expected commands, reporting accuracy and latency per model.
  5. **UI tests** with `ink-testing-library` for the input line, menu and HUD.
- **Enable testability in the code:** inject the RNG, clock, LLM client and saves directory (see 02, 18, 19), and offer a `createTestEngine()` helper with a tiny fixed registry.
- **Add property and invariant tests,** for example "applying any effect list never leaves a stat out of bounds", "save then load is identity", "no sequence of commands leaves a spell regressing in knowledge state".
- **Golden/replay tests:** record a command script and the effect log, then compare after changes. A saved effect journal (06, 19) makes this cheap.
- **Fix hygiene:** temp directories for file-system tests, one style (`it`), typed fixtures and builders (`aGameState().withNpc(...)`), no `as any`.
- **Add tooling:** coverage report, CI workflow (install, type-check, test), lint and format, and a pre-commit hook. Fail CI on type errors, since `strict` is already on.
- **Make the first regression tests from the audit** (cheap and high value): relationships created on first talk, spell learn path reachable, reveal never downgrades, load then apply attribute effect, `TALK` unknown NPC, `ATTEND_CLASS` year change.
- **Keep one test config** for ESM/CJS to match the runtime, or run a smoke test of the real entry point.

## Open questions

- Is the goal a regression net for the rework (characterization tests of current behaviour first), or tests only for the new design? A small set of characterization tests for the known bugs is useful in both cases.
- Do we want LLM-in-the-loop tests in CI (slow, needs a model), or only mocked tests plus a manual evaluation run?
- What minimum coverage should gate merges?

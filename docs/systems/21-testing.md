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

1. **Parts of the game are untested.** There are about 550 tests in 61 files, covering the rules, effects, conversation, content, the engine turn and persistence. There are none for any UI component (20), and several areas (stat clamping, year change, the silent-failure paths of effects; see 06, 10, 12) are untested.
2. **Mixed test style:** `it` and `test` are both used. Shared builders exist (`buildTestGame`, `fakeOllama`, `placePlayer`), but many tests still construct state by hand.
3. **Coverage is unknown.** No coverage script or threshold, and the Jest config collects coverage from `src/**/*.ts` (including the untested UI `.tsx` only partially, since `.tsx` is excluded by the glob).
4. **No CI, lint or format step** is configured (no GitHub Actions file, ESLint or Prettier config seen), so tests run only when someone remembers. `.vscode/settings.json` is the only tooling config.
5. **Build/test configuration quirks:** `tsconfig.json` uses CommonJS while `tsconfig.runtime.json` and the UI package use ESM (`bundler` resolution), and `npm run build` would emit to `dist` without copying the JSON content (see 09). The test and runtime paths are therefore different module systems, which can hide ESM-only problems.
6. **Fixtures with placeholder shapes:** several tests use `as any` for spell states with fields that do not exist (`practiceAttempts`, `successfulCasts`), so type checking does not protect them.
7. **LLM quality is tested only for the resolver.** `npm run eval:resolver` (71 phrases against a live Ollama) and `eval:blueprint` measure it by hand; there is no equivalent for the narrator (05), and neither runs in CI.

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

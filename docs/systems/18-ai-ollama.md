# AI / Ollama Integration

Files: `src/ai/OllamaClient.ts` (272 lines), `src/ai/OllamaConfig.ts` (36), `src/ai/providers/BlueprintLLMProvider.ts` (104), `src/ai/narration/BlueprintPromptBuilder.ts` (66). Callers: `Resolver` (03), `Renderer` (05), blueprint use cases (15), `GameEngine._verifyOllamaConnections` (02). Tests: `ollama-client.test.ts` (11 cases), `blueprint-llm-provider.test.ts`.

## What it does

Is the only gateway to a language model. It sends prompts to a local Ollama server and returns text. Three roles use it: **resolver** (intent and argument JSON), **renderer** (prose), and **blueprint** (story JSON). Everything around the calls (validation, repair, fallback) lives in the callers, not here.

## How it works

- **Config:** `OllamaConfig { endpoint, model, debugMode?, disableThinking? }`. Three constants: resolver (`hf.co/llmware/qwen3-4b-instruct-gguf:Q4_K_M`), renderer and blueprint (`llama3.1:8b-instruct-q4_K_M`), all pointing at `http://localhost:11434/api/generate`. Callers receive them by default, and `engineFactory` passes `{}`, so there is no user override.
- **`generateWithOllama(config, prompt, { context, format, timeoutMs, maxRetries })`:** one `POST /api/generate` with `stream: false`, `think: false` (unless re-enabled), and an optional `format` (`"json"` or a JSON schema object). Validates that the reply is JSON with a non-empty string `response`.
- **Errors:** normalized to `OllamaRequestError` with codes `timeout | unavailable | http | invalid_response | empty_response | unknown`. Retries up to 3 times with exponential backoff (250 ms base). An empty response is not retried.
- **Timeouts:** always on, per attempt and per kind of call: connectivity 3 s, health check 60 s (may include a cold model load), resolver 20 s, narration 30 s, blueprint generation 90 s, 20 s for anything else (`OLLAMA_*_TIMEOUT_MS` in `OllamaClient.ts`, the one place to tune). A timeout is **not retried**; network and HTTP errors still are. `debugMode` only enables verbose request logging.
- **Startup probe:** for each distinct endpoint + model, a `GET /api/tags` and then a tiny generation ("Respond with OK."), which also loads the model into memory. Failure aborts startup with `Startup failed: ...`.
- **Blueprint provider:** parse + Zod + one LLM repair pass, returning `null` on failure.

## Strengths

- **Small, readable, well-tested client.** Normalized typed errors, backoff, empty-response handling, thinking control and the probe are all covered by tests.
- **Local-first.** No API keys, no cost, no data leaving the machine, which suits a personal game.
- **Structured-output support is built in** (`format` accepts a JSON schema), so a better contract with the model is one change away.
- **Role separation:** separate configs let the resolver use a small fast model and the renderer a larger one.
- **A fast fail at startup** with a clear message when Ollama is down or a model is missing.
- **Blueprint provider shows a good pattern:** validate, repair once, never throw.

## Weaknesses

1. **~~Timeouts are off by default.~~ Fixed:** the default configs no longer set `debugMode`, and `debugMode` no longer disables timeouts (see How it works). The original description follows. All four default configs set `debugMode: true`, and `resolveTimeout` then returns `undefined`, so no request ever times out in normal use (the tests prove this is intentional for debug mode). A hung or very slow model freezes the UI indefinitely, and the 5 s / 15 s constants are dead. "Debug" is also a quiet way to turn on request-body logging, which prints into the terminal UI.
2. **Everything is configured in code.** Endpoint, models and options are constants. There is no environment variable, settings file, in-game options screen, or model check beyond the probe. A missing model fails at startup with an HTTP error, with no help to the player (e.g. the `ollama pull` command).
3. **Likely model-swap thrash.** Every turn calls the resolver model (Qwen 4B) twice and then the renderer model (Llama 8B) once. Ollama may unload one to load the other, depending on memory and `OLLAMA_MAX_LOADED_MODELS`, which can add seconds per turn. Requests do not set `keep_alive`, and the startup probe warms each model once and then they compete. (Worth measuring on the target machine.)
4. **No generation options.** No `temperature`, `seed`, `num_predict` or `num_ctx`. The resolver should run at temperature 0 for stable classification; the renderer has no length cap and uses Ollama's defaults, so output varies run to run and cannot be reproduced.
5. **Single-string prompts through `/api/generate`.** No system/user separation, no chat roles, no few-shot messages. Player input is spliced into the prompt inside quotes, unescaped (`User input: "${input}"`), which is trivially injectable. The blast radius is small (a closed set of commands, sanitised save names) but it affects reliability and is easy to fix.
6. **Retry policy is blunt.** (Partly fixed: timeouts are no longer retried, and the blueprint provider no longer runs a repair pass after a failed request. HTTP 4xx errors are still retried.) HTTP 4xx errors (wrong model, bad request) are retried like transient failures, and retries multiply across layers: the client retries 3 times, the resolver makes 2 calls per turn, and the blueprint provider adds a repair call. A dead server therefore costs `4 attempts x backoff x calls` before fallback, and with no timeouts a half-dead one hangs.
7. **Three structured-output strategies.** The resolver uses `format: "json"` with a flatten/enum-scan repair, the blueprint uses `"json"` with an LLM repair pass, and the renderer uses free text. None uses the schema-constrained mode the client already supports.
8. **No abstraction at the boundary.** Core code imports `generateWithOllama` directly (the engine imports from `ai/` and `infastructure`), so swapping providers (llama.cpp server, OpenAI-compatible APIs, a cloud model, a mock) means editing call sites. A legacy `NarrationProvider` interface exists in the unused `bootstrap.ts`, not here.
9. **No non-LLM mode.** The model is required at startup (hard failure) even though fallbacks exist for every call. Offline play or a test run without Ollama is not supported (see 02, 05, 15).
10. **Observability gaps.** No latency, token or retry metrics, no request log file, and only ad-hoc `console.*` output that fights the Ink UI. Prompts and raw replies cannot be inspected after the fact, which makes tuning prompts hard.
11. **No streaming.** `stream: false` means the player sees nothing until the full paragraph is done; there is no cancel on user input.
12. **Duplicate and stale config.** `DEFAULT_OLLAMA_CONFIG` duplicates the resolver config and appears unused. The pipeline doc and README list model names that differ slightly from the code (`hf.co/llmware/...`).
13. **Content risk is not addressed:** nothing checks model output for unsafe or off-setting content before it reaches the player, and romance settings exist without any enforcement path (see 05).

## Rework ideas

- **Introduce a provider interface** (`LlmClient.generate({ system, messages, schema?, temperature, maxTokens, signal })`) with implementations for Ollama (via `/api/chat`), a fake/scripted client for tests, and a "disabled" client. All callers depend on it, and the composition root picks it. Make "LLM off" a supported mode (game starts, uses template narration and rule-based parsing).
- **Real configuration:** environment variables or a settings file (endpoint, models, timeouts, keep-alive), an options screen, and a first-run check that tells the player which model to pull.
- **Fix timeouts:** separate `debug` logging from `timeout`; always enforce them, with per-role budgets, and show a "still thinking" state that can be cancelled.
- **Tune requests per role:** temperature 0 and a schema for the resolver, small `num_predict` and a moderate temperature for the renderer, `keep_alive`, and `seed` in tests and debug.
- **Use schema-constrained output everywhere structured data is needed,** and drop most repair code (see 03).
- **Reduce model churn:** either use one model for all roles, or pin both in memory with `keep_alive`, and measure per-turn latency. Skip the LLM where rules suffice (see 03).
- **Smarter retries:** retry only transient errors (network, 5xx, timeout), once or twice, with a single global budget per turn.
- **Safer prompts:** chat roles with a fixed system prompt, the player's text passed as a data message, and quoting or length limits.
- **Observability:** a small logger interface that writes prompts, replies, latency and retries to a file (and to the UI only in a debug pane).
- **Stream the narration** to the UI, and handle cancellation.
- **Add an output check** (length, allowed names, simple content filter) before display (see 05).
- Remove unused config exports and keep one source of truth for model names (docs reference it).

## Open questions

- Is a local model a requirement of the product (privacy, zero cost) or an implementation detail? Supporting a hosted API as an alternative changes prompts, cost and latency trade-offs.
- Which hardware is the baseline? That decides whether two models can coexist in memory, and how big a model the renderer can use.
- Should the game ship a recommended model preset and an installer-style check (pull the model on first run)?
- Do we want any LLM use during play beyond parse and narrate, for example generating authored-style NPC lines within constraints or summarising the journal?

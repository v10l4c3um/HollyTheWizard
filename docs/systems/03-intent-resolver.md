# Intent Resolver (Input Parsing)

Files: `src/core/engine/Resolver.ts` (340 lines), `ResolverSchemas.ts` (72), `src/ui/cli/commands/Command.ts` (the `Command` type), tests in `src/test/resolver.test.ts` (8 cases).

## What it does

Turns free-form player text into a typed `Command` that `GameEngine` hands to `TurnResolver`. It is the only place the player's words are interpreted.

## How it works

**Fast path first.** `parseFastPath` (`FastPath.ts`) parses `undo`, `save` and `load` without the model (`undo` only as the single word; it takes back the last turn): `save`, `save game`, `save [game] [as|to] <name>`, `load`, `load game`, `load [game] [from] <name>`, where `<name>` is one `[A-Za-z0-9_-]+` token. A bare `save` writes `quicksave`; a bare `load` asks for `quicksave` and falls back to `autosave`. The rules are strict on purpose: "save the day" or "load up on potions" do not match and go to the model.

Everything else goes through `Resolver.resolve`, a two-stage LLM pipeline against Ollama (`format: "json"`):

1. **Intent classification.** The prompt lists 10 intents with one-line examples (`INTENT_SUMMARIES`). The model returns `{ intent }`, validated by `IntentResponseSchema` (a Zod enum).
2. **Argument extraction.** Skipped for `ADVANCE_YEAR`. Otherwise a second prompt names the intent and asks for its fields. `ARGUMENT_SCHEMAS[intent]` validates the reply into `{ target, duration?, conversationTopic?, actionType? }`.
3. **Command construction.** `_createCommand` maps intent + args to a `Command`, with defaults: unknown target becomes `"unknown"`, duration becomes `1`, save/load filename becomes `"autosave"`, and `STUDY` with no target becomes `"charms"`.

`_generate` is a validation and repair ladder:

1. `JSON.parse` + `schema.safeParse`.
2. If that "succeeds" with an empty object but the raw reply had keys, retry on the deep-flattened reply.
3. On failure, deep-flatten (lift nested keys, top-level wins) and re-validate.
4. On remaining enum failures, scan every string in the reply for an allowed value and patch it in.
5. Otherwise throw.

Any throw, including Ollama being unreachable, makes `resolve` return `{ type: "REST", duration: 1 }`.

## Strengths

- **Small, closed action set.** A fixed enum of intents means the model only picks a label, which is a task small models do reliably.
- **Cheap first stage.** The classification reply is one field, and the second call is skipped when unnecessary.
- **Validated boundary.** Zod guards every LLM reply, and `z.coerce.number()` absorbs `"2"` vs `2`.
- **Layered repair.** Flatten and enum-scan recover from common small-model sloppiness (nested wrappers, wrong key names) without extra LLM calls. Each rung has a test.
- **Never throws to the caller.** The engine always receives a command.
- **Schemas are data.** Adding an intent touches `INTENT_TYPES`, one summary, one schema and one `case`.
- **Testable.** The Ollama client is mockable, and the existing tests cover happy path, coercion, unavailable, non-JSON and three repair paths.

## Weaknesses

1. **No grounding in the game world.** Neither prompt contains the player's location, valid exits, NPCs present, known spells or subjects. The model is asked to guess `target` from raw text, then the string is used verbatim as a registry id (`registry.getLocation(destinationId)`, `getNPC(npcId)` in `TurnResolver`). "go to the great hall" yields `"great hall"` or `"great_hall"`, not necessarily `great-hall`. The result is `There is no "..." here.` for input a human would consider valid. This is likely the largest quality problem in the whole input path. **Status: fixed for `TALK` targets only.** `Resolver` takes the registry and `_groundNpc` matches the extracted text against NPC ids and names (`EntityMatcher.rankCandidates`). A single clear match is accepted with no extra model call; otherwise the model picks from a short list of real NPCs, and anything it cannot pick stays as the player's text, which `TurnResolver._talk` now rejects with no time cost. Locations, spells and subjects are still taken verbatim.
2. **No alias or fuzzy matching.** Nothing maps display names, nicknames or typos to ids after extraction, and nothing asks the player to disambiguate. (Done for NPCs, see 1; the matcher is generic and can be reused for the other targets.)
3. **~~Silent fallback to REST.~~ Fixed:** any failure now returns `{ type: "UNKNOWN", input }`; the engine answers "I didn't understand ..." directly (no narration, no time, no events). The original description follows. Any failure, such as a timeout, Ollama down, or unparseable reply, spends an in-game hour and narrates a rest as if the player chose it. The player gets no hint their input was not understood, which is worse than an error. `Command` has no `UNKNOWN`/`CLARIFY` variant.
4. **Placeholder defaults hide failures.** `"unknown"` targets, `"charms"` for study, and `"autosave"` for load turn missing arguments into plausible-looking commands. `STUDY` defaulting to a specific subject is a guess presented as intent.
5. **Partly fixed:** `save` and `load` skip the model (see Fast path). Every other command still costs two serial round trips, even unambiguous ones like `rest` or `north`, and the latency compounds with the renderer call (see system 02).
6. **Over-fitted repair code.** The deep-flatten and enum-scan ladder is ~100 lines compensating for unreliable structured output. Flatten can merge unrelated nested keys, and enum-scan can pick a wrong string (e.g. a word in an echoed input). Ollama supports schema-constrained output (`format: <JSON schema>`), which the Ollama client already supports for blueprints but the resolver does not use.
7. **Duplicated shape definitions.** `IntentType`, `ARGUMENT_SCHEMAS`, `ParsedArguments`, `INTENT_SUMMARIES` and the `Command` union each describe the same vocabulary, and they are only loosely tied together. `ParsedArguments` is a flat bag of optionals, so a `STUDY` reply can carry `actionType` and nothing complains. `Command` is also in `ui/cli/commands/`, the legacy CLI folder, so core imports from a legacy UI path. `_createCommand` uses `as any` for `STUDY`.
8. **Weak validation of values.** `duration` can be negative, zero, or huge (`study for 9999 hours`), and nothing clamps it. `conversationTopic` is free text that later drives `evaluateConversation`.
9. **No conversation context.** Each input is parsed alone, so "yes", "ask her about it", or "do that again" cannot resolve.
10. **Stateless model, repeated prompt.** The static intent list is rebuilt per call and the prompts have no few-shot examples. Models are told to infer from one-line hints.
11. **Logging noise.** `console.debug/warn/error` run in the terminal UI on every command.
12. **Test gaps.** No tests for argument defaults, intent mapping per type, invalid durations, or realistic mis-parses. Fallback behavior is tested as "REST", which locks in weakness 3.

## Rework ideas

- **Ground the parse.** Build a per-turn "world view" (current location, its exits, NPCs here, known spells, enrolled subjects, inventory) and either put it in the prompt as a closed list or resolve `target` against it afterward. Prefer returning a candidate id from a list over free text.
- **Add a deterministic matcher** between extraction and command creation: normalize, match against ids, display names and aliases, fuzzy-match with a threshold, and return ranked candidates.
- **Add `UNKNOWN`/`CLARIFY` commands** with a reason, so unparseable or ambiguous input produces "I didn't understand, did you mean X?" at zero in-game time.
- **Rule-based fast path first.** Handle `save x`, `load x`, `rest [n]`, `go/move <name>`, `talk to <name>`, `attend/study/practice <name>` with patterns, and call the LLM only for what the rules cannot parse. This makes the game playable and testable without Ollama.
- **One call, not two.** Request the full command in one schema-constrained reply (discriminated union by `type`), using Ollama structured outputs, and delete most of the repair ladder.
- **Single source of truth.** Derive the Zod schemas, the intent list, and the `Command` type from one discriminated-union definition, and move `Command` out of `ui/cli`.
- **Validate semantics** (positive, bounded durations; known topic vocabulary via `TopicRegistry`) before building the command.
- **Pass the last turn or two** of context for pronouns and "again".
- Make logging injectable.

## Open questions

- Do we want a free-text parser at all for every action, or a hybrid: a command palette and context menus plus natural language for conversation only?
- Should unknown input cost game time? (Proposal: never.)
- How strong a local model are we willing to require? That decides how much deterministic scaffolding is needed around the parse.

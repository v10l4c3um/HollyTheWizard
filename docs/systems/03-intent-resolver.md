# Intent Resolver (Input Parsing)

Files: `src/core/engine/Resolver.ts` (340 lines), `ResolverSchemas.ts` (72), `src/ui/cli/commands/Command.ts` (the `Command` type), tests in `src/test/resolver.test.ts` (8 cases).

## What it does

Turns free-form player text into a typed `Command` that `GameEngine` hands to `TurnResolver`. It is the only place the player's words are interpreted.

## How it works

**Fast path first.** `parseFastPath` (`FastPath.ts`) parses `undo`, `save` and `load` without the model (`undo` only as the single word; it takes back the last turn): `save`, `save game`, `save [game] [as|to] <name>`, `load`, `load game`, `load [game] [from] <name>`, where `<name>` is one `[A-Za-z0-9_-]+` token. A bare `save` writes `quicksave`; a bare `load` asks for `quicksave` and falls back to `autosave`. The rules are strict on purpose: "save the day" or "load up on potions" do not match and go to the model.

Everything else goes through `Resolver.resolve(input, view)`, a two-stage LLM pipeline against Ollama. Both replies are **constrained to a JSON schema** (`format` is the Zod schema converted with `z.toJSONSchema`), because in plain JSON mode the model invents its own keys (`{"move": ...}`) and validation fails. The engine builds a `WorldView` (`WorldView.ts`) from the committed state each turn and passes it in: the player's name, where they are, the discovered exits, the people here, the subjects (and the class held now), the spells (learned or not) and the inventory.

1. **Intent classification.** The prompt lists 10 intents with one-line examples (`INTENT_SUMMARIES`), the player's name (so "Harry goes to the library" is the player acting, not a person to talk to) and the names of the places, people and subjects, with the rules that going to a place is MOVE and greeting a person is TALK. The model returns `{ intent }`, validated by `IntentResponseSchema` (a Zod enum).
2. **Argument extraction.** The prompt shows the exact JSON shape wanted and only the closed list that matters for the intent (e.g. for MOVE the places reachable from here as `id = name`). \"duration\" is only asked for when the player says how long.
    Skipped for `ADVANCE_YEAR`. Otherwise a second prompt names the intent and asks for its fields. `ARGUMENT_SCHEMAS[intent]` validates the reply into `{ target, duration?, conversationTopic?, actionType? }`.
3. **Command construction.** `_createCommand` maps intent + args to a `Command`, with defaults: unknown target becomes `"unknown"`, duration becomes `1`, save/load filename becomes `"autosave"`, and `STUDY` with no target becomes `"charms"`.

**Follow-ups.** `GameEngine` records every in-world turn (`TurnRecorded` effect: what was typed, the command it became, where the player stood) in `GameState.recentTurns`, newest last, capped at five. Because it lives in the state, `undo`, rollback, `clone()`, saves and `load` handle it with no extra code. Three things use it, in this order:
1. `parseFollowUp` (`FollowUp.ts`, no model): `again`, `repeat [that]`, `do that again`, `the same`, `once more` copy the last command; `back`, `go back [there]`, `head back`, `return` move to where the last MOVE started. With nothing to repeat or go back to they answer with a hint. Strict patterns only ("go back to the library" is a normal sentence).
2. The argument prompt shows the recent turns (`"talk to Hermione" → talked to Hermione Granger (hermione_granger)`) so the model can resolve "ask her about it".
3. A code check on the answer: if the target is still a pronoun (`him her them he she it there that this one`), it is replaced by the newest matching thing for the intent (TALK → last person, MOVE → last place, STUDY/ATTEND_CLASS → last subject, PRACTICE → last spell, INTERACT → last item). No such thing means no target, so the player is asked. There is no gender data, so "him", "her" and "them" all mean the last person.

**Grounding** (`Resolver._ground`). The extracted `target` is never trusted as an id. For MOVE (places), TALK (people), STUDY/ATTEND_CLASS (subjects), PRACTICE (spells) and INTERACT (items): (1) a single clear match among the *preferred* things (exits, people here, learned spells) wins; (2) else a clear match among *all* of that kind, so the turn rules give the right refusal ("can't move there from here", "you haven't learned that spell"); (3) else the model picks from a short list (the best matches, or the preferred set) and only an offered id is accepted; (4) else the player's words are kept, and `TurnResolver` says what was not found and where the player can go. `EntityMatcher` scores ids, display names and aliases, including a full name found inside a longer sentence ("the library in main building" → Library). Durations outside 1–24 whole hours are dropped. Every resolver call is sent with `temperature: 0`, so the same input gives the same parse. Places can have `aliases` (see 16), which are matched and also shown to the intent classifier.

`_generate` is a validation and repair ladder (now rarely needed, since the reply is schema-constrained):

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

1. **Every in-world command costs two serial round trips,** even unambiguous ones like `rest` or `north`, plus a pick call when the target is ambiguous, and the latency compounds with the renderer call (see system 02). Only `save`, `load`, `undo` and the follow-ups skip the model.
2. **Over-fitted repair code.** The deep-flatten and enum-scan ladder is ~100 lines compensating for unreliable structured output. Flatten can merge unrelated nested keys, and enum-scan can pick a wrong string (e.g. a word in an echoed input). Both resolver calls (and the blueprint pipeline) now send the JSON schema as `format`, so the ladder is rarely reached; it is kept as a safety net and could be deleted once the one-call design below lands.
3. **Duplicated shape definitions.** `IntentType`, `ARGUMENT_SCHEMAS`, `ParsedArguments`, `INTENT_SUMMARIES` and the `Command` union each describe the same vocabulary, and they are only loosely tied together. `ParsedArguments` is a flat bag of optionals, so a `STUDY` reply can carry `actionType` and nothing complains. `Command` is also in `ui/cli/commands/`, the legacy CLI folder, so core imports from a legacy UI path. `_createCommand` uses `as any` for `STUDY`.
4. **Weak validation of values.** `duration` can be negative, zero, or huge (`study for 9999 hours`), and nothing clamps it. `conversationTopic` is free text that later drives `evaluateConversation`.
5. **Short conversation memory.** Only the last five in-world turns are remembered (see Follow-ups). Yes/no answers (the game asks no questions yet), compound sentences and references further back are not handled.
6. **Stateless model, repeated prompt.** The static intent list is rebuilt per call and the prompts have no few-shot examples. Models are told to infer from one-line hints.
7. **Logging noise.** `console.debug/warn/error` run in the terminal UI on every command.
8. **Test gaps.** No tests for argument defaults, intent mapping per type, invalid durations, or realistic mis-parses. Fallback behavior is tested as "REST", which locks in weakness 3.

## Rework ideas

- **Add `UNKNOWN`/`CLARIFY` commands** with a reason, so unparseable or ambiguous input produces "I didn't understand, did you mean X?" at zero in-game time.
- **Rule-based fast path first.** Handle `save x`, `load x`, `rest [n]`, `go/move <name>`, `talk to <name>`, `attend/study/practice <name>` with patterns, and call the LLM only for what the rules cannot parse. This makes the game playable and testable without Ollama.
- **A separate entity-resolution step (idea).** Replace the fuzzy lookup (`EntityMatcher`) with one more LLM call that receives the extracted phrase plus **all** candidates of that kind (every place, person, spell, subject, item, each with id, name, aliases and a short description) and answers with an id or `none`. Why it could be better: it understands paraphrases and descriptions the matcher cannot score ("the place with the books", "the tall professor", "that levitation spell"), needs no hand-written aliases for most cases, and one prompt shape serves every target kind. What it costs: another round trip (about a second on the 4B model) unless it is merged into argument extraction; the candidate list grows with the content (so the list may need pre-filtering by location, schedule and learned spells, which is what `preferred` already is); and the answer must still be accepted only if it is one of the offered ids. The matcher would stay as a free pre-filter and as the verifier of the model's answer. Today's pick step (`Resolver._ground`, step 3) is a restricted version of this: it only runs when the matcher is unsure and offers at most a few candidates.
- **One call, not two.** Request the full command in one schema-constrained reply (discriminated union by `type`), using Ollama structured outputs, and delete most of the repair ladder.
- **Single source of truth.** Derive the Zod schemas, the intent list, and the `Command` type from one discriminated-union definition, and move `Command` out of `ui/cli`.
- **Validate semantics** (positive, bounded durations; known topic vocabulary via `TopicRegistry`) before building the command.
- Make logging injectable.

## Open questions

- Would a dedicated LLM entity-resolution step over *all* candidates (see Rework ideas) beat the matcher plus aliases? Measure with `npm run eval:resolver` on phrases the matcher misses (paraphrases, descriptions) before building it.
- Do we want a free-text parser at all for every action, or a hybrid: a command palette and context menus plus natural language for conversation only?
- Should unknown input cost game time? (Proposal: never.)
- How strong a local model are we willing to require? That decides how much deterministic scaffolding is needed around the parse.

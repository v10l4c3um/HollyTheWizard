# Intent Resolver (Input Parsing)

Files: `src/core/engine/Resolver.ts`, `CommandSemantics.ts`, `ResolverPrompts.ts`, `FastPath.ts`, `FollowUp.ts`, `EntityMatcher.ts`, `WorldView.ts`, and `src/core/domain/commands/CommandDefinitions.ts` (the one definition of a command). Tests: `resolver.test.ts`, `resolver-grounding.test.ts`, `command-semantics.test.ts`, `command-definitions.test.ts`, `fast-path.test.ts`, `follow-up.test.ts`, `entity-matcher.test.ts`, `world-view.test.ts`, `grounded-input.test.ts`. Manual accuracy check: `npm run eval:resolver`.

## What it does

Turns free-form player text into a typed `Command` that `GameEngine` hands to a command handler. It is the only place the player's words are interpreted.

## How it works

**One definition of a command.** `CommandDefinitions.ts` holds a table with one entry per command: its Zod schema, a one-line summary for the prompt, whether the model may answer with it, whether it is an in-world turn, which fields the game fills in itself, and, for commands with a target, the target's field, kind (place, person, subject, spell, item) and the question to ask when it is missing. The `Command` type, the list of command types, the in-world set, the schema the model's reply is held to and the prompt's command list are all derived from it. A new command also needs a handler (the handler map is typed over `Command["type"]`) and a case in `buildCommand`; the compiler points at both.

`Resolver.resolve(input, view)` then works in this order, stopping at the first step that answers:

1. **Fast path** (`parseFastPath`, no model): `undo`, `save`, `load` exactly as typed. `save`, `save game`, `save [game] [as|to] <name>`, `load`, `load game`, `load [game] [from] <name>`, where `<name>` is one `[A-Za-z0-9_-]+` token. A bare `save` writes `quicksave`; a bare `load` asks for `quicksave` and falls back to `autosave`. The rules are strict on purpose: "save the day" or "load up on potions" go to the model.
2. **Follow-ups** (`parseFollowUp`, no model): `again`, `repeat [that]`, `do that again`, `the same`, `once more` copy the last command; `back`, `go back [there]`, `head back`, `return` move to where the last MOVE started. With nothing to repeat or go back to they answer with a hint. Strict patterns only ("go back to the library" is a normal sentence).
3. **One model call.** The whole command comes back as a single JSON object. The reply is **constrained to a schema** (`format` is the Zod schema converted with `z.toJSONSchema`; a union discriminated by `type`, with `conversationTopic` restricted to the topics in `TopicRegistry`) at temperature 0, because in plain JSON mode a small model invents its own keys. The reply is then read leniently: a number written as text ("3") is still a number, and a stray topic does not sink the whole reply. Anything that is not a command at all (bad JSON, unknown `type`, wrong field type, Ollama unreachable, timeout) ends in `UNKNOWN`; there is no repair ladder. The prompt puts what never changes first (instructions, the command list, the rules) and what changes every turn last (the player's name, the world, the recent turns, the sentence), so the model server can reuse its work on the unchanged start.
4. **Cleaning** (`cleanReply`, pure). A sentence made only of command words and pronouns ("study", "talk to", "go there") names nothing, whatever the model made of it; pronouns (`him her them he she it there that this one`) become the newest matching thing for the command (TALK → last person, MOVE → last place, STUDY/ATTEND_CLASS → last subject, PRACTICE → last spell, INTERACT → last item) or nothing; a duration outside 1–24 whole hours is dropped; a conversation topic the game does not know is dropped; a blank item verb is dropped.
5. **Grounding** (`Resolver._ground`). The target is never trusted as an id. (0) If the player's own sentence names a thing outright ("practice alohomora"), that wins over the model's id. (1) A single clear match among the *preferred* things (exits, people here, learned spells) wins; (2) else a single clear match among *all* of that kind, so the turn rules can give the right refusal ("can't move there from here", "you haven't learned that spell"); (3) else the model picks from a short list (the best matches, or the preferred set) in one extra call, and only an offered id is accepted; (4) else the player's words are kept, and `TurnResolver` says what was not found and where the player can go. `EntityMatcher` scores ids, display names and aliases (places have `aliases` too, see 16), typos, and a full name found inside a longer sentence ("the library in main building" → Library).
6. **Building** (`buildCommand`, pure). The real defaults are applied (one hour for a duration, the verb "use" for an item, the quick-save slots) or, if the target is still missing, the result is `UNKNOWN` with the command's question as a `hint` ("I didn't understand \"go\". Where do you want to go?"), at no cost in time.

**What the model sees** (`WorldView`, built from the committed state each turn): the player's name (so "Harry goes to the library" is the player acting, not a person to talk to), where they are, the discovered exits, the people here, the subjects and the class held now, the spells (learned or not), the inventory and the last turns. Places and people come with their nicknames, so "visit Hagrid's hut" reads as a place.

**Follow-up memory.** `GameEngine` records every in-world turn (`TurnRecorded` effect: what was typed, the command it became, where the player stood) in `GameState.recentTurns`, newest last, capped at five. Because it lives in the state, `undo`, rollback, `clone()`, saves and `load` handle it with no extra code. There is no gender data, so "him", "her" and "them" all mean the last person.

Live accuracy on the local qwen3-4b model (`npm run eval:resolver`, 71 phrases covering all commands, typos, nicknames, third person, follow-ups, missing targets, topics and durations): **71/71**. Latency: about 0.8 s per phrase that reaches the model, the same as the earlier two-call design (the single prompt is longer, which cancels the saved round trip).

## Strengths

- **One definition per command.** The type, schemas, prompt list, grounding and hints all derive from `CommandDefinitions.ts`.
- **Deterministic first.** Save, load, undo, repeat and go-back never reach the model, so they are instant, work offline and cannot be misread.
- **The model proposes, the code decides.** Every reply is schema-constrained, then cleaned, grounded against the game's own content and validated before it becomes a command.
- **Never throws to the caller.** The engine always receives a command; failure is `UNKNOWN`, which costs no time.
- **Measured.** A live eval set guards prompt and grounding changes, and the whole path is covered offline with a mocked model.

## Weaknesses

1. **Every in-world command waits for the model** (about 0.8 s on the 4B model) and then for the renderer (see system 02). One call instead of two did not make it faster here; the next gains would come from a smaller prompt or a faster model.
2. **Small-model intent errors are possible.** The prompt rules ("a lesson or lecture is ATTEND_CLASS, a place named after a person is still a place") were written to fix specific misses and the eval set is the only guard; a new phrasing can still go wrong.
3. **Short conversation memory.** Only the last five in-world turns are remembered. Yes/no answers (the game asks no questions yet), compound sentences ("go to the library and read") and references further back are not handled.
4. **No example sentences in the prompt.** The model works from rules and lists alone.

## Rework ideas

- **A `CLARIFY` flow** with follow-up questions: today a missing target gives a one-shot hint ("Where do you want to go?") and the player has to retype the whole sentence.
- **A separate entity-resolution step (idea).** Replace the fuzzy lookup (`EntityMatcher`) with one more LLM call that receives the extracted phrase plus **all** candidates of that kind (every place, person, spell, subject, item, each with id, name, aliases and a short description) and answers with an id or `none`. Why it could be better: it understands paraphrases and descriptions the matcher cannot score ("the place with the books", "the tall professor", "that levitation spell"), needs no hand-written aliases for most cases, and one prompt shape serves every target kind. What it costs: another round trip (about a second on the 4B model) unless it is merged into the command call; the candidate list grows with the content (so it may need pre-filtering by location, schedule and learned spells, which is what `preferred` already is); and the answer must still be accepted only if it is one of the offered ids. The matcher would stay as a free pre-filter and as the verifier of the model's answer. Today's pick step (`Resolver._ground`, step 3) is a restricted version of this: it only runs when the matcher is unsure and offers at most a few candidates.
- **Few-shot examples** for the phrasings that go wrong most, kept short so the prompt does not grow.

## Open questions

- Would a dedicated LLM entity-resolution step over *all* candidates (see Rework ideas) beat the matcher plus aliases? Measure with `npm run eval:resolver` on phrases the matcher misses (paraphrases, descriptions) before building it.
- Do we want a free-text parser at all for every action, or a hybrid: a command palette and context menus plus natural language for conversation only?
- Should unknown input cost game time? (Proposal: never.)
- How strong a local model are we willing to require? That decides how much deterministic scaffolding is needed around the parse.

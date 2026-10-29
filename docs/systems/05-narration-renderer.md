# Narration Renderer

Files: `src/core/engine/Renderer.ts` (71 lines), `RenderContext.ts` (15), context built in `GameEngine._buildRenderContext`, tests in `src/test/renderer.test.ts` (3 cases). Config: `DEFAULT_RENDERER_OLLAMA_CONFIG` in `src/ai/OllamaConfig.ts`.

## What it does

Turns the deterministic result of a turn into the paragraph the player reads. It is the second of the two per-turn LLM calls and the only one the player directly sees.

## How it works

1. `GameEngine._buildRenderContext` assembles a `RenderContext`: the turn's `briefOutput` (a plain-English summary written by `TurnResolver`), player name, location name and description, time of day, "nearby" NPC names, the last 5 recent events, `narrationMode`, and optionally how much time passed.
2. `Renderer._buildPrompt` formats that into one prompt: write a single 3 to 5 sentence second-person paragraph, "only translate game events", do not invent causes, magic, lore or obstacles, treat failures neutrally.
3. `generateWithOllama` (free text, no JSON format) returns the text, which is trimmed and stored in `state.output`.
4. On any error (including the 30 s render timeout), it logs and returns the turn's `briefOutput`, the plain facts, so the result is never lost.

## Strengths

- **Tiny and focused.** 71 lines with one job and one dependency, which makes it easy to understand and replace.
- **The right division of labor.** The prompt explicitly forbids inventing facts, and the facts come from the rules layer. This is the core idea of the project, and the renderer respects it.
- **Never breaks the turn.** Failure produces a string, not an exception, so the game continues.
- **Context is explicit data (`RenderContext`),** not a grab-bag of state, so the contract between engine and prose is clear.
- **Time-of-day hint** gives the model a natural way to mention the passing of time.
- **Tests exist** for success, Ollama unavailable and malformed response.

## Weaknesses

1. **~~Fallback destroys the game's information.~~ Fixed:** the fallback now shows `briefOutput`. The original description follows. When the LLM is down, the player sees "Nothing happened. AI narration is unavailable." even if they just learned a spell, moved rooms or got a revelation. `briefOutput` already holds the true result and is thrown away. This contradicts the invariant that the game stays playable without Ollama, and the game is nearly unplayable in that state.
2. **Conversation tone never reaches the narrator.** `evaluateConversation` computes `narrationTags` (`tense`, `guarded`, `hostile`, `private-setting`, ...) specifically "for tone adjustment", but they travel only on a bus event (`ConversationResolved`). `RenderContext` has no field for them, and nothing else reads them. Likewise, `TurnResult.effects` was meant for an "effects summary" and is unused by the renderer. So the narrator sees only a flat sentence like "Holly deflected your question".
3. **Thin world and character context.** The prompt has no NPC personality or speech style (`Npc.dialogue`, profiles), no relationship state, no spells or inventory, and no active goals or story state (blueprint). "Nearby" is every NPC the player has ever met, not who is actually here (`knownNPCIds`), so the model can describe people who are not present.
4. **Dialogue is not modeled.** A conversation produces one sentence of summary ("X opened up about Y. You learned something significant."), and the model must invent what was said. That risks contradicting clues or topics the engine actually revealed, because the content of a reveal is not passed in. The "do not invent" rule conflicts with a task that requires inventing dialogue.
5. **Weak enforcement of "no invention".** The only control is a prompt instruction to a small 8B model. There is no validation, such as checking that mentioned NPC or location names are in the allowed set, or that the facts in `briefOutput` appear.
6. **No continuity.** Only the last three event strings are shown, with no history of previous narration. Consecutive turns can repeat phrasing, contradict each other, or restate the setting every time.
7. **Latency on every turn,** including trivial or failed actions (`There is no "x" here.`) and meta commands. Narration is not streamed, so the player waits for the whole paragraph with a spinner.
8. **Fixed format.** Always exactly one 3 to 5 sentence paragraph, no matter whether the action was a 2-minute step or a major reveal. `narrationMode` is passed through as an unexplained string (only `"default"` exists in `GameState`), and `romanceIntensity` is a setting that is never used here.
9. **Config risk.** `debugMode: true` is the default in the renderer's Ollama config, and `resolveTimeout` returns no timeout when `debugMode` is set, so a hung model can stall a turn forever.
10. **Mechanical information is lost.** Numeric results (knowledge gained, proficiency, success counts) live in `briefOutput` and may or may not survive the paraphrase. There is no separate, reliable "facts panel" next to the prose.
11. **Prompt hygiene.** The prompt embeds raw `briefOutput`, location text and event strings directly, with no escaping or length limits. Player-provided strings (e.g. a topic from the parse) can end up in the prompt.
12. **Testing.** Tests check only that the mocked text or fallback is returned; nothing checks prompt contents, tone handling or the no-invention rule.

## Rework ideas

- **Deterministic fallback narrator.** Build a template-based renderer from structured facts, used when Ollama fails or is disabled. It would be the reference output, and the LLM becomes an optional polish pass. This makes the game fully playable and testable offline.
- **Send structured facts, not a sentence.** Replace `briefOutput` with a `NarrationFacts` object: action type, outcome, entities involved (ids and display names), conversation result and tags, effects summary, location, time. Both the template and LLM renderers consume it.
- **Show mechanics separately** (a small log or status line listing "+10 Charms, Lumos proficiency 42") so numbers do not depend on the model.
- **Add grounding.** Present NPCs only (needs a presence model, see 17), profile and speech style for the NPC involved, relationship tier in words, relevant clue or topic text for reveals.
- **Lightly validate the output:** check that any known proper names in the text are on the allow list, that length is within bounds, and retry or fall back otherwise.
- **Vary format by importance:** one line for routine actions, a fuller scene for reveals, invitations and exams.
- **Short narration memory** (last 2 narrations, or a rolling summary) to keep tone and avoid repetition.
- **Stream tokens** to the UI to reduce perceived latency, and skip the LLM for failures and meta commands.
- Fix config defaults (`debugMode` off, bounded timeout).

## Open questions

- Is the LLM narration the product, or a flavor layer on top of a game that stands on its own text? That decides whether the template fallback is a safety net or the primary renderer.
- Should NPC dialogue be generated by the LLM, or authored and selected by the engine (with the LLM only rephrasing)? Authored lines are the only way to guarantee that reveals match the clues the engine hands out.
- Do we want a persistent transcript or journal, and should the narrator see it?

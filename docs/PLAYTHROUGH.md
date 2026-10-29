# Starting playthrough: your first week

A short, complete route through the game: attend your first Charms lessons, learn the levitation charm, master it, and save. It mirrors `src/test/golden-path.test.ts`, which runs the same route under a fake LLM, so it is known to work.

You type natural language, so the exact words below are only suggestions. The resolver (the LLM) turns them into a command; if it cannot, the game says `I didn't understand ...` and no time passes.

## Before you start

- Ollama running with the models listed in the README (the game will not start without it).
- `npm start`, then choose to start a new game. Startup generates the story blueprint, which can take a while on the first run.

## The route

You begin in the **Great Hall** on **Monday morning** (day 1). Charms is taught in the **Classroom** on Monday and Thursday mornings.

1. **Go to the classroom.** `go to the corridor`, then `go to the classroom`. Each move costs a few minutes.
2. **Attend the first lesson.** `attend charms class`. You gain Charms knowledge, and the lesson is marked done. Attending the same class twice in one slot is refused and costs no time.
3. **(Optional) Meet someone.** Hagrid is on the **grounds**. `go to the grounds`, then `chat with Hagrid about everyday things`. Talking raises trust over repeated chats. NPCs are only available where their schedule puts them: asking for someone who is elsewhere fails without spending time.
4. **Wait for Thursday.** `rest` in one-hour steps (for example `wait an hour`) until it is Thursday morning, and be in the classroom. `rest` / `wait` advances time. Letting a class period pass without attending it shows a "You missed … class" note (no penalty yet), and the game autosaves each time a new day begins, which is what the menu's Continue loads.
5. **Attend the second lesson.** `attend charms class`. This teaches the **levitation charm**, and your spellbook shows it as learned.
6. **Practise.** `practice levitate`. Longer sessions (`practice levitate for 3 hours`) build proficiency faster. Keep going until the spell is **mastered**; that sets the `mastered:levitate` flag the story blueprint can react to.
7. **Save.** `save firstweek` (or just `save`, which writes `quicksave`). Later: `load firstweek`, or just `load` for the quick save (falling back to the autosave). These two commands are parsed without the language model. Saves live in `./saves/` and are tied to the game's content: a save that is incomplete, or refers to places, spells or characters the game no longer has, is refused with the reason, and your running game is untouched.

## Useful things to try

- Write naturally: `Harry goes to the library in the main building`, `have a word with Rubeus`, `sit in on the charms lesson`, `practise wingardium leviosa`. The game matches what you wrote against the places, people, subjects and spells that exist, so names, nicknames and small typos are fine. Where the model can't tell, a refusal lists where you can go.
- `npm run eval:resolver` measures how well your local model understands a set of such phrases.
- `undo` takes back your last action (up to 20 turns, and not across a `load`). Time, place, spells and relationships all go back.
- `spellbook` (or press Tab) toggles the spellbook panel.
- `study` a subject between classes.
- `go to the library`, `go to the village`, `go to the market`: you can only travel to places you have found. Arriving somewhere shows its exits, and going there marks it visited.
- Nonsense input is reported and costs nothing.
- `advance` moves to the next school year (it generates the next year's blueprint).

## If something does not work

- *"Startup failed: ..."* Ollama is unreachable or a model is missing (`ollama pull <model>`).
- *"I didn't understand ..."* Rephrase; short, concrete sentences parse best.
- Verify the engine without the LLM: `npx jest src/test/golden-path.test.ts`.

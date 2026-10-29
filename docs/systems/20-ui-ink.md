# Terminal UI (Ink)

Files: `src/ui/ink/entry.ts` (entry point), `InkApp.tsx` (206 lines, phase state machine and menu/options), `components/` — `GameScreen.tsx`, `CommandInput.tsx` (164), `OutputPanel.tsx`, `Hud.tsx`, `SpellbookWidget.tsx`, `MainMenu.tsx`, `LoadingScreen.tsx`, `AsciiTitle.tsx`; `ui/ink/package.json` (`"type": "module"`). Start script: `npm start`. No UI tests.

## What it does

The whole player-facing experience: a title and menu, a loading screen showing startup milestones, and the game screen (HUD, narration log, command line, optional spellbook panel), built with React and Ink.

## How it works

- **`InkApp`** is a four-phase machine: `menu`, `loading`, `game`, `startup-error`. It receives `engineFactory` and `locationNameResolver` as props. Choosing New Game, Continue or Load runs `engineFactory(onProgress)`, updates six loading milestones, and, for Continue and Load, sends the text `load autosave` through the engine (see 19) and shows the reason if the save is refused. A startup error is shown and the app exits after 1.8 s.
- **`GameScreen`** holds `state`, a list of output lines and a `busy` flag. On submit it handles `quit` and `spellbook` locally, otherwise awaits `engine.handleCommand(cmd)`, appends `▶ cmd` plus the outcome's `narration` lines (marked `✗` when `outcome.error` is set) to the log, and re-renders.
- **`CommandInput`** is a hand-written line editor: blinking cursor, history on up/down, a catalog of 13 known commands with live hints, and an error for an unknown first word.
- **`Hud`** shows clock, location, health/mana/energy bars, player name, archetype and year. **`SpellbookWidget`** lists non-hidden spells with state colours. **`OutputPanel`** shows the last 14 lines in a bordered box.

## Strengths

- **A good-looking, readable terminal layout** with a clear information hierarchy (HUD on top, log in the middle, input at the bottom).
- **The UI depends on a narrow engine interface** (`IGameEngine`: `state` and `handleCommand`), so the engine can be tested and swapped independently.
- **Useful startup feedback:** real milestones, not a blind spinner, and a visible failure message.
- **Command hints and history** make a text interface friendlier, and the busy state is shown (yellow border, hourglass).
- **Small, separate components** with simple props, easy to restyle.
- **The "factory as prop" composition** keeps the UI free of construction logic.

## Weaknesses

1. **The input gate blocks natural language.** `CommandInput` rejects any line whose first word is not in a 13-word catalog (`move, go, study, practice, cast, rest, talk, inspect, spellbook, save, load, help, quit`). The whole LLM resolver exists to understand free text, but "I'd like to head to the market" or "ask Hagrid about dragons" never reaches it. Two engine commands are unreachable from the UI at all: **`attend`** (`ATTEND_CLASS`) and **`advance`** (`ADVANCE_YEAR`) are not in the catalog, so "attend charms class" is refused as an unknown command. Meanwhile `help` and `inspect` are advertised but have no handler; the resolver would map them to some other intent. The footer promises "Tab spellbook", and Tab is not handled.
2. **Two input models, not reconciled.** The product says free text; the UI behaves like a verb-noun command line. Catalog words also do not line up with engine intents (`cast` is shown as an alias of `practice`; there is no cast).
3. **Hand-rolled text input is fragile.** It appends one character at a time and only accepts input of length 1, so pasted text and multi-character input (IME, some terminals) are dropped. There is no left/right cursor movement, no word delete, no Home/End. The installed `ink-text-input` dependency is not used. A 500 ms blink timer re-renders the input constantly.
4. **Key handling collides.** `SpellbookWidget` (interactive) and `CommandInput` both listen to up/down at the same time: scrolling the spellbook also walks the command history and vice versa.
5. **The log does not behave like a log.** `OutputPanel` shows the last 14 *lines*, not rows, so one long wrapped paragraph can occupy many rows and push the layout; there is no scrolling back, no wrapping control, no timestamps, and no way to save a transcript. Narration paragraphs are the main content of the game, and they sit in a small, fixed box.
6. **Missing information the player needs.** There is no panel for exits, who is here, active goals, time left in the period, inventory, clues or a journal. Attributes are commented out in the HUD ("TODO: Rework for new attributes"). The player cannot see the effects of an action (numbers, relationship changes) except as prose.
7. **The Options screen is fake.** It shows static text ("Narration mode: AI / Fallback", "Romance intensity: medium"), changes nothing, and does not even match the state (`romanceIntensity` is 0). The menu entries "Continue" and "Load Save" are the same action.
8. **UI is coupled to domain classes.** `GameScreen` and `Hud` import `GameState`, and `SpellbookWidget` imports `SpellBook` and spell types directly, contradicting the pipeline doc's claim that the UI has no direct imports of game internals. A view-model layer (plain data for the HUD, log and panels) would isolate it.
9. **Engine output collides with rendering.** Core code writes `console.log/debug/warn/error` (pack loading, `[TIME DEBUG]`, resolver debug, Ollama request bodies) directly to stdout, which corrupts the Ink screen. There is no logger and no log pane.
10. **A second registry.** `locationNameResolver` lazily calls `buildRegistry()` again (re-reading all content packs and printing logs) instead of asking the engine's registry for names, and it would show stale names if the engine's content differed.
11. **Latency handling is minimal.** During the up-to-three LLM calls per turn, the user sees only a yellow border; there is no "thinking" message, elapsed time, streaming, or cancel (see 18).
12. **Quit and error paths are abrupt.** Startup errors flash for 1.8 s and exit, and "quit" in game does not offer to save.
13. **Accessibility and portability.** Colour is the only carrier for several states (spell states, bars), emoji icons assume font support, layouts assume a wide terminal, and nothing handles resize or small windows. There is no plain/no-colour mode.
15. **No tests** for any component (Ink offers `ink-testing-library`), including the input parser.

## Rework ideas

- **Decide the interaction model first** (see Open questions), then make the input layer match it: either let free text through to the resolver (keep suggestions as non-blocking autocomplete), or make a verb-based parser with contextual menus the primary path and the LLM an opt-in layer.
- **Context-aware choices:** show the available actions right now (go to X, talk to Y, attend the class, practice Z) as a selectable list or numbered options, generated from the engine's state. This removes most parsing failures, helps new players, and is the natural home of the `LOOK` view (see 16).
- **Use a proven input component** (`ink-text-input` or a custom one that supports paste, cursor movement and history), and give focus to one widget at a time.
- **Build a proper layout:** a scrollable transcript (wrapped rows, scrollback, optional typewriter or streaming output), a persistent side panel (location, exits, people here, time, current goals), and a status line for effects ("+10 Charms, trust +1").
- **View-model boundary:** the engine returns a `TurnView`/`StateView` (plain data) that the UI renders; the UI no longer imports domain classes or `GameState`.
- **Own the console:** a logger interface injected into core, with a file sink by default and an optional debug pane in the UI.
- **Real options screen** wired to settings (narration mode, model, timeouts, colours, text speed) and persisted.
- **Save/load and slot UI** in the menu (see 19), a journal/inventory/map overlay, a help screen, and a graceful quit with autosave.
- **Fix re-render by design:** the engine emits change notifications or returns immutable snapshots, and the UI subscribes.
- **Add component tests** with `ink-testing-library` and snapshot a few key screens.
- Consider whether Ink is the right long-term host; a thin UI contract (`TurnView` in, command string or choice id out) keeps a web or desktop front end possible.

## Open questions

- **Free text or choices?** Is the player expected to type sentences (the LLM-first vision), pick from options (a classic text adventure with menus), or both? The answer drives the resolver (03), the narrator (05) and this layer.
- How much of the simulation should be visible as numbers versus prose?
- Is the terminal the final platform, or just the prototype front end?
- Should the narration stream and look "typed", or appear at once?

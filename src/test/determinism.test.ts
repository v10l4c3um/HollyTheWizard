import { resetFakeOllama, scriptPlayer } from "./helpers/fakeOllama";
import { buildTestGame, TestGame } from "./helpers/buildTestGame";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";

jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

/** Luck lives in the game state, so the same state and commands always play out the same. */
describe("replayable luck", () => {
	let game: TestGame;
	const spies: jest.SpyInstance[] = [];

	beforeEach(async () => {
		resetFakeOllama();
		for (const m of ["log", "debug", "error", "warn"] as const) {
			spies.push(jest.spyOn(console, m).mockImplementation());
		}
		game = await buildTestGame(); // the default, seeded source
		game.engine.state.spellbook.setSpellState(
			"levitate",
			createLearnedSpellState("levitate", "test"),
		);
		game.engine.state.randomState = 20240607;
	});
	afterEach(async () => {
		spies.forEach((s) => s.mockRestore());
		spies.length = 0;
		await game.dispose();
	});

	const practice = async () => {
		scriptPlayer("practise a lot", { intent: "PRACTICE", args: { target: "levitate", duration: 5 } });
		await game.engine.handleCommand("practise a lot");
		const spell = game.engine.state.spellbook.getSpellState("levitate")!;
		return { proficiency: spell.proficiency, points: spell.practicePoints, random: game.engine.state.randomState };
	};

	it("two games from the same state play out identically", async () => {
		const first = await practice();
		const second = await (async () => {
			const other = await buildTestGame();
			try {
				other.engine.state.spellbook.setSpellState("levitate", createLearnedSpellState("levitate", "test"));
				other.engine.state.randomState = 20240607;
				scriptPlayer("practise a lot", { intent: "PRACTICE", args: { target: "levitate", duration: 5 } });
				await other.engine.handleCommand("practise a lot");
				const spell = other.engine.state.spellbook.getSpellState("levitate")!;
				return { proficiency: spell.proficiency, points: spell.practicePoints, random: other.engine.state.randomState };
			} finally {
				await other.dispose();
			}
		})();
		expect(second).toEqual(first);
	});

	it("undoing a practice session and repeating it gives the same result", async () => {
		const first = await practice();
		await game.engine.handleCommand("undo");
		expect(game.engine.state.randomState).toBe(20240607);
		expect(await practice()).toEqual(first);
	});

	it("a saved game continues with the same luck after it is loaded", async () => {
		await game.engine.handleCommand("save here");
		const first = await practice();
		await game.engine.handleCommand("load here");
		expect(await practice()).toEqual(first);
	});

	it("the next session after a roll differs from the first (the luck moves on)", async () => {
		const first = await practice();
		const second = await practice();
		expect(second.random).not.toBe(first.random);
	});
});

import { resetFakeOllama, scriptPlayer } from "./helpers/fakeOllama";
import Renderer from "../core/engine/Renderer";
import { buildTestGame, TestGame } from "./helpers/buildTestGame";

jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

describe("a turn is a transaction", () => {
	let game: TestGame;
	const logSpies: jest.SpyInstance[] = [];

	beforeEach(async () => {
		resetFakeOllama();
		for (const method of ["log", "debug", "error", "warn"] as const) {
			logSpies.push(jest.spyOn(console, method).mockImplementation());
		}
		game = await buildTestGame();
	});
	afterEach(async () => {
		logSpies.forEach((spy) => spy.mockRestore());
		logSpies.length = 0;
		await game.dispose();
	});

	const say = (input: string, intent: string, args?: Record<string, unknown>) => {
		scriptPlayer(input, { intent, args });
		return game.engine.handleCommand(input);
	};
	const move = (target: string) => say(`go to ${target}`, "MOVE", { target });
	const here = () => game.engine.state.currentLocationId;
	const clock = () => game.engine.state.worldClock.getTotalMinutes();

	it("returns a new state object after every successful turn and leaves the old one alone", async () => {
		const first = game.engine.state;
		const firstJson = JSON.stringify(first);

		const outcome = await move("hallway");

		expect(outcome.error).toBeUndefined();
		expect(outcome.state).not.toBe(first);
		expect(outcome.state).toBe(game.engine.state);
		expect(outcome.state.currentLocationId).toBe("hallway");
		expect(JSON.stringify(first)).toBe(firstJson);

		const second = outcome.state;
		const secondJson = JSON.stringify(second);
		await say("rest", "REST", { duration: 1 });
		expect(game.engine.state).not.toBe(second);
		expect(JSON.stringify(second)).toBe(secondJson);
	});

	it("rolls back a turn that changed things and then threw", async () => {
		const before = game.engine.state;
		const snapshot = JSON.stringify(before);
		const spy = jest
			.spyOn(game.turnResolver, "decide")
			.mockImplementation((_c, state) => {
				state.currentLocationId = "forest";
				state.worldClock.advanceTime(600);
				state.flags["half-done"] = true;
				throw new Error("boom");
			});
		try {
			const outcome = await say("rest", "REST", { duration: 1 });

			expect(outcome.error?.kind).toBe("internal");
			expect(game.engine.state).toBe(before);
			expect(here()).toBe("great_hall");
			expect(game.engine.state.flags["half-done"]).toBeUndefined();
			// Only the failure message was written to the restored state.
			const restored = JSON.parse(JSON.stringify(game.engine.state));
			restored.output = JSON.parse(snapshot).output;
			expect(JSON.stringify(restored)).toBe(snapshot);
		} finally {
			spy.mockRestore();
		}
	});

	it("rolls back a typed failure too, and keeps the same state object", async () => {
		const before = game.engine.state;
		const outcome = await game.engine.handleCommand("asdf qwer zxcv"); // unscripted
		expect(outcome.error?.kind).toBe("invalid-input");
		expect(game.engine.state).toBe(before);
		// ...and the next turn still works normally.
		expect((await move("hallway")).error).toBeUndefined();
	});

	it("rolls back when the narrator crashes after the rules already ran", async () => {
		const before = game.engine.state;
		const spy = jest.spyOn(Renderer.prototype, "render").mockRejectedValue(new Error("llm gone"));
		try {
			const outcome = await move("hallway");
			expect(outcome.error?.kind).toBe("internal");
			expect(game.engine.state).toBe(before);
			expect(here()).toBe("great_hall");
		} finally {
			spy.mockRestore();
		}
	});

	it("keeps bus-driven quest flags that were set during the turn", async () => {
		await move("hallway");
		expect(game.engine.state.questFlags.active).toContain("discovered:classroom");
	});

	it("autosaves the committed state at the start of a day", async () => {
		await say("rest all day", "REST", { duration: 16 });
		const saved = JSON.parse(
			await require("fs/promises").readFile(`${game.savesDir}/autosave.json`, "utf-8"),
		);
		expect(saved.worldClock.totalMinutes).toBe(clock());
	});

	describe("undo", () => {
		const undo = () => game.engine.handleCommand("undo");

		it("takes back the last turn: place, clock and flags", async () => {
			const startClock = clock();
			await move("hallway");
			await say("rest", "REST", { duration: 2 });
			expect(here()).toBe("hallway");

			const outcome = await undo();

			expect(outcome.error).toBeUndefined();
			expect(outcome.narration).toBe("Undid your last action.");
			expect(here()).toBe("hallway");
			expect(clock()).toBe(startClock + 5);
			expect(outcome.state).toBe(game.engine.state);
		});

		it("can go back several turns, then has nothing left", async () => {
			const startClock = clock();
			await move("hallway");
			await move("classroom");
			await undo();
			expect(here()).toBe("hallway");
			await undo();
			expect(here()).toBe("great_hall");
			expect(clock()).toBe(startClock);
			expect(game.engine.state.questFlags.active).not.toContain("discovered:classroom");

			const outcome = await undo();
			expect(outcome.error?.kind).toBe("invalid-input");
			expect(outcome.narration).toBe("There is nothing to undo.");
			expect(here()).toBe("great_hall");
		});

		it("the next turn after an undo builds on the undone state", async () => {
			await move("hallway");
			await move("classroom");
			await undo();
			await move("library");
			expect(here()).toBe("library");
			await undo();
			expect(here()).toBe("hallway");
		});

		it("does not run the world tick or go back past a load", async () => {
			await move("hallway");
			await game.engine.handleCommand("save here");
			await move("classroom");
			await game.engine.handleCommand("load here");
			expect(here()).toBe("hallway");

			expect((await undo()).error?.message).toBe("There is nothing to undo.");
		});
	});
});

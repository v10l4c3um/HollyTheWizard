import { resetFakeOllama, scriptPlayer, unscriptedInputs } from "./helpers/fakeOllama";
import { buildTestGame, TestGame } from "./helpers/buildTestGame";
import { moveToNpc } from "./helpers/placePlayer";

jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

describe("what the player just did shapes the next sentence", () => {
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

	const say = (input: string, intent: string, args: Record<string, unknown> = {}) => {
		scriptPlayer(input, { intent, args });
		return game.engine.handleCommand(input);
	};
	const here = () => game.engine.state.currentLocationId;
	const clock = () => game.engine.state.worldClock.getTotalMinutes();
	const turns = () => game.engine.state.recentTurns;

	it("records in-world turns only, with the place they started from", async () => {
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await game.engine.handleCommand("save here"); // a save is not an in-world turn
		expect(turns()).toEqual([
			{
				input: "go to the corridor",
				command: { type: "MOVE", destinationId: "hallway" },
				fromLocationId: "great_hall",
			},
		]);
	});

	it("repeats the last action", async () => {
		await say("rest two hours", "REST", { duration: 2 });
		const before = clock();
		const outcome = await game.engine.handleCommand("again");
		expect(outcome.error).toBeUndefined();
		expect(clock()).toBe(before + 120);
		expect(unscriptedInputs).toEqual([]); // the model was never asked
	});

	it("goes back to where the last move started", async () => {
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await say("go to the library", "MOVE", { target: "library" });
		expect(here()).toBe("library");
		await game.engine.handleCommand("go back");
		expect(here()).toBe("hallway");
		await game.engine.handleCommand("go back"); // back to the library, the move before
		expect(here()).toBe("library");
	});

	it("understands 'her' after talking to someone", async () => {
		moveToNpc(game.engine.state, game.registry, "hermione_granger");
		await say("talk to Hermione", "TALK", { target: "hermione_granger" });
		const outcome = await say("ask her about the exam", "TALK", {
			target: "her",
			conversationTopic: "academic_performance",
		});
		expect(outcome.error).toBeUndefined();
		expect(turns()[1].command).toMatchObject({
			type: "TALK",
			npcId: "hermione_granger",
			conversationTopic: "academic_performance",
		});
	});

	it("says there is nothing to repeat or to go back to in a new game", async () => {
		expect((await game.engine.handleCommand("again")).narration).toContain(
			"There is nothing to repeat yet.",
		);
		expect((await game.engine.handleCommand("go back")).narration).toContain(
			"You haven't gone anywhere yet.",
		);
	});

	it("undo forgets the undone turn, so 'again' repeats the one before", async () => {
		await say("rest an hour", "REST", { duration: 1 });
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await game.engine.handleCommand("undo");
		expect(turns().map((t) => t.command.type)).toEqual(["REST"]);

		const before = clock();
		await game.engine.handleCommand("again");
		expect(clock()).toBe(before + 60);
		expect(here()).toBe("great_hall");
	});

	it("keeps the history through a save and load", async () => {
		await say("rest an hour", "REST", { duration: 1 });
		await game.engine.handleCommand("save here");
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await game.engine.handleCommand("load here");
		expect(turns().map((t) => t.command.type)).toEqual(["REST"]);

		const before = clock();
		await game.engine.handleCommand("again");
		expect(clock()).toBe(before + 60);
	});

	it("does not remember a turn that failed", async () => {
		await game.engine.handleCommand("asdf qwer zxcv"); // unscripted: not understood
		expect(turns()).toEqual([]);
	});
});

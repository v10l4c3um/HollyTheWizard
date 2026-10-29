import {
	FAKE_NARRATION,
	resetFakeOllama,
	scriptPlayer,
} from "./helpers/fakeOllama";
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

describe("TurnOutcome", () => {
	let game: TestGame;
	const logSpies: jest.SpyInstance[] = [];

	beforeAll(async () => {
		resetFakeOllama();
		for (const method of ["log", "debug", "error", "warn"] as const) {
			logSpies.push(jest.spyOn(console, method).mockImplementation());
		}
		game = await buildTestGame();
	});

	beforeEach(() => {
		game.logged.length = 0;
	});

	afterAll(async () => {
		logSpies.forEach((spy) => spy.mockRestore());
		await game.dispose();
	});

	function say(input: string, intent: string, args?: Record<string, unknown>) {
		scriptPlayer(input, { intent, args });
		return game.engine.handleCommand(input);
	}

	it("has no error on a normal turn", async () => {
		const outcome = await say("look around", "REST", { duration: 0 });
		expect(outcome.error).toBeUndefined();
		expect(outcome.narration).toBe(FAKE_NARRATION);
		expect(outcome.state).toBe(game.engine.state);
		expect(game.logged).toEqual([]);
	});

	it("reports input it could not understand as invalid-input, without logging", async () => {
		const outcome = await game.engine.handleCommand("asdf qwer zxcv");
		expect(outcome.error?.kind).toBe("invalid-input");
		expect(outcome.narration).toContain("didn't understand");
		// Not a fault of the game: nothing is logged as a failed turn. (The resolver
		// still notes, in the same log, that the model had no answer.)
		expect(game.logged.filter((e) => !e.message.startsWith("[Resolver]"))).toEqual([]);
	});

	it("reports a missing save as a persistence error and logs the cause", async () => {
		const outcome = await say("load nosuchsave", "LOAD", {
			target: "nosuchsave",
		});
		expect(outcome.error?.kind).toBe("persistence");
		expect(outcome.narration).toBe("Couldn't load 'nosuchsave'.");
		expect(game.logged).toHaveLength(1);
		expect((game.logged[0].cause as Error).message).toContain("nosuchsave");
		// The game state is untouched and still usable.
		expect((await say("look around", "REST", { duration: 0 })).error).toBeUndefined();
	});

	it("reports an unexpected failure as internal, without leaking the message", async () => {
		const spy = jest.spyOn(game.turnResolver, "decide").mockImplementation(() => {
			throw new Error("secret stack detail");
		});
		try {
			const outcome = await say("look around", "REST", { duration: 0 });
			expect(outcome.error?.kind).toBe("internal");
			expect(outcome.narration).toBe("Something went wrong.");
			expect(outcome.narration).not.toContain("secret");
			expect(game.logged[0].cause).toEqual(new Error("secret stack detail"));
		} finally {
			spy.mockRestore();
		}
	});
});

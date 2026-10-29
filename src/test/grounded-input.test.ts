import {
	lastRendererPrompt,
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

/**
 * Free text reaches real ids through the whole chain: world view, resolver,
 * grounding, turn rules. Only the model is faked, and it answers the way a
 * real one does: with the words the player used.
 */
describe("free-text input is grounded in the world", () => {
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

	const say = (
		input: string,
		intent: string,
		args: Record<string, unknown>,
		pick?: string,
	) => {
		scriptPlayer(input, { intent, args, pick });
		return game.engine.handleCommand(input);
	};
	const here = () => game.engine.state.currentLocationId;

	it("walks to a place named inside a sentence", async () => {
		await say("the player heads out into the main corridor", "MOVE", {
			target: "main corridor",
		});
		expect(here()).toBe("hallway");

		const outcome = await say("Harry goes to the library in main building", "MOVE", {
			target: "library in main building",
		});
		expect(outcome.error).toBeUndefined();
		expect(here()).toBe("library");
	});

	it("lets the model choose when the words are only close", async () => {
		await say("go to the corridor", "MOVE", { target: "corridor" });
		await say("head to the libary", "MOVE", { target: "libary" }, "library");
		expect(here()).toBe("library");
	});

	it("tells the player where they can go when the place is unknown", async () => {
		await say("go to narnia", "MOVE", { target: "Narnia" });
		expect(here()).toBe("great_hall");
		expect(lastRendererPrompt()).toContain('You don\'t know of a place called "Narnia"');
		expect(lastRendererPrompt()).toContain("From Great Hall you can go to: Main Corridor.");
	});

	it("refuses a known place that is not reachable, with the right reason", async () => {
		await say("go to the library", "MOVE", { target: "library" });
		expect(here()).toBe("great_hall");
		expect(lastRendererPrompt()).toContain("You can't move to Library from Great Hall.");
	});
});

import {
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

describe("LOAD in the running engine", () => {
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

	it("continues on the loaded state, and the old one is left alone", async () => {
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await game.engine.handleCommand("save here");
		const saved = game.engine.state;

		await say("go to the grounds", "MOVE", { target: "grounds" });
		const beforeLoad = game.engine.state;
		expect(beforeLoad.currentLocationId).toBe("grounds");
		const snapshot = JSON.stringify(beforeLoad);

		const outcome = await game.engine.handleCommand("load here");

		expect(outcome.error).toBeUndefined();
		expect(game.engine.state).not.toBe(beforeLoad);
		expect(game.engine.state.currentLocationId).toBe("hallway");
		expect(outcome.state).toBe(game.engine.state);
		expect(saved).not.toBe(game.engine.state); // it came back from disk

		await say("go to the classroom", "MOVE", { target: "classroom" });
		expect(JSON.stringify(beforeLoad)).toBe(snapshot); // the old state is not touched any more
	});

	it("writes bus-driven quest flags into the loaded state, not the old one", async () => {
		await game.engine.handleCommand("save here");
		const beforeLoad = game.engine.state;
		await game.engine.handleCommand("load here");
		const loaded = game.engine.state;

		await say("go to the corridor", "MOVE", { target: "hallway" });
		await say("go to the library", "MOVE", { target: "library" });

		expect(loaded.questFlags.active).toContain("discovered:classroom");
		expect(beforeLoad.questFlags.active).not.toContain("discovered:classroom");
	});

	it("a refused load leaves the running game exactly as it was", async () => {
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await game.engine.handleCommand("save broken");
		const file = `${game.savesDir}/broken.json`;
		const fs = await import("fs/promises");
		const data = JSON.parse(await fs.readFile(file, "utf-8"));
		delete data.visitedLocationIds;
		await fs.writeFile(file, JSON.stringify(data), "utf-8");

		const live = game.engine.state;
		const snapshot = JSON.stringify(live);
		const outcome = await game.engine.handleCommand("load broken");

		expect(outcome.error?.kind).toBe("persistence");
		expect(outcome.narration).toContain("visitedLocationIds");
		expect(game.engine.state).toBe(live);
		expect(JSON.stringify(live)).toBe(snapshot.replace(/"output":"[^"]*"/, `"output":${JSON.stringify(outcome.narration)}`));
	});
});

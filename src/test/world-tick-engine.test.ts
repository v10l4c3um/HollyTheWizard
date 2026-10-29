import * as fs from "fs/promises";
import * as path from "path";
import {
	lastRendererPrompt,
	resetFakeOllama,
	scriptPlayer,
} from "./helpers/fakeOllama";
import { buildTestGame, TestGame } from "./helpers/buildTestGame";
import { WorldTick } from "../core/engine/WorldTick";

jest.mock("../ai/OllamaClient", () => {
	const actual = jest.requireActual("../ai/OllamaClient");
	const fake = require("./helpers/fakeOllama");
	return {
		...actual,
		generateWithOllama: fake.fakeGenerateWithOllama,
		probeOllamaConnection: jest.fn().mockResolvedValue(undefined),
	};
});

describe("the world tick in the turn pipeline", () => {
	let game: TestGame;
	const logSpies: jest.SpyInstance[] = [];

	// A fresh game per test: they all depend on the clock.
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
	const autosavePath = () => path.join(game.savesDir, "autosave.json");
	const exists = (file: string) =>
		fs.access(file).then(
			() => true,
			() => false,
		);

	it("tells the narrator about a class missed during a rest, and emits LessonSkipped", async () => {
		const skipped: string[] = [];
		game.bus.on("LessonSkipped", (e) => skipped.push(e.subjectId));

		// Monday 08:00 -> 13:00: the morning Charms class ends unattended.
		await say("sleep a while", "REST", { duration: 5 });

		expect(lastRendererPrompt()).toContain("You missed Charms class.");
		expect(skipped).toEqual(["charms"]);
	});

	it("does not mention a class that was attended", async () => {
		await say("go to the corridor", "MOVE", { target: "hallway" });
		await say("go to the classroom", "MOVE", { target: "classroom" });
		await say("attend charms", "ATTEND_CLASS", { target: "charms", duration: 1 });
		await say("wait", "REST", { duration: 4 });

		expect(lastRendererPrompt()).not.toContain("You missed");
	});

	it("autosaves once when a new day begins, and the autosave loads", async () => {
		await say("rest", "REST", { duration: 2 });
		expect(await exists(autosavePath())).toBe(false);

		// 10:00 -> 02:00 the next day crosses midnight.
		await say("rest all day", "REST", { duration: 16 });
		expect(await exists(autosavePath())).toBe(true);
		const firstWrite = (await fs.stat(autosavePath())).mtimeMs;

		await say("rest an hour", "REST", { duration: 1 });
		expect((await fs.stat(autosavePath())).mtimeMs).toBe(firstWrite);

		const outcome = await say("load autosave", "LOAD", { target: "autosave" });
		expect(outcome.error).toBeUndefined();
		expect(game.engine.state.worldClock.getDay()).toBe(2);
	});

	it("logs a failed autosave without telling the player", async () => {
		const failing = {
			save: async () => {
				throw new Error("disk full");
			},
			load: async () => {
				throw new Error("unused");
			},
			exists: async () => false,
		};
		(game.engine as any).autosave = new (
			await import("../core/engine/Autosave")
		).Autosave(failing, {
			debug: () => {},
			warn: () => {},
			error: (message: string, cause?: unknown) => {
				game.logged.push({ message, cause });
			},
		});

		const outcome = await say("rest all night", "REST", { duration: 18 });

		expect(outcome.error).toBeUndefined();
		expect(outcome.narration).not.toContain("disk full");
		expect(game.logged.some((e) => e.message === "autosave failed")).toBe(true);
	});

	it("runs no tick after a failed command or a LOAD", async () => {
		const run = jest.spyOn(WorldTick.prototype, "run");
		try {
			await game.engine.handleCommand("asdf qwer zxcv"); // unscripted
			expect(run).not.toHaveBeenCalled();

			await say("save here", "SAVE", { target: "here" });
			run.mockClear();
			await say("load here", "LOAD", { target: "here" });
			expect(run).not.toHaveBeenCalled();
		} finally {
			run.mockRestore();
		}
	});
});

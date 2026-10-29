import GameState from "../core/domain/world/GameState";
import { WorldTick } from "../core/engine/WorldTick";
import { createGameBus } from "../core/domain/events/GameEvents";
import { createStages, StageDeps } from "../core/engine/pipeline/stages";
import { flagSet } from "../core/domain/effects/GameEffects";
import { buildRegistry } from "../bootstrap/engineFactory";
import { resetFakeOllama, scriptPlayer } from "./helpers/fakeOllama";
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

describe("the stages of a turn", () => {
	it("are listed in one place, in order", () => {
		const stages = createStages({} as StageDeps);
		expect(stages.map((s) => s.name)).toEqual([
			"decide",
			"advance time",
			"announce",
			"world tick",
			"narrate",
			"post-checks",
		]);
	});
});

describe("world behaviour is a tick rule", () => {
	const H = 60;

	it("a rule handed to WorldTick runs at every boundary of a long span and acts through effects", () => {
		const seen: string[] = [];
		const tick = new WorldTick([
			({ boundary }) => {
				seen.push(boundary.kind);
				if (boundary.kind === "day") {
					return {
						effects: [flagSet(`curfew.${boundary.day}`, true, "curfew")],
						notices: ["The bell rings."],
					};
				}
			},
		]);
		const state = new GameState();

		const report = tick.run(state, buildRegistry(), createGameBus(), 8 * H, 1440 + 6 * H);

		expect(seen).toContain("day");
		expect(seen.length).toBeGreaterThan(1);
		expect(state.flags["curfew.2"]).toBe(true);
		expect(report.notices).toEqual(["The bell rings."]);
	});
});

describe("running a turn through the stages", () => {
	let game: TestGame;

	beforeEach(async () => {
		resetFakeOllama();
		game = await buildTestGame();
	});
	afterEach(() => game.dispose());

	const say = (input: string, intent: string, args: Record<string, unknown> = {}) => {
		scriptPlayer(input, { intent, args });
		return game.engine.handleCommand(input);
	};

	it("a stage that fails ends the turn: later stages never run", async () => {
		const before = game.engine.state;
		const outcome = await game.engine.handleCommand("zzz unscripted");

		expect(outcome.error?.kind).toBe("invalid-input");
		expect(game.engine.state).toBe(before);
		expect(before.recentTurns).toHaveLength(0);
	});

	it("an in-world turn leaves the clock moved, the world ticked and the turn remembered", async () => {
		const state = game.engine.state;
		const start = state.worldClock.getTotalMinutes();

		const outcome = await say("rest a little", "REST", { duration: 1 });

		expect(outcome.error).toBeUndefined();
		expect(outcome.state.worldClock.getTotalMinutes()).toBe(start + 60);
		expect(outcome.state.recentTurns).toHaveLength(1);
		expect(outcome.state.output).toBe(outcome.narration);
	});
});

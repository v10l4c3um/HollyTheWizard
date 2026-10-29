import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import { GameEngine } from "../core/engine/GameEngine";
import { Command } from "../core/engine/Command";
import { INTENT_TYPES } from "../core/engine/ResolverSchemas";
import { createCommandHandlers } from "../core/engine/handlers";
import { CommandHandlerMap } from "../core/engine/handlers/types";
import { GameSession } from "../core/engine/GameSession";
import { validState } from "./helpers/validState";
import { WorldTick } from "../core/engine/WorldTick";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { PersistenceRepository } from "../core/application/ports/PersistenceRepository";
import { buildRegistry } from "../bootstrap/engineFactory";

let registry: Registry;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

function fakeRepository(): PersistenceRepository & {
	saved: Record<string, GameState>;
} {
	const saved: Record<string, GameState> = {};
	return {
		saved,
		save: async (name, state) => {
			if (name === "broken") throw new Error("disk full");
			saved[name] = state;
		},
		load: async (name) => {
			if (!saved[name]) throw new Error(`no save ${name}`);
			return saved[name];
		},
		exists: async (name) => name in saved,
	};
}

function buildHandlers(repo = fakeRepository()) {
	const bus = createGameBus();
	const handlers = createCommandHandlers({
		registry,
		bus,
		turnResolver: new TurnResolver(bus),
		advanceYear: { execute: jest.fn() } as any,
		persistenceRepository: repo,
	});
	return { handlers, repo, bus };
}

describe("the command handler map", () => {
	it("has a handler for every command the resolver can produce", () => {
		const { handlers } = buildHandlers();
		const commandTypes = [...INTENT_TYPES, "UNKNOWN", "UNDO"] as Command["type"][];
		for (const type of commandTypes) {
			expect(typeof handlers[type]).toBe("function");
		}
	});
});

describe("meta handlers", () => {
	it("UNKNOWN fails as invalid-input and says what was not understood", async () => {
		const { handlers } = buildHandlers();
		const session = new GameSession(new GameState());
		const result = await handlers.UNKNOWN({ type: "UNKNOWN", input: "zzz" }, session);
		expect(result).toMatchObject({
			kind: "fail",
			error: { kind: "invalid-input" },
		});
		expect((result as any).error.message).toContain("zzz");
	});

	it("SAVE stores the state and says so", async () => {
		const { handlers, repo } = buildHandlers();
		const session = new GameSession(new GameState());
		const result = await handlers.SAVE({ type: "SAVE", filename: "a" }, session);
		expect(result).toEqual({ kind: "say", text: "Game saved as 'a'." });
		expect(repo.saved["a"]).toBe(session.state);
	});

	it("SAVE reports a persistence failure with its cause", async () => {
		const { handlers } = buildHandlers();
		const session = new GameSession(new GameState());
		const result = await handlers.SAVE({ type: "SAVE", filename: "broken" }, session);
		expect(result).toMatchObject({
			kind: "fail",
			error: { kind: "persistence", message: "Couldn't save 'broken'." },
		});
		expect(((result as any).error.cause as Error).message).toBe("disk full");
	});

	it("LOAD replaces the session's state and announces it", async () => {
		const { handlers, repo, bus } = buildHandlers();
		const stored = validState(registry);
		repo.saved["good"] = stored;
		const session = new GameSession(new GameState());
		const loaded: string[] = [];
		bus.on("GameLoaded", (e) => loaded.push(e.filename));

		const result = await handlers.LOAD({ type: "LOAD", filename: "good" }, session);

		expect(result).toEqual({ kind: "say", text: "Loaded game from 'good'." });
		expect(session.state).toBe(stored);
		expect(loaded).toEqual(["good"]);
	});

	describe("a save that does not fit the game is refused and changes nothing", () => {
		async function refused(damage: (s: GameState) => void) {
			const { handlers, repo, bus } = buildHandlers();
			const bad = validState(registry);
			damage(bad);
			repo.saved["bad"] = bad;
			const original = new GameState();
			const before = JSON.stringify(original);
			const session = new GameSession(original);
			const loaded = jest.fn();
			bus.on("GameLoaded", loaded);

			const result = await handlers.LOAD({ type: "LOAD", filename: "bad" }, session);

			expect(session.state).toBe(original);
			expect(JSON.stringify(original)).toBe(before);
			expect(loaded).not.toHaveBeenCalled();
			expect(result.kind).toBe("fail");
			return result as Extract<typeof result, { kind: "fail" }>;
		}

		it("when its place no longer exists", async () => {
			const result = await refused((s) => (s.currentLocationId = "nowhere"));
			expect(result.error.kind).toBe("persistence");
			expect(result.error.message).toContain("nowhere");
			expect(result.error.message).toContain("can't be used");
		});

		it("when a spell was added since", async () => {
			const result = await refused((s) => {
				const book = s.spellbook as any;
				book.spells.delete(registry.getAllSpellIds()[0]);
			});
			expect(result.error.message).toContain("added since");
		});

		it("when it has no story blueprint", async () => {
			const result = await refused((s) => (s.campaignBlueprint = undefined));
			expect(result.error.message).toContain("campaign story");
		});

		it("when it names a character that no longer exists", async () => {
			const result = await refused((s) => (s.knownNPCIds = ["ghost"]));
			expect(result.error.message).toContain("ghost");
		});
	});

	it("a bare load takes the quick save, else the autosave, else fails naming the quick save", async () => {
		const { handlers, repo } = buildHandlers();
		const bare = {
			type: "LOAD" as const,
			filename: "quicksave",
			fallbackFilename: "autosave",
		};
		const session = () => new GameSession(new GameState());

		const none = await handlers.LOAD(bare, session());
		expect(none).toMatchObject({
			kind: "fail",
			error: { message: "Couldn't load 'quicksave'." },
		});

		repo.saved["autosave"] = validState(registry);
		expect(await handlers.LOAD(bare, session())).toEqual({
			kind: "say",
			text: "Loaded game from 'autosave'.",
		});

		repo.saved["quicksave"] = validState(registry);
		expect(await handlers.LOAD(bare, session())).toEqual({
			kind: "say",
			text: "Loaded game from 'quicksave'.",
		});
	});

	it("LOAD of a missing save fails and leaves the session's state alone", async () => {
		const { handlers } = buildHandlers();
		const original = new GameState();
		const session = new GameSession(original);
		const result = await handlers.LOAD({ type: "LOAD", filename: "nope" }, session);
		expect(result).toMatchObject({ kind: "fail", error: { kind: "persistence" } });
		expect(session.state).toBe(original);
	});
});

describe("UNDO handler", () => {
	it("reports whether the session could go back", async () => {
		const { handlers } = buildHandlers();
		const session = new GameSession(new GameState());

		const nothing = await handlers.UNDO({ type: "UNDO" }, session);
		expect(nothing).toMatchObject({
			kind: "fail",
			error: { kind: "invalid-input", message: "There is nothing to undo." },
		});

		session.begin();
		session.state.currentLocationId = "hallway";
		session.commit();
		session.begin();
		expect(await handlers.UNDO({ type: "UNDO" }, session)).toEqual({
			kind: "say",
			text: "Undid your last action.",
		});
	});
});

describe("the engine's common pipeline", () => {
	function engineWith(overrides: Partial<CommandHandlerMap>, command: Command) {
		const render = jest.fn().mockResolvedValue("RENDERED");
		const checkMilestones = jest.fn();
		const { handlers } = buildHandlers();
		const engine = new GameEngine({
			registry,
			bus: createGameBus(),
			resolver: { resolve: async () => command } as any,
			renderer: { render } as any,
			handlers: { ...handlers, ...overrides },
			worldTick: new WorldTick(),
			autosave: { save: jest.fn() } as any,
			generateCampaignBlueprint: {} as any,
			generateYearBlueprint: {} as any,
			blueprintProgressService: { checkMilestones } as any,
			logger: { error: jest.fn() },
		});
		return { engine, render, checkMilestones };
	}

	it("renders what a handler narrates, then checks milestones", async () => {
		const { engine, render, checkMilestones } = engineWith(
			{ REST: async () => ({ kind: "narrate", briefOutput: "You rest." }) },
			{ type: "REST", duration: 1 },
		);
		const outcome = await engine.handleCommand("rest");
		expect(render).toHaveBeenCalledWith(
			expect.objectContaining({ briefOutput: "You rest." }),
		);
		expect(outcome).toMatchObject({ narration: "RENDERED" });
		expect(outcome.error).toBeUndefined();
		expect(checkMilestones).toHaveBeenCalledTimes(1);
	});

	it("shows what a handler says without narrating it", async () => {
		const { engine, render, checkMilestones } = engineWith(
			{ REST: async () => ({ kind: "say", text: "Exactly this." }) },
			{ type: "REST", duration: 1 },
		);
		const outcome = await engine.handleCommand("rest");
		expect(outcome.narration).toBe("Exactly this.");
		expect(render).not.toHaveBeenCalled();
		expect(checkMilestones).toHaveBeenCalledTimes(1);
	});

	it("turns a handler failure into a typed outcome without rendering or checking", async () => {
		const { engine, render, checkMilestones } = engineWith(
			{
				REST: async () => ({
					kind: "fail",
					error: { kind: "invalid-input", message: "Not now." },
				}),
			},
			{ type: "REST", duration: 1 },
		);
		const outcome = await engine.handleCommand("rest");
		expect(outcome.error?.kind).toBe("invalid-input");
		expect(outcome.narration).toBe("Not now.");
		expect(render).not.toHaveBeenCalled();
		expect(checkMilestones).not.toHaveBeenCalled();
	});

	it("exposes the state a LOAD handler swapped in", async () => {
		const replacement = new GameState();
		const { engine } = engineWith(
			{
				LOAD: async (_c, session) => {
					session.replace(replacement);
					return { kind: "say", text: "swapped" };
				},
			},
			{ type: "LOAD", filename: "x" },
		);
		const outcome = await engine.handleCommand("load x");
		expect(engine.state).toBe(replacement);
		expect(outcome.state).toBe(replacement);
	});
});

import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import Item from "../core/domain/world/Item";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { IN_WORLD_COMMAND_TYPES } from "../core/domain/commands/CommandDefinitions";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { CurriculumService } from "../core/domain/quest/CurriculumService";
import { SpellRevealService } from "../core/domain/magic/SpellRevealService";
import { Random, fixedRandom } from "../core/domain/random/Random";
import { createGameBus } from "../core/domain/events/GameEvents";
import { turnRules, TurnContext } from "../core/engine/rules";
import { buildRegistry } from "../bootstrap/engineFactory";
import { validState } from "./helpers/validState";

let registry: Registry;
let state: GameState;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = validState(registry);
	applyEffects(state, arrivalEffects(registry, state, state.currentLocationId), createGameBus());
});

/** A turn context with no bus and no resolver: a rule needs nothing else. */
const context = (random: Random = fixedRandom(0)): TurnContext => ({
	state,
	registry,
	random,
	curriculum: new CurriculumService(),
	spellReveal: new SpellRevealService(),
	apply: (effects) => applyEffects(state, effects),
});

describe("the rule registry", () => {
	it("has one rule for each in-world command and nothing else", () => {
		expect(Object.keys(turnRules).sort()).toEqual([...IN_WORLD_COMMAND_TYPES].sort());
	});
});

describe("each rule on its own", () => {
	it("rest passes the hours and announces nothing", () => {
		const result = turnRules.REST({ type: "REST", duration: 3 }, context());
		expect(result).toMatchObject({ outcome: "success", timeCost: { type: "minutes", amount: 180 } });
		expect(result.emits).toBeUndefined();
	});

	it("interact refuses an item you do not carry and uses one you do", () => {
		expect(
			turnRules.INTERACT({ type: "INTERACT", itemId: "wand", actionType: "wave" }, context()).outcome,
		).toBe("failure");
		state.inventory.items.push(new Item("wand", "Holly Wand"));
		const result = turnRules.INTERACT({ type: "INTERACT", itemId: "wand", actionType: "wave" }, context());
		expect(result.briefOutput).toContain("You wave Holly Wand");
		expect(result.outcome).toBe("success");
	});

	describe("move", () => {
		it("a place that is not connected is blocked, changes nothing and announces nothing", () => {
			const before = JSON.stringify(state);
			const result = turnRules.MOVE({ type: "MOVE", destinationId: "library" }, context());
			expect(result.outcome).toBe("blocked");
			expect(result.emits).toBeUndefined();
			expect(JSON.stringify(state)).toBe(before);
		});

		it("a connected place moves the player and asks for its events to be announced", () => {
			const result = turnRules.MOVE({ type: "MOVE", destinationId: "hallway" }, context());
			expect(state.currentLocationId).toBe("hallway");
			expect(result.effects?.map((e) => e.type)).toContain("LocationChanged");
			expect(result.emits?.map((e) => e.name)).toEqual([
				"LocationVisited",
				...Array(6).fill("LocationDiscovered"),
			]);
			expect(result.emits?.[0].payload).toEqual({ locationId: "hallway", isFirstVisit: true });
		});

		it("does not touch the clock: that is the pipeline's job", () => {
			const before = state.worldClock.getTotalMinutes();
			turnRules.MOVE({ type: "MOVE", destinationId: "hallway" }, context());
			expect(state.worldClock.getTotalMinutes()).toBe(before);
		});
	});

	describe("practice", () => {
		beforeEach(() => {
			state.spellbook.setSpellState("levitate", createLearnedSpellState("levitate", "test"));
		});

		it("rolls from the context's random source and reports what it did", () => {
			const lucky = turnRules.PRACTICE({ type: "PRACTICE", spellId: "levitate", duration: 1 }, context(fixedRandom(0)));
			expect(lucky.briefOutput).toContain("Success: 10/10");
			expect(lucky.emits?.[0]).toMatchObject({ name: "SpellPracticed", payload: { attempts: 10, successCount: 10 } });

			const unlucky = turnRules.PRACTICE({ type: "PRACTICE", spellId: "levitate", duration: 1 }, context(fixedRandom(0.999)));
			expect(unlucky.briefOutput).toContain("Success: 0/10");
		});

		it("refuses a spell that does not exist or is not learned", () => {
			expect(turnRules.PRACTICE({ type: "PRACTICE", spellId: "nope" }, context()).briefOutput).toContain("no spell");
			expect(turnRules.PRACTICE({ type: "PRACTICE", spellId: "fireball" }, context()).briefOutput).toContain("haven't learned");
		});

		it("announces mastery only on the turn it is reached", () => {
			const emitted = () =>
				turnRules.PRACTICE({ type: "PRACTICE", spellId: "levitate", duration: 10 }, context(fixedRandom(0))).emits!.map((e) => e.name);
			let mastered = false;
			for (let i = 0; i < 40 && !mastered; i++) mastered = emitted().includes("SpellMastered");
			expect(mastered).toBe(true);
			expect(emitted()).not.toContain("SpellMastered");
		});
	});

	it("study announces the delta, and any spell it revealed", () => {
		const result = turnRules.STUDY({ type: "STUDY", subjectId: "charms", duration: 2 }, context());
		expect(result.emits?.[0]).toEqual({
			name: "SubjectStudied",
			payload: { subjectId: "charms", knowledgeGain: 20 },
		});
		expect(result.timeCost).toEqual({ type: "minutes", amount: 120 });
	});

	it("talk to someone who is not here is refused without announcing anything", () => {
		const result = turnRules.TALK({ type: "TALK", npcId: "hagrid" }, context());
		expect(result.outcome).toBe("failure");
		expect(result.emits).toBeUndefined();
	});
});

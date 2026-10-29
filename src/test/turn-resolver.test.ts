import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { buildRegistry } from "../bootstrap/engineFactory";
import { moveToClass, moveToNpc } from "./helpers/placePlayer";
import { validState } from "./helpers/validState";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { fixedRandom } from "../core/domain/random/Random";
import { InWorldCommand } from "../core/domain/commands/CommandDefinitions";

let registry: Registry;
let state: GameState;
let bus: ReturnType<typeof createGameBus>;
let resolver: TurnResolver;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = validState(registry);
	bus = createGameBus();
	applyEffects(state, arrivalEffects(registry, state, state.currentLocationId), bus);
	resolver = new TurnResolver(bus);
});

const apply = (command: InWorldCommand) => resolver.apply(command, state, registry);

describe("every result states how the action turned out", () => {
	it("a move that works is a success and takes time", () => {
		const result = apply({ type: "MOVE", destinationId: "hallway" });
		expect(result.outcome).toBe("success");
		expect(result.timeCost).toEqual({ type: "minutes", amount: 5 });
	});

	it("a request that makes no sense is a failure and takes no time", () => {
		for (const command of [
			{ type: "MOVE", destinationId: "narnia" },
			{ type: "TALK", npcId: "gandalf" },
			{ type: "PRACTICE", spellId: "levitate", duration: 1 }, // not learned yet
			{ type: "INTERACT", itemId: "wand", actionType: "use" }, // not carried
		] as InWorldCommand[]) {
			const result = apply(command);
			expect(result.outcome).toBe("failure");
			expect(result.timeCost).toEqual({ type: "none" });
		}
	});

	it("a move to a place that is not connected is blocked: it was tried and cost time", () => {
		const result = apply({ type: "MOVE", destinationId: "library" });
		expect(result.outcome).toBe("blocked");
		expect(result.facts.map((f) => f.kind)).toEqual(["move-blocked"]);
		expect(result.timeCost).toEqual({ type: "minutes", amount: 2 });
	});

	it("a conversation that goes badly is still a success: it happened", () => {
		moveToNpc(state, registry, "hagrid");
		const result = apply({ type: "TALK", npcId: "hagrid", conversationTopic: "dark_arts" });
		expect(result.outcome).toBe("success");
	});

	it("attending a class out of turn is a failure; in turn it is a success", () => {
		expect(apply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 }).outcome).toBe("failure");
		moveToClass(state, registry, "charms");
		expect(apply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 }).outcome).toBe("success");
	});

	it("resting and studying are successes", () => {
		expect(apply({ type: "REST", duration: 1 }).outcome).toBe("success");
		expect(apply({ type: "STUDY", subjectId: "charms", duration: 1 }).outcome).toBe("success");
	});
});

describe("ActionResolved reports what the rule said", () => {
	const outcomes = () => {
		const seen: string[] = [];
		bus.on("ActionResolved", (e) => seen.push(`${e.actionType}:${e.outcome}`));
		return seen;
	};

	it("tells a blocked move apart from a success (it used to read as one)", () => {
		const seen = outcomes();
		apply({ type: "MOVE", destinationId: "library" });
		apply({ type: "MOVE", destinationId: "hallway" });
		apply({ type: "MOVE", destinationId: "narnia" });
		expect(seen).toEqual(["MOVE:blocked", "MOVE:success", "MOVE:failure"]);
	});
});


describe("whether a place is private is data on the place", () => {
	it("the shipped content marks the places where you can speak freely", () => {
		const isPrivate = (id: string) => registry.getLocation(id)?.isPrivate;
		expect(isPrivate("headmaster_office")).toBe(true);
		expect(isPrivate("hagrid_hut")).toBe(true);
		// These used to count as private because their ids contain "room".
		expect(isPrivate("classroom")).toBe(false);
		expect(isPrivate("common_room")).toBe(false);
		expect(isPrivate("grounds")).toBe(false);
	});

	it("a conversation is tagged as private exactly when its place is", () => {
		const tagsOfTalk = () => {
			moveToNpc(state, registry, "hagrid");
			let tags: string[] = [];
			bus.on("ConversationResolved", (e) => (tags = e.narrationTags));
			apply({ type: "TALK", npcId: "hagrid" });
			return tags;
		};
		expect(tagsOfTalk()).not.toContain("private-setting");

		// The registry is frozen, so look at the same world with one place private.
		const real = registry;
		const privatePlace = Object.create(real.getLocation("grounds")!, {
			isPrivate: { value: true },
		});
		registry = Object.create(real, {
			getLocation: {
				value: (id: string) => (id === "grounds" ? privatePlace : real.getLocation(id)),
			},
		});
		try {
			state = validState(registry);
			applyEffects(state, arrivalEffects(registry, state, "great_hall"), bus);
			expect(tagsOfTalk()).toContain("private-setting");
		} finally {
			registry = real;
		}
	});
});

describe("chance is seeded, resumable and injectable", () => {
	const learned = () => {
		state.spellbook.setSpellState("levitate", createLearnedSpellState("levitate", "test"));
	};
	const practiceTwice = (seed: number) => {
		state = validState(registry);
		learned();
		state.randomState = seed;
		const first = resolver.apply({ type: "PRACTICE", spellId: "levitate", duration: 3 }, state, registry);
		const second = resolver.apply({ type: "PRACTICE", spellId: "levitate", duration: 3 }, state, registry);
		return [first.briefOutput, second.briefOutput, state.randomState];
	};

	it("the same state gives the same practice results", () => {
		expect(practiceTwice(1234)).toEqual(practiceTwice(1234));
	});

	it("another seed gives other results", () => {
		expect(practiceTwice(1234)).not.toEqual(practiceTwice(98765));
	});

	it("every turn that rolled moves the random state on", () => {
		learned();
		state.randomState = 5;
		resolver.apply({ type: "PRACTICE", spellId: "levitate", duration: 1 }, state, registry);
		expect(state.randomState).not.toBe(5);
	});

	it("an injected source decides every roll and is not written to the state", () => {
		const fixed = new TurnResolver(bus, undefined, { random: () => fixedRandom(0.999) });
		learned();
		const before = state.randomState;
		const result = fixed.apply({ type: "PRACTICE", spellId: "levitate", duration: 1 }, state, registry);
		expect(result.briefOutput).toContain("Success: 0/10");
		expect(state.randomState).toBe(before);

		const lucky = new TurnResolver(bus, undefined, { random: () => fixedRandom(0) });
		expect(
			lucky.apply({ type: "PRACTICE", spellId: "levitate", duration: 1 }, state, registry).briefOutput,
		).toContain("Success: 10/10");
	});

	it("takes its services from the caller", () => {
		const attemptSpellReveal = jest.fn().mockReturnValue({ success: false });
		const fake = new TurnResolver(bus, undefined, {
			spellRevealService: { attemptSpellReveal, findRevealableSpells: () => [] } as never,
		});
		moveToClass(state, registry, "charms");
		fake.apply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 }, state, registry);
		expect(attemptSpellReveal).not.toHaveBeenCalled(); // lesson 1 has no reveal
		moveToClass(state, registry, "charms", { next: true });
		fake.apply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 }, state, registry);
		expect(attemptSpellReveal).toHaveBeenCalled();
	});
});

import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus, GameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { spellLearned } from "../core/domain/effects/GameEffects";
import {
	createHiddenSpellState,
	createLearnedSpellState,
} from "../core/domain/magic/SpellStateFactory";
import { SpellState } from "../core/domain/magic/Spell";
import { moveToClass } from "./helpers/placePlayer";

/**
 * Spells are taught by a source (class, item, trainer), never by a player
 * command. States: hidden -> available -> learned -> mastered.
 */

let registry: Registry;
let state: GameState;
let bus: GameBus;
let resolver: TurnResolver;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});

afterAll(() => {
	jest.restoreAllMocks();
});

beforeEach(() => {
	state = new GameState();
	bus = createGameBus();
	resolver = new TurnResolver(bus);
	for (const spellId of registry.getAllSpellIds()) {
		state.spellbook.setSpellState(spellId, createHiddenSpellState(spellId));
	}
});

const knowledgeOf = (spellId: string) =>
	state.spellbook.getSpellState(spellId)?.knowledgeState;

const setKnowledge = (
	spellId: string,
	knowledgeState: SpellState["knowledgeState"],
) => state.spellbook.updateSpellState(spellId, { knowledgeState });

/** Attends the next class of a subject (classes only run on their timetable). */
const attendClass = (subject: string) => {
	moveToClass(state, registry, subject, { next: true });
	return resolver.apply(
		{ type: "ATTEND_CLASS", subjectId: subject, duration: 1 },
		state,
		registry,
	);
};
const attendCharms = () => attendClass("charms");

describe("SpellLearned effect", () => {
	const learn = (spellId = "levitate") =>
		applyEffects(state, [spellLearned(spellId, "class", "test")]);

	it("turns an available spell into a learned one", () => {
		setKnowledge("levitate", "available");
		learn();
		const spell = state.spellbook.getSpellState("levitate")!;
		expect(spell.knowledgeState).toBe("learned");
		expect(spell.discoveredFrom).toBe("class");
		expect(spell.proficiency).toBe(0);
	});

	it("cannot skip a step: a hidden spell stays hidden", () => {
		learn();
		expect(knowledgeOf("levitate")).toBe("hidden");
	});

	it("never downgrades or resets a learned or mastered spell", () => {
		state.spellbook.setSpellState("levitate", {
			...createLearnedSpellState("levitate", "test"),
			proficiency: 40,
		});
		learn();
		expect(knowledgeOf("levitate")).toBe("learned");
		expect(state.spellbook.getSpellState("levitate")?.proficiency).toBe(40);

		setKnowledge("levitate", "mastered");
		learn();
		expect(knowledgeOf("levitate")).toBe("mastered");
	});

	it("ignores a spell that is not in the spellbook", () => {
		expect(() => learn("no_such_spell")).not.toThrow();
		expect(state.spellbook.getSpellState("no_such_spell")).toBeUndefined();
	});
});

describe("attending a class teaches its spell", () => {
	it("lesson 2 of Charms teaches levitate; lesson 1 does not", () => {
		attendCharms();
		expect(knowledgeOf("levitate")).toBe("hidden");

		const result = attendCharms();
		expect(knowledgeOf("levitate")).toBe("learned");
		expect(result.effects).toContainEqual(
			expect.objectContaining({ type: "SpellLearned", spellId: "levitate" }),
		);
		expect(result.briefOutput).toContain("Learned");
	});

	it("emits SpellRevealed once and SpellLearned from the class", () => {
		const revealed: unknown[] = [];
		const learned: unknown[] = [];
		bus.on("SpellRevealed", (e) => revealed.push(e));
		bus.on("SpellLearned", (e) => learned.push(e));

		attendCharms();
		attendCharms();

		expect(revealed).toEqual([{ spellId: "levitate", source: "class" }]);
		expect(learned).toEqual([{ spellId: "levitate", source: "class" }]);
	});

	it("still teaches a spell that was already available", () => {
		setKnowledge("levitate", "available");
		const revealed: unknown[] = [];
		bus.on("SpellRevealed", (e) => revealed.push(e));

		attendCharms();
		attendCharms();

		expect(knowledgeOf("levitate")).toBe("learned");
		expect(revealed).toHaveLength(0);
	});

	it("does not touch a spell the player has already mastered", () => {
		setKnowledge("levitate", "mastered");
		attendCharms();
		const result = attendCharms();
		expect(knowledgeOf("levitate")).toBe("mastered");
		expect(result.effects?.some((e) => e.type === "SpellLearned")).toBe(false);
	});

	describe("a lesson with a chance below 1 (potions: heal, 0.8)", () => {
		const attendPotions = () => attendClass("potions");

		afterEach(() => jest.restoreAllMocks());

		it("teaches when the roll succeeds", () => {
			jest.spyOn(console, "log").mockImplementation();
			jest.spyOn(Math, "random").mockReturnValue(0.1);
			attendPotions();
			attendPotions();
			expect(knowledgeOf("heal")).toBe("learned");
		});

		it("does not teach when the roll fails", () => {
			jest.spyOn(console, "log").mockImplementation();
			jest.spyOn(Math, "random").mockReturnValue(0.9);
			attendPotions();
			attendPotions();
			expect(knowledgeOf("heal")).toBe("hidden");
		});
	});
});

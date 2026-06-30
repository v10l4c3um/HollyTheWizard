import Registry from "../core/Registry";
import GameState from "../core/domain/world/GameState";
import TurnResolver from "../core/engine/TurnResolver";
import {
	createHiddenSpellState,
	createLearnedSpellState,
} from "../core/domain/magic/SpellStateFactory";
import { Spell } from "../core/domain/magic/Spell";
import { createGameBus } from "../core/domain/events/GameEvents";

describe("Spell Progression System", () => {
	let registry: Registry;
	let state: GameState;
	let resolver: TurnResolver;

	beforeEach(() => {
		registry = new Registry();
		state = new GameState();
		const bus = createGameBus();
		resolver = new TurnResolver(bus);

		// Register test spell
		const testSpell: Spell = {
			definition: {
				id: "test_spell",
				name: "Test Spell",
				description: "A test spell",
				level: "novice",
				usageType: "utility",
				range: "self",
				targetType: "self",
			},
			balance: {
				manaCost: 10,
				backfireRisk: "none",
				learningDifficulty: 0.3,
				practiceRequirement: 5,
				scaling: {},
			},
		};

		registry.registerSpell(testSpell);

		// Initialize spell in hidden state
		const spellState = createHiddenSpellState("test_spell");
		state.spellbook.setSpellState("test_spell", spellState);
	});

	test("spell starts in hidden state", () => {
		const spellState = state.spellbook.getSpellState("test_spell");
		expect(spellState).toBeDefined();
		expect(spellState?.knowledgeState).toBe("hidden");
		expect(spellState?.proficiency).toBe(0);
	});

	test("spell can transition to learned state", () => {
		const spellState = state.spellbook.getSpellState("test_spell");
		state.spellbook.updateSpellState("test_spell", {
			...spellState!,
			knowledgeState: "learned",
		});

		const updatedState = state.spellbook.getSpellState("test_spell");
		expect(updatedState?.knowledgeState).toBe("learned");
	});

	test("practice increases proficiency", () => {
		// Set spell to learned state using the factory function
		const learnedState = createLearnedSpellState("test_spell", "test");
		state.spellbook.setSpellState("test_spell", learnedState);

		// Practice for longer to ensure proficiency gain (10 hours of practice)
		const result = resolver.apply(
			{ type: "PRACTICE", spellId: "test_spell", duration: 10 },
			state,
			registry,
		);

		const updatedState = state.spellbook.getSpellState("test_spell");
		expect(updatedState?.proficiency).toBeGreaterThan(0);
		expect(result.briefOutput).toContain("Test Spell");
	});

	test("academic state is initialized correctly", () => {
		expect(state.academicState).toBeDefined();
		expect(state.academicState.subjects["charms"]).toBeDefined();
		expect(state.academicState.subjects["charms"].knowledge).toBe(0);
		expect(state.academicState.subjects["charms"].currentLessonOrder).toBe(
			1,
		);
		expect(state.academicState.attributes.INT).toBe(10);
	});

	test("spellbook methods work correctly", () => {
		const hiddenSpells =
			state.spellbook.getSpellsByKnowledgeState("hidden");
		expect(hiddenSpells.length).toBe(1);

		const learnedSpells =
			state.spellbook.getSpellsByKnowledgeState("learned");
		expect(learnedSpells.length).toBe(0);

		expect(state.spellbook.hasLearnedSpell("test_spell")).toBe(false);

		state.spellbook.updateSpellState("test_spell", {
			knowledgeState: "learned",
		});
		expect(state.spellbook.hasLearnedSpell("test_spell")).toBe(true);
	});
});

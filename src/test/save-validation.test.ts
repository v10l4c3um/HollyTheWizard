import Registry from "../core/Registry";
import { validateLoadedState } from "../core/domain/world/SaveValidation";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { RelationshipStats } from "../core/domain/npc/Relationship";
import { buildRegistry } from "../bootstrap/engineFactory";
import { validState } from "./helpers/validState";

let registry: Registry;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

describe("validateLoadedState", () => {
	it("accepts a started game", () => {
		expect(validateLoadedState(validState(registry), registry)).toEqual([]);
	});

	it("names a current place that no longer exists", () => {
		const state = validState(registry);
		state.currentLocationId = "atlantis";
		expect(validateLoadedState(state, registry)).toEqual([
			'the place "atlantis" no longer exists in the game',
		]);
	});

	it("names discovered and visited places that no longer exist", () => {
		const state = validState(registry);
		state.discoveredLocationIds = ["hallway", "oldwing"];
		state.visitedLocationIds = ["great_hall", "cellar"];
		const problems = validateLoadedState(state, registry).join("\n");
		expect(problems).toContain('discovered place "oldwing"');
		expect(problems).toContain('visited place "cellar"');
	});

	it("flags a spell the save lacks and one the game dropped", () => {
		const state = validState(registry);
		const [first] = registry.getAllSpellIds();
		(state.spellbook as any).spells.delete(first);
		state.spellbook.setSpellState(
			"retired_spell",
			createLearnedSpellState("retired_spell", "test"),
		);
		const problems = validateLoadedState(state, registry).join("\n");
		expect(problems).toContain(`"${first}" is not in the save`);
		expect(problems).toContain('"retired_spell" no longer exists');
	});

	it("flags characters that no longer exist, wherever they are referenced", () => {
		const state = validState(registry);
		state.relationships["ghost1"] = new RelationshipStats();
		state.conversationHistory["ghost2"] = [];
		state.knownNPCIds = ["ghost3"];
		const problems = validateLoadedState(state, registry).join("\n");
		for (const id of ["ghost1", "ghost2", "ghost3"]) {
			expect(problems).toContain(`"${id}"`);
		}
	});

	it("requires the campaign story and the story for the current year", () => {
		const noCampaign = validState(registry);
		noCampaign.campaignBlueprint = undefined;
		expect(validateLoadedState(noCampaign, registry).join()).toContain("campaign story");

		const noYear = validState(registry);
		delete noYear.yearBlueprints[1];
		expect(validateLoadedState(noYear, registry).join()).toContain("year 1");
	});
});

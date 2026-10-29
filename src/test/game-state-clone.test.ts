import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import { RelationshipStats } from "../core/domain/npc/Relationship";
import { buildRegistry } from "../bootstrap/engineFactory";
import { validState } from "./helpers/validState";

let registry: Registry;
beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

describe("GameState.clone", () => {
	it("is equal to the original but a different object", () => {
		const state = validState(registry);
		state.relationships["hagrid"] = new RelationshipStats();
		state.flags["a"] = true;
		const copy = state.clone();
		expect(copy).not.toBe(state);
		expect(JSON.stringify(copy)).toBe(JSON.stringify(state));
	});

	it("never shares anything mutable with the original", () => {
		const state = validState(registry);
		state.relationships["hagrid"] = new RelationshipStats();
		const before = JSON.stringify(state);
		const copy = state.clone();

		copy.worldClock.advanceTime(500);
		copy.currentLocationId = "forest";
		copy.flags["x"] = 1;
		copy.questFlags.active.push("q");
		copy.discoveredLocationIds.push("forest");
		copy.player.attributes.applyDelta({ INT: 5 });
		copy.player.resources.applyDelta({ energy: -50 });
		copy.relationships["hagrid"].applyDelta({ trust: 10 });
		copy.spellbook.updateSpellState(registry.getAllSpellIds()[0], {
			knowledgeState: "learned",
		});
		copy.academicState.subjects["charms"].knowledge += 9;
		copy.yearProgress.completedMilestoneIds.push("m");
		copy.campaignBlueprint!.runThemes.push("mystery");

		expect(JSON.stringify(state)).toBe(before);
	});

	it("keeps working methods on every class instance", () => {
		const copy = validState(registry).clone();
		copy.worldClock.advanceTime(60);
		expect(copy.worldClock.getTotalMinutes()).toBeGreaterThan(480);
		copy.player.attributes.applyDelta({ WIL: 2 });
		expect(copy.player.attributes.get("WIL")).toBe(2);
		expect(copy.spellbook.getSpellState(registry.getAllSpellIds()[0])).toBeDefined();
		copy.relationships["x"] = new RelationshipStats();
		expect(copy.clone().relationships["x"]).toBeInstanceOf(RelationshipStats);
	});
});

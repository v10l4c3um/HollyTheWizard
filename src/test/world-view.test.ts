import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import Item from "../core/domain/world/Item";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { createGameBus } from "../core/domain/events/GameEvents";
import { createLearnedSpellState } from "../core/domain/magic/SpellStateFactory";
import { buildRegistry } from "../bootstrap/engineFactory";
import { buildStaticWorldView, buildWorldView } from "../core/engine/WorldView";
import { moveToClass, moveToNpc } from "./helpers/placePlayer";
import { validState } from "./helpers/validState";

let registry: Registry;
const bus = createGameBus();

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

function stateAt(locationId: string): GameState {
	const state = validState(registry);
	applyEffects(state, arrivalEffects(registry, state, locationId), bus);
	return state;
}

describe("buildWorldView", () => {
	it("names the player and the place they are in", () => {
		const view = buildWorldView(registry, stateAt("great_hall"));
		expect(view.playerName).toBe("Player");
		expect(view.location).toEqual({ id: "great_hall", name: "Great Hall" });
	});

	it("lists as exits only connected places the player has discovered", () => {
		const state = stateAt("hallway");
		expect(buildWorldView(registry, state).exits.map((e) => e.id).sort()).toEqual(
			["classroom", "common_room", "dungeons", "great_hall", "grounds", "headmaster_office", "library"],
		);

		state.discoveredLocationIds = state.discoveredLocationIds.filter(
			(id) => id !== "library",
		);
		expect(buildWorldView(registry, state).exits.map((e) => e.id)).not.toContain("library");
	});

	it("still lists every place in the game, with display names", () => {
		const { places } = buildWorldView(registry, stateAt("great_hall"));
		expect(places.map((p) => p.id)).toEqual(
			expect.arrayContaining(["library", "forest", "startingVillage"]),
		);
		expect(places.find((p) => p.id === "hallway")?.name).toBe("Main Corridor");
	});

	it("carries place aliases, for exits and for every place", () => {
		const view = buildWorldView(registry, stateAt("grounds"));
		expect(view.places.find((p) => p.id === "hagrid_hut")?.aliases).toEqual(
			expect.arrayContaining(["Hagrid's hut", "the hut"]),
		);
		expect(view.exits.find((p) => p.id === "hagrid_hut")?.aliases).toContain("the hut");
	});

	it("lists the people who are here now, and everyone separately", () => {
		const state = stateAt("great_hall");
		moveToNpc(state, registry, "hagrid");
		const view = buildWorldView(registry, state);
		const hagrid = view.peopleHere.find((p) => p.id === "hagrid");
		expect(hagrid?.name).toBe("Rubeus Hagrid");
		expect(hagrid?.aliases?.length).toBeGreaterThan(0);
		expect(view.people.map((p) => p.id)).toEqual(
			expect.arrayContaining(["hagrid", "harry_potter", "professor_snape"]),
		);
	});

	it("knows which spells the player has learned", () => {
		const state = stateAt("great_hall");
		state.spellbook.setSpellState("levitate", createLearnedSpellState("levitate", "test"));
		const { spells } = buildWorldView(registry, state);
		expect(spells.find((s) => s.id === "levitate")).toMatchObject({
			name: "Wingardium Leviosa",
			learned: true,
		});
		expect(spells.find((s) => s.id === "fireball")?.learned).toBe(false);
	});

	it("reports the class being held right now", () => {
		const state = stateAt("great_hall");
		moveToClass(state, registry, "charms");
		expect(buildWorldView(registry, state).classNow).toMatchObject({
			id: "charms",
			name: "Charms",
		});

		const quiet = stateAt("great_hall");
		quiet.worldClock.advanceTime(14 * 60); // 22:00, night
		expect(buildWorldView(registry, quiet).classNow).toBeUndefined();
	});

	it("lists inventory items", () => {
		const state = stateAt("great_hall");
		state.inventory.items.push(new Item("wand", "Holly Wand"));
		expect(buildWorldView(registry, state).items).toEqual([
			{ id: "wand", name: "Holly Wand" },
		]);
	});

	it("has a content-only form for callers without a game", () => {
		const view = buildStaticWorldView(registry);
		expect(view.exits).toEqual([]);
		expect(view.peopleHere).toEqual([]);
		expect(view.subjects.map((s) => s.id)).toContain("charms");
		expect(view.places.length).toBeGreaterThan(10);
	});
});

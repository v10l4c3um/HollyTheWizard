import { buildRegistry } from "../bootstrap/engineFactory";
import GameState, { START_LOCATION_ID } from "../core/domain/world/GameState";

describe("the world comes from data", () => {
	const registry = buildRegistry();

	it("has the school wing and the country around it", () => {
		expect(registry.getAllLocationIds().sort()).toEqual([
			"classroom",
			"common_room",
			"dungeons",
			"forest",
			"great_hall",
			"greenhouse",
			"grounds",
			"hagrid_hut",
			"hallway",
			"headmaster_office",
			"library",
			"market",
			"startingVillage",
		]);
	});

	it("keeps the old places and connects them to the school grounds", () => {
		expect(registry.getLocation("startingVillage")?.connectedLocationsIds).toEqual([
			"forest",
			"market",
			"grounds",
		]);
		expect(registry.getLocation("forest")?.connectedLocationsIds).toEqual([
			"startingVillage",
			"grounds",
		]);
		expect(registry.getLocation("market")?.connectedLocationsIds).toEqual([
			"startingVillage",
		]);
		expect(registry.getLocation("market")?.displayName).toBe("Market Square");
	});

	it("is walkable from the great hall to the classroom in two moves", () => {
		expect(registry.getLocation("great_hall")?.connectedLocationsIds).toContain("hallway");
		expect(registry.getLocation("hallway")?.connectedLocationsIds).toContain("classroom");
	});

	it("holds each timetabled class in a room that exists", () => {
		const slots = registry.getTimetable(1)?.slots.filter((s) => s.type === "class") ?? [];
		expect(slots.length).toBeGreaterThan(0);
		for (const slot of slots) {
			expect(registry.getLocation(slot.location as string)).toBeDefined();
		}
	});

	it("a new game starts in a place that exists", () => {
		expect(new GameState().currentLocationId).toBe(START_LOCATION_ID);
		expect(registry.getLocation(START_LOCATION_ID)).toBeDefined();
	});

	it("keeps the villager, now defined in the NPC pack", () => {
		expect(registry.getNPC("villager")?.name).toBe("Villager");
	});
});

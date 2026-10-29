import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import { locationsDiscovered } from "../core/domain/effects/GameEffects";
import { arrivalEffects } from "../core/domain/world/Exploration";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";

let registry: Registry;
let state: GameState;
let resolver: TurnResolver;
const bus = createGameBus();

const move = (destinationId: string) =>
	resolver.apply({ type: "MOVE", destinationId }, state, registry);

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = new GameState();
	resolver = new TurnResolver(bus);
	applyEffects(state, arrivalEffects(registry, state, "great_hall"), bus);
});

describe("exploration", () => {
	it("starts having been to the start place and seeing its exits", () => {
		expect(state.visitedLocationIds).toEqual(["great_hall"]);
		expect(state.discoveredLocationIds).toEqual(["great_hall", "hallway"]);
	});

	it("cannot travel to a connected place that has not been discovered", () => {
		state.currentLocationId = "hallway";
		// Standing there shows the exits, so take one away to model a hidden place.
		state.discoveredLocationIds = state.discoveredLocationIds.filter(
			(id) => id !== "library",
		);
		const minutes = state.worldClock.getTotalMinutes();

		const result = move("library");

		expect(result.briefOutput).toContain("haven't found a way");
		expect(state.currentLocationId).toBe("hallway");
		expect(state.worldClock.getTotalMinutes()).toBe(minutes);
		expect(state.visitedLocationIds).not.toContain("library");
	});

	it("cannot travel to a place that is not connected", () => {
		expect(move("library").briefOutput).toContain("can't move");
		expect(state.currentLocationId).toBe("great_hall");
	});

	it("arriving marks the place visited and discovers its exits, not yet visited", () => {
		move("hallway");

		expect(state.visitedLocationIds).toContain("hallway");
		for (const exit of [
			"classroom",
			"dungeons",
			"library",
			"common_room",
			"headmaster_office",
			"grounds",
		]) {
			expect(state.discoveredLocationIds).toContain(exit);
			expect(state.visitedLocationIds).not.toContain(exit);
		}
		expect(state.discoveredLocationIds).not.toContain("forest");
	});

	it("announces the first visit once, and each newly seen place once", () => {
		const visits: boolean[] = [];
		const found: string[] = [];
		const local = createGameBus();
		local.on("LocationVisited", (e) => visits.push(e.isFirstVisit));
		local.on("LocationDiscovered", (e) => found.push(e.locationId));
		const r = new TurnResolver(local);

		r.apply({ type: "MOVE", destinationId: "hallway" }, state, registry);
		r.apply({ type: "MOVE", destinationId: "great_hall" }, state, registry);
		r.apply({ type: "MOVE", destinationId: "hallway" }, state, registry);

		expect(visits).toEqual([true, false, false]);
		expect(found.filter((id) => id === "classroom")).toHaveLength(1);
	});

	it("LocationsDiscovered adds places without visiting them", () => {
		applyEffects(state, [locationsDiscovered(["forest", "forest"])]);
		expect(state.discoveredLocationIds.filter((i) => i === "forest")).toHaveLength(1);
		expect(state.visitedLocationIds).not.toContain("forest");
	});
});

describe("refusals say where you can go", () => {
	it("an unknown place lists the discovered exits and costs nothing", () => {
		state.currentLocationId = "hallway";
		applyEffects(state, arrivalEffects(registry, state, "hallway"), bus);
		const minutes = state.worldClock.getTotalMinutes();

		const result = move("Narnia");

		expect(result.briefOutput).toContain('You don\'t know of a place called "Narnia"');
		expect(result.briefOutput).toContain("From Main Corridor you can go to:");
		expect(result.briefOutput).toContain("Library");
		expect(result.timeCost).toEqual({ type: "none" });
		expect(state.worldClock.getTotalMinutes()).toBe(minutes);
	});

	it("a place that is not connected says so and lists the way out", () => {
		const result = move("library");
		expect(result.briefOutput).toContain("You can't move to Library from Great Hall.");
		expect(result.briefOutput).toContain("From Great Hall you can go to: Main Corridor.");
	});

	it("does not name places you have not found", () => {
		state.currentLocationId = "hallway";
		state.discoveredLocationIds = ["hallway", "great_hall"];
		expect(move("Narnia").briefOutput).toContain("you can go to: Great Hall.");
	});
});

import GameState, { START_LOCATION_ID } from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { moveToNpc } from "./helpers/placePlayer";

/** You can only talk to someone who is where you are. */
describe("talking needs the NPC to be here", () => {
	let registry: Registry;
	let state: GameState;
	let resolver: TurnResolver;

	beforeAll(() => {
		registry = buildRegistry();
	});
	beforeEach(() => {
		state = new GameState();
		resolver = new TurnResolver(createGameBus());
	});

	const talk = (npcId: string) =>
		resolver.apply({ type: "TALK", npcId, conversationTopic: "daily_chat" }, state, registry);

	it("starts a new game in the great hall on Monday morning", () => {
		expect(START_LOCATION_ID).toBe("great_hall");
		expect(state.currentLocationId).toBe("great_hall");
		expect(state.worldClock.getWeekday()).toBe("monday");
	});

	it("refuses someone who is elsewhere, without time, events or a relationship", () => {
		// Hagrid spends the morning on the grounds.
		const result = talk("hagrid");

		expect(result.briefOutput).toContain("Rubeus Hagrid is not here right now");
		expect(result.timeCost).toEqual({ type: "none" });
		expect(result.events).toEqual([]);
		expect(state.relationships["hagrid"]).toBeUndefined();
		expect(state.conversationHistory["hagrid"]).toBeUndefined();
	});

	it("talks to the same person once the player has found them", () => {
		moveToNpc(state, registry, "hagrid");
		expect(state.currentLocationId).toBe("grounds");

		const result = talk("hagrid");

		expect(result.timeCost.type).toBe("minutes");
		expect(state.relationships["hagrid"]).toBeDefined();
	});

	it("finds the students in the classroom during the morning class", () => {
		expect(talk("harry_potter").timeCost.type).toBe("none");

		state.currentLocationId = "classroom";
		expect(talk("harry_potter").timeCost.type).toBe("minutes");
	});

	it("does not find the villager at school", () => {
		expect(talk("villager").timeCost.type).toBe("none");
		state.currentLocationId = "startingVillage";
		expect(talk("villager").timeCost.type).toBe("minutes");
	});

	it("people move on: Hagrid is not on the grounds at night", () => {
		state.currentLocationId = "grounds";
		state.worldClock.advanceTime(14 * 60); // 22:00
		expect(talk("hagrid").timeCost.type).toBe("none");

		state.currentLocationId = "hagrid_hut";
		expect(talk("hagrid").timeCost.type).toBe("minutes");
	});
});

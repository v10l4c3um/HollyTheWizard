import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { applyEffects } from "../core/domain/effects/EffectApplier";
import {
	eventsRecorded,
	lessonAdvanced,
	locationChanged,
	spellRevealed,
	spellStateUpdated,
	timeAdvanced,
} from "../core/domain/effects/GameEffects";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import {
	createHiddenSpellState,
	createLearnedSpellState,
} from "../core/domain/magic/SpellStateFactory";
import { moveToClass } from "./helpers/placePlayer";

let registry: Registry;
let state: GameState;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = new GameState();
	for (const spellId of registry.getAllSpellIds()) {
		state.spellbook.setSpellState(spellId, createHiddenSpellState(spellId));
	}
});

describe("world and turn effects", () => {
	it("LocationChanged moves the player and marks the place discovered, once", () => {
		applyEffects(state, [locationChanged("hallway"), locationChanged("hallway")]);
		expect(state.currentLocationId).toBe("hallway");
		expect(
			state.discoveredLocationIds.filter((id) => id === "hallway"),
		).toHaveLength(1);
	});

	it("TimeAdvanced moves the clock and announces it on the bus", () => {
		const bus = createGameBus();
		const seen: number[] = [];
		bus.on("TimeAdvanced", (e) => seen.push(e.minutesDelta));
		const before = state.worldClock.getTotalMinutes();

		applyEffects(state, [timeAdvanced(45)], bus);

		expect(state.worldClock.getTotalMinutes()).toBe(before + 45);
		expect(seen).toEqual([45]);
	});

	it("EventsRecorded appends to the recent events", () => {
		applyEffects(state, [eventsRecorded(["a", "b"])]);
		expect(state.recentEvents).toEqual(["a", "b"]);
	});

	it("SpellRevealed makes a hidden spell available and never downgrades", () => {
		applyEffects(state, [spellRevealed("levitate", 123)]);
		expect(state.spellbook.getSpellState("levitate")).toMatchObject({
			knowledgeState: "available",
			becameAvailableAt: 123,
		});

		state.spellbook.setSpellState(
			"levitate",
			createLearnedSpellState("levitate", "test"),
		);
		applyEffects(state, [spellRevealed("levitate")]);
		expect(state.spellbook.getSpellState("levitate")?.knowledgeState).toBe(
			"learned",
		);
	});

	it("SpellStateUpdated replaces the spell's state", () => {
		const next = {
			...createLearnedSpellState("levitate", "test"),
			proficiency: 42,
		};
		applyEffects(state, [spellStateUpdated("levitate", next)]);
		expect(state.spellbook.getSpellState("levitate")?.proficiency).toBe(42);
	});

	it("LessonAdvanced records the lesson and moves to the next", () => {
		const before = state.academicState.subjects["charms"].currentLessonOrder;
		applyEffects(state, [lessonAdvanced("charms", "charms-1-1", true)]);
		const charms = state.academicState.subjects["charms"];
		expect(charms.attendedLessons).toContain("charms-1-1");
		expect(charms.currentLessonOrder).toBe(before + 1);
	});
});

describe("TurnResolver.apply owns every state change of a turn", () => {
	it("a move changes location, discovery, clock and event log without the engine", () => {
		state.currentLocationId = "great_hall";
		const resolver = new TurnResolver(createGameBus());
		const before = state.worldClock.getTotalMinutes();

		const result = resolver.apply(
			{ type: "MOVE", destinationId: "hallway" },
			state,
			registry,
		);

		expect(state.currentLocationId).toBe("hallway");
		expect(state.discoveredLocationIds).toContain("hallway");
		expect(state.worldClock.getTotalMinutes()).toBe(before + 5);
		expect(state.recentEvents).toEqual(result.events);
		expect(result.timePassed).toMatchObject({ minutes: 5 });
		expect(result.effects?.map((e) => e.type)).toEqual(
			expect.arrayContaining(["LocationChanged", "TimeAdvanced", "EventsRecorded"]),
		);
	});

	it("attending a class advances the lesson through effects", () => {
		const resolver = new TurnResolver(createGameBus());
		moveToClass(state, registry, "charms");
		const order = state.academicState.subjects["charms"].currentLessonOrder;

		const result = resolver.apply(
			{ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 },
			state,
			registry,
		);

		expect(state.academicState.subjects["charms"].currentLessonOrder).toBe(
			order + 1,
		);
		expect(result.effects?.map((e) => e.type)).toContain("LessonAdvanced");
	});

	it("a refused action spends no time and records nothing", () => {
		const resolver = new TurnResolver(createGameBus());
		const before = state.worldClock.getTotalMinutes();

		const result = resolver.apply(
			{ type: "MOVE", destinationId: "nowhere" },
			state,
			registry,
		);

		expect(state.worldClock.getTotalMinutes()).toBe(before);
		expect(state.recentEvents).toEqual([]);
		expect(result.timePassed).toBeUndefined();
	});
});

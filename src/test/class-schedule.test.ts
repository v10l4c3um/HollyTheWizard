import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import TurnResolver from "../core/engine/TurnResolver";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";
import { moveToClass, waitUntil } from "./helpers/placePlayer";

/** A class only happens at its timetabled time and place, once per slot. */
describe("attending classes", () => {
	let registry: Registry;
	let state: GameState;
	let resolver: TurnResolver;

	beforeAll(() => {
		jest.spyOn(console, "log").mockImplementation();
		registry = buildRegistry();
	});
	afterAll(() => jest.restoreAllMocks());
	beforeEach(() => {
		state = new GameState();
		resolver = new TurnResolver(createGameBus());
	});

	const attend = (subject: string) =>
		resolver.apply({ type: "ATTEND_CLASS", subjectId: subject, duration: 1 }, state, registry);
	const nextLesson = (subject: string) =>
		state.academicState.subjects[subject as "charms"].currentLessonOrder;

	function expectRefused(result: ReturnType<typeof attend>, text: string, subject = "charms") {
		expect(result.briefOutput).toContain(text);
		expect(result.timeCost).toEqual({ type: "none" });
		expect(result.events).toEqual([]);
		expect(nextLesson(subject)).toBe(1);
		expect(state.flags).toEqual({});
	}

	it("is refused in the wrong place, and says where the class is", () => {
		// Monday morning is charms, in the classroom; the game starts in the great hall.
		const result = attend("charms");
		const room = registry.getLocation("classroom")?.displayName as string;

		expectRefused(result, `The Charms class is held in ${room}`);
	});

	it("is refused at the wrong time", () => {
		state.currentLocationId = "dungeons";
		expectRefused(attend("potions"), "There is no Potions class right now", "potions");
	});

	it("is refused at night", () => {
		state.currentLocationId = "classroom";
		state.worldClock.advanceTime(14 * 60); // 22:00
		expectRefused(attend("charms"), "There is no Charms class right now");
	});

	it("is refused when the year has no timetable", () => {
		state.currentLocationId = "classroom";
		state.currentYear = 2;
		expectRefused(attend("charms"), "There is no Charms class right now");
	});

	it("works at the right time and place", () => {
		state.currentLocationId = "classroom";

		const result = attend("charms");

		expect(result.timeCost).toEqual({ type: "minutes", amount: 60 });
		expect(result.briefOutput).toContain("Attended");
		expect(nextLesson("charms")).toBe(2);
		expect(state.flags["attended.charms.1.morning"]).toBe(true);
	});

	it("only counts once per slot, even if time is left in it", () => {
		state.currentLocationId = "classroom";
		attend("charms");

		const again = attend("charms");

		expect(again.briefOutput).toContain("already attended");
		expect(again.timeCost).toEqual({ type: "none" });
		expect(nextLesson("charms")).toBe(2);
	});

	it("counts again at the next class of the subject", () => {
		moveToClass(state, registry, "charms");
		attend("charms");

		moveToClass(state, registry, "charms", { next: true });
		const result = attend("charms");

		expect(state.worldClock.getWeekday()).toBe("thursday");
		expect(result.timeCost.type).toBe("minutes");
		expect(nextLesson("charms")).toBe(3);
	});

	it("remembers an attended class after a save and load", () => {
		state.currentLocationId = "classroom";
		attend("charms");
		const loaded = GameState.fromPlainObject(JSON.parse(JSON.stringify(state)));

		const result = resolver.apply(
			{ type: "ATTEND_CLASS", subjectId: "charms", duration: 1 },
			loaded,
			registry,
		);

		expect(result.briefOutput).toContain("already attended");
	});

	it("a missed class just waits for the next one", () => {
		waitUntil(state, "tuesday", "morning");
		state.currentLocationId = "classroom";
		expectRefused(attend("charms"), "There is no Charms class right now");
	});
});

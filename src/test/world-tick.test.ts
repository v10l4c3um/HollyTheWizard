import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import { WorldTick } from "../core/engine/WorldTick";
import { createGameBus } from "../core/domain/events/GameEvents";
import { buildRegistry } from "../bootstrap/engineFactory";

const H = 60;
const DAY = 1440;

let registry: Registry;
let state: GameState;
let tick: WorldTick;
let bus: ReturnType<typeof createGameBus>;

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation();
	registry = buildRegistry();
});
afterAll(() => jest.restoreAllMocks());

beforeEach(() => {
	state = new GameState();
	bus = createGameBus();
	tick = new WorldTick();
});

const run = (from: number, to: number) =>
	tick.run(state, registry, bus, from, to);

// Day 1 is Monday: Charms (classroom) in the morning, Potions in the afternoon,
// nothing in the evening.
describe("boundary events", () => {
	it("announces each part of the day and each new day, in order", () => {
		const seen: string[] = [];
		bus.on("PeriodChanged", (e) => seen.push(`period:${e.day}:${e.period}`));
		bus.on("DayStarted", (e) => seen.push(`day:${e.day}`));

		run(11 * H, DAY + 6 * H);

		expect(seen).toEqual([
			"period:1:afternoon",
			"period:1:evening",
			"period:1:night",
			"day:2",
			"period:2:morning",
		]);
	});

	it("reports whether a day started", () => {
		expect(run(8 * H, 13 * H).startedNewDay).toBe(false);
		expect(run(20 * H, DAY + H).startedNewDay).toBe(true);
	});
});

describe("missed classes", () => {
	it("flags and announces a class that ended unattended, once", () => {
		const skipped: string[] = [];
		bus.on("LessonSkipped", (e) => skipped.push(e.subjectId));

		const report = run(8 * H, 13 * H);

		expect(report.notices).toEqual(["You missed Charms class."]);
		expect(skipped).toEqual(["charms"]);
		expect(state.flags["missed.charms.1.morning"]).toBe(true);

		// The same span again (e.g. a replay) does not repeat it.
		expect(run(8 * H, 13 * H).notices).toEqual([]);
		expect(skipped).toHaveLength(1);
	});

	it("does not count a class that was attended", () => {
		state.flags["attended.charms.1.morning"] = true;
		expect(run(8 * H, 13 * H).notices).toEqual([]);
		expect(state.flags["missed.charms.1.morning"]).toBeUndefined();
	});

	it("changes no progress: the lesson is still the same one", () => {
		const before = state.academicState.subjects["charms"].currentLessonOrder;
		run(8 * H, 13 * H);
		expect(state.academicState.subjects["charms"].currentLessonOrder).toBe(
			before,
		);
	});

	it("holds no class in the evening or at night", () => {
		expect(run(17 * H, 21 * H).notices).toEqual([]);
		expect(run(21 * H, DAY + 4 * H).notices).toEqual([]);
	});

	it("reports each missed class of a long rest, in order", () => {
		const report = run(8 * H, DAY + 8 * H);
		expect(report.notices).toEqual([
			"You missed Charms class.",
			"You missed Potions class.",
		]);
	});
});

describe("scene invitation expiry", () => {
	it("drops only invitations whose time has passed", () => {
		state.sceneInvitations.push(
			{ invitationId: "old", npcId: "hagrid", sceneType: "walk", validUntilMinutes: 10 * H },
			{ invitationId: "later", npcId: "hagrid", sceneType: "walk", validUntilMinutes: 40 * H },
			{ invitationId: "open", npcId: "hagrid", sceneType: "walk" },
		);

		run(8 * H, 13 * H);

		expect(state.sceneInvitations.map((i) => i.invitationId)).toEqual([
			"later",
			"open",
		]);
	});
});

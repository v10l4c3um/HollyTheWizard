import GameState from "../core/domain/world/GameState";
import Registry from "../core/Registry";
import NPC from "../core/domain/npc/Npc";
import { NpcSchedule } from "../core/domain/npc/Npc";
import { momentOf, npcLocation, npcsAt } from "../core/domain/npc/Presence";
import { WeeklyTimetable } from "../core/domain/quest/Curriculum";
import { activeClass } from "../core/domain/quest/Timetable";

const TIMETABLE: WeeklyTimetable = {
	year: 1,
	slots: [
		{ day: "monday", period: "morning", type: "class", subject: "charms", location: "classroom" },
		{ day: "monday", period: "afternoon", type: "class", subject: "potions", location: "dungeons" },
		{ day: "monday", period: "evening", type: "free" },
	],
};

const npcWith = (schedule?: NpcSchedule) => {
	const npc = new NPC("test");
	npc.schedule = schedule;
	return npc;
};

const at = (
	npc: NPC,
	weekday: "monday" | "tuesday" | "saturday",
	timeOfDay: "morning" | "afternoon" | "evening" | "night",
	timetable: WeeklyTimetable | null = TIMETABLE,
) => npcLocation(npc, { weekday, timeOfDay, timetable: timetable ?? undefined });

describe("activeClass", () => {
	it("finds the class running now", () => {
		expect(activeClass(TIMETABLE, "monday", "morning")?.subject).toBe("charms");
		expect(activeClass(TIMETABLE, "monday", "afternoon")?.location).toBe("dungeons");
	});

	it("finds nothing in a free period, at night, on another day, or without a timetable", () => {
		expect(activeClass(TIMETABLE, "monday", "evening")).toBeUndefined();
		expect(activeClass(TIMETABLE, "monday", "night")).toBeUndefined();
		expect(activeClass(TIMETABLE, "tuesday", "morning")).toBeUndefined();
		expect(activeClass(undefined, "monday", "morning")).toBeUndefined();
	});
});

describe("npcLocation", () => {
	it("puts an NPC without a schedule nowhere", () => {
		expect(at(npcWith(undefined), "monday", "morning")).toBeUndefined();
	});

	it("puts an NPC at home when no slot applies", () => {
		const npc = npcWith({ home: "hut" });
		expect(at(npc, "monday", "morning")).toBe("hut");
		expect(at(npc, "monday", "night")).toBe("hut");
	});

	it("follows a slot by period", () => {
		const npc = npcWith({ home: "hut", slots: [{ periods: ["afternoon"], location: "yard" }] });
		expect(at(npc, "monday", "afternoon")).toBe("yard");
		expect(at(npc, "saturday", "afternoon")).toBe("yard");
		expect(at(npc, "monday", "morning")).toBe("hut");
	});

	it("follows a slot by day and period together", () => {
		const npc = npcWith({
			home: "hut",
			slots: [{ days: ["saturday"], periods: ["morning"], location: "yard" }],
		});
		expect(at(npc, "saturday", "morning")).toBe("yard");
		expect(at(npc, "monday", "morning")).toBe("hut");
		expect(at(npc, "saturday", "evening")).toBe("hut");
	});

	it("treats a missing day or period as any", () => {
		const byDay = npcWith({ home: "hut", slots: [{ days: ["tuesday"], location: "yard" }] });
		expect(at(byDay, "tuesday", "night")).toBe("yard");
		expect(at(byDay, "monday", "night")).toBe("hut");

		const always = npcWith({ home: "hut", slots: [{ location: "yard" }] });
		expect(at(always, "monday", "morning")).toBe("yard");
	});

	it("uses the first matching slot", () => {
		const npc = npcWith({
			home: "hut",
			slots: [
				{ periods: ["evening"], location: "first" },
				{ periods: ["evening"], location: "second" },
			],
		});
		expect(at(npc, "monday", "evening")).toBe("first");
	});

	it("can be told where to be at night", () => {
		const npc = npcWith({ home: "hut", slots: [{ periods: ["night"], location: "tower" }] });
		expect(at(npc, "monday", "night")).toBe("tower");
	});

	describe("classes", () => {
		it("a student who attends classes is where the class is", () => {
			const student = npcWith({ home: "dorm", attendsClasses: true });
			expect(at(student, "monday", "morning")).toBe("classroom");
			expect(at(student, "monday", "afternoon")).toBe("dungeons");
			expect(at(student, "monday", "evening")).toBe("dorm");
		});

		it("someone who does not attend classes ignores them", () => {
			const other = npcWith({ home: "hut" });
			expect(at(other, "monday", "morning")).toBe("hut");
		});

		it("a teacher is only at the classes of their own subjects", () => {
			const teacher = npcWith({ home: "office", teaches: ["potions"] });
			expect(at(teacher, "monday", "afternoon")).toBe("dungeons");
			expect(at(teacher, "monday", "morning")).toBe("office");
		});

		it("a class outranks a slot of the same time", () => {
			const student = npcWith({
				home: "dorm",
				attendsClasses: true,
				slots: [{ periods: ["morning"], location: "library" }],
			});
			expect(at(student, "monday", "morning")).toBe("classroom");
			expect(at(student, "tuesday", "morning")).toBe("library");
		});

		it("without a timetable there are no classes to follow", () => {
			const student = npcWith({ home: "dorm", attendsClasses: true });
			expect(at(student, "monday", "morning", null)).toBe("dorm");
		});
	});
});

describe("npcsAt", () => {
	const registry = new Registry();
	const student = new NPC("student", "Student");
	student.schedule = { home: "dorm", attendsClasses: true };
	const keeper = new NPC("keeper", "Keeper");
	keeper.schedule = { home: "hut" };
	const ghost = new NPC("ghost", "Ghost");

	beforeAll(() => {
		[student, keeper, ghost].forEach((npc) => registry.registerNPC(npc));
		registry.registerSchoolData({ subjects: {} as never, curriculums: [], timetables: [TIMETABLE] });
	});

	it("lists who is in a place right now (a new game is Monday morning)", () => {
		const state = new GameState();
		expect(npcsAt(registry, state, "classroom").map((npc) => npc.id)).toEqual(["student"]);
		expect(npcsAt(registry, state, "hut").map((npc) => npc.id)).toEqual(["keeper"]);
		expect(npcsAt(registry, state, "dorm")).toEqual([]);
	});

	it("defaults to the player's own location", () => {
		const state = new GameState();
		state.currentLocationId = "hut";
		expect(npcsAt(registry, state).map((npc) => npc.id)).toEqual(["keeper"]);
	});

	it("moves with the clock", () => {
		const state = new GameState();
		state.worldClock.advanceTime(5 * 60); // 13:00, afternoon
		expect(npcsAt(registry, state, "dungeons").map((npc) => npc.id)).toEqual(["student"]);
		expect(momentOf(state, registry).timeOfDay).toBe("afternoon");
	});
});

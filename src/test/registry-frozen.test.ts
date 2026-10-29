import Registry from "../core/Registry";
import NPC from "../core/domain/npc/Npc";
import Location from "../core/domain/world/Location";
import Item from "../core/domain/world/Item";
import { deepFreeze } from "../core/content/deepFreeze";
import { buildRegistry } from "../bootstrap/engineFactory";

describe("the registry is immutable once loading is over", () => {
	const shipped = buildRegistry();

	it("is frozen by buildRegistry, and refuses every kind of registration", () => {
		expect(shipped.isFrozen).toBe(true);
		expect(() => shipped.registerNPC(new NPC("late", "Late", []))).toThrow(/frozen/);
		expect(() => shipped.registerLocation(new Location("late", "Late", "d", []))).toThrow(/frozen/);
		expect(() => shipped.registerItem(new Item("late"))).toThrow(/frozen/);
		expect(() => shipped.registerSchoolData(shipped.getSchoolData()!)).toThrow(/frozen/);
	});

	it("hands out content that cannot be changed", () => {
		const place = shipped.getLocation("great_hall")!;
		const name = place.displayName;
		expect(() => {
			place.displayName = "Somewhere else";
		}).toThrow(TypeError);
		expect(() => place.connectedLocationsIds.push("x")).toThrow(TypeError);
		expect(place.displayName).toBe(name);

		const npc = shipped.getNPC(shipped.getAllNpcIds()[0])!;
		expect(() => {
			npc.name = "Changed";
		}).toThrow(TypeError);

		const school = shipped.getSchoolData()!;
		expect(() => school.curriculums.push(school.curriculums[0])).toThrow(TypeError);
	});
});

describe("before loading is over", () => {
	it("refuses a duplicate id for every kind", () => {
		const registry = new Registry();
		registry.registerNPC(new NPC("a", "A", []));
		registry.registerLocation(new Location("l", "L", "d", []));
		expect(() => registry.registerNPC(new NPC("a", "Other A", []))).toThrow(/Duplicate NPC id "a"/);
		expect(() => registry.registerLocation(new Location("l", "L2", "d", []))).toThrow(/Duplicate location/);
		registry.registerNPC(new NPC("b", "B", []));
		expect(registry.getAllNpcIds()).toEqual(["a", "b"]);
	});

	it("refuses school data twice", () => {
		const registry = new Registry();
		const data = { subjects: {} as never, curriculums: [], timetables: [] };
		registry.registerSchoolData(data);
		expect(() => registry.registerSchoolData(data)).toThrow(/Duplicate/);
	});
});

describe("deepFreeze", () => {
	it("freezes nested objects and arrays, and tolerates frozen and primitive values", () => {
		const value = deepFreeze({ a: { b: [1, { c: 2 }] }, d: Object.freeze({ e: 1 }) });
		expect(Object.isFrozen(value.a.b[1])).toBe(true);
		expect(() => (value.a.b as number[]).push(3)).toThrow(TypeError);
		expect(deepFreeze(5)).toBe(5);
		expect(deepFreeze(null)).toBeNull();
	});
});

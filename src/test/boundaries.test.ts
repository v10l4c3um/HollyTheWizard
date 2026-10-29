import { boundariesBetween } from "../core/domain/world/Boundaries";

const H = 60;
const DAY = 1440;

const summary = (from: number, to: number) =>
	boundariesBetween(from, to).map((b) => `${b.kind}:${b.day}:${b.period}`);

describe("boundariesBetween", () => {
	it("is empty inside a part of the day", () => {
		expect(summary(8 * H, 11 * H)).toEqual([]);
	});

	it("is empty when no time passed or the span runs backwards", () => {
		expect(summary(8 * H, 8 * H)).toEqual([]);
		expect(summary(9 * H, 8 * H)).toEqual([]);
	});

	it("counts a boundary the clock lands exactly on, but not one it starts on", () => {
		expect(summary(11 * H, 12 * H)).toEqual(["period:1:afternoon"]);
		expect(summary(12 * H, 13 * H)).toEqual([]);
	});

	it("reports which part of the day ended", () => {
		const [boundary] = boundariesBetween(11 * H, 13 * H);
		expect(boundary.endedPeriod).toBe("morning");
		expect(boundary.weekday).toBe("monday");
	});

	it("crosses midnight as a day boundary while night goes on", () => {
		expect(summary(23 * H, DAY + 1 * H)).toEqual(["day:2:night"]);
		const [boundary] = boundariesBetween(23 * H, DAY + H);
		expect(boundary.weekday).toBe("tuesday");
		expect(boundary.endedPeriod).toBeUndefined();
	});

	it("lists every boundary of a long rest in order", () => {
		expect(summary(8 * H, 8 * H + 24 * H)).toEqual([
			"period:1:afternoon",
			"period:1:evening",
			"period:1:night",
			"day:2:night",
			"period:2:morning",
		]);
	});

	it("covers several days and runs on the week's cycle", () => {
		const boundaries = boundariesBetween(0, 7 * DAY + 1);
		expect(boundaries.filter((b) => b.kind === "day")).toHaveLength(7);
		expect(boundaries[boundaries.length - 1].weekday).toBe("monday");
	});
});

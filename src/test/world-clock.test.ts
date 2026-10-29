import WorldClock from "../core/domain/world/WorldClock";

const MINUTES_PER_DAY = 1440;

describe("WorldClock calendar", () => {
	let clock: WorldClock;

	beforeEach(() => {
		clock = new WorldClock();
	});

	it("starts on day 1, a Monday morning at 8:00", () => {
		expect(clock.getDay()).toBe(1);
		expect(clock.getWeekday()).toBe("monday");
		expect(clock.getMinutesOfDay()).toBe(480);
		expect(clock.getTotalMinutes()).toBe(480);
		expect(clock.timeOfDay).toBe("morning");
		expect(clock.getCurrentTime()).toBe("8:00 AM");
	});

	it("moves to the next day and weekday after midnight", () => {
		clock.advanceTime(MINUTES_PER_DAY - 480 + 30); // to 00:30 the next day

		expect(clock.getDay()).toBe(2);
		expect(clock.getWeekday()).toBe("tuesday");
		expect(clock.getMinutesOfDay()).toBe(30);
		expect(clock.timeOfDay).toBe("night");
		expect(clock.getTotalMinutes()).toBe(MINUTES_PER_DAY + 30);
	});

	it("cycles the weekdays every seven days", () => {
		const seen: string[] = [];
		for (let day = 1; day <= 8; day++) {
			seen.push(clock.getWeekday());
			clock.advanceTime(MINUTES_PER_DAY);
		}
		expect(seen).toEqual([
			"monday",
			"tuesday",
			"wednesday",
			"thursday",
			"friday",
			"saturday",
			"sunday",
			"monday",
		]);
		expect(clock.getDay()).toBe(9);
	});

	it("never goes back: the total only grows", () => {
		let previous = clock.getTotalMinutes();
		for (let i = 0; i < 40; i++) {
			clock.advanceTime(400);
			expect(clock.getTotalMinutes()).toBeGreaterThan(previous);
			previous = clock.getTotalMinutes();
		}
	});

	describe("time of day", () => {
		const at = (minutes: number) => {
			clock.setMinutesOfDay(minutes);
			return clock.timeOfDay;
		};

		it("changes at 5:00, 12:00, 17:00 and 21:00", () => {
			expect(at(4 * 60 + 59)).toBe("night");
			expect(at(5 * 60)).toBe("morning");
			expect(at(11 * 60 + 59)).toBe("morning");
			expect(at(12 * 60)).toBe("afternoon");
			expect(at(16 * 60 + 59)).toBe("afternoon");
			expect(at(17 * 60)).toBe("evening");
			expect(at(20 * 60 + 59)).toBe("evening");
			expect(at(21 * 60)).toBe("night");
			expect(at(0)).toBe("night");
		});
	});

	describe("setMinutesOfDay", () => {
		it("sets the time but keeps the day", () => {
			clock.advanceTime(2 * MINUTES_PER_DAY); // day 3
			clock.setMinutesOfDay(13 * 60 + 5);

			expect(clock.getDay()).toBe(3);
			expect(clock.getMinutesOfDay()).toBe(13 * 60 + 5);
			expect(clock.getCurrentTime()).toBe("1:05 PM");
		});

		it("wraps an out-of-range value into the same day", () => {
			clock.setMinutesOfDay(-60);
			expect(clock.getMinutesOfDay()).toBe(MINUTES_PER_DAY - 60);
			expect(clock.getDay()).toBe(1);
		});
	});

	describe("display", () => {
		it("formats midnight and noon", () => {
			clock.setMinutesOfDay(0);
			expect(clock.getCurrentTime()).toBe("12:00 AM");
			clock.setMinutesOfDay(12 * 60);
			expect(clock.getCurrentTime()).toBe("12:00 PM");
		});
	});

	describe("saving", () => {
		it("saves just the total", () => {
			expect(JSON.parse(JSON.stringify(clock))).toEqual({
				totalMinutes: 480,
			});
		});

		it("round-trips through JSON", () => {
			clock.advanceTime(3 * MINUTES_PER_DAY + 95);
			const restored = WorldClock.fromJSON(
				JSON.parse(JSON.stringify(clock)),
			);

			expect(restored.getTotalMinutes()).toBe(clock.getTotalMinutes());
			expect(restored.getDay()).toBe(4);
			expect(restored.getWeekday()).toBe("thursday");
			expect(restored.getCurrentTime()).toBe(clock.getCurrentTime());
		});

		it("loads an older save that only stored the minute of the day", () => {
			const restored = WorldClock.fromJSON({ minutesOfDay: 600 });

			expect(restored.getDay()).toBe(1);
			expect(restored.getWeekday()).toBe("monday");
			expect(restored.getMinutesOfDay()).toBe(600);
			expect(restored.getCurrentTime()).toBe("10:00 AM");
		});
	});
});

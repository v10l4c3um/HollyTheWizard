import { parseFollowUp } from "../core/engine/FollowUp";
import { Command } from "../core/engine/Command";
import { RecentTurnView } from "../core/engine/WorldView";

const turn = (command: Command, fromLocationId = "great_hall"): RecentTurnView => ({
	input: "x",
	summary: "did something",
	command,
	fromLocationId,
});
const none = { recent: [] as RecentTurnView[] };

describe("repeat", () => {
	const view = {
		recent: [
			turn({ type: "MOVE", destinationId: "hallway" }),
			turn({ type: "REST", duration: 2 }),
		],
	};

	it.each([
		"again",
		"Again!",
		"repeat",
		"repeat that",
		"repeat it",
		"do that again",
		"do it again",
		"do the same",
		"do the same thing again",
		"the same",
		"same again",
		"once more",
		"one more time",
		"  Do  that   again. ",
	])("repeats the last command for %p", (input) => {
		expect(parseFollowUp(input, view)).toEqual({ type: "REST", duration: 2 });
	});

	it("returns a copy, not the remembered object", () => {
		const copy = parseFollowUp("again", view) as { duration: number };
		copy.duration = 99;
		expect((view.recent[1].command as { duration: number }).duration).toBe(2);
	});

	it("asks for something to repeat when nothing has happened yet", () => {
		expect(parseFollowUp("again", none)).toEqual({
			type: "UNKNOWN",
			input: "again",
			hint: "There is nothing to repeat yet.",
		});
	});

	it.each(["again and again", "do that again tomorrow", "study again", "repeat after me"])(
		"leaves %p to the model",
		(input) => {
			expect(parseFollowUp(input, view)).toBeNull();
		},
	);
});

describe("go back", () => {
	it.each(["back", "go back", "Go back!", "go back there", "head back", "walk back", "return"])(
		"returns to where the last move started, for %p",
		(input) => {
			const view = {
				recent: [
					turn({ type: "MOVE", destinationId: "library" }, "hallway"),
					turn({ type: "REST", duration: 1 }, "library"),
				],
			};
			expect(parseFollowUp(input, view)).toEqual({
				type: "MOVE",
				destinationId: "hallway",
			});
		},
	);

	it("uses the most recent move", () => {
		const view = {
			recent: [
				turn({ type: "MOVE", destinationId: "hallway" }, "great_hall"),
				turn({ type: "MOVE", destinationId: "grounds" }, "hallway"),
			],
		};
		expect(parseFollowUp("go back", view)).toEqual({ type: "MOVE", destinationId: "hallway" });
	});

	it("says so when there has been no move", () => {
		expect(parseFollowUp("go back", { recent: [turn({ type: "REST", duration: 1 })] })).toEqual({
			type: "UNKNOWN",
			input: "go back",
			hint: "You haven't gone anywhere yet.",
		});
	});

	it.each(["go back to the library", "back off", "come back later", "go back inside"])(
		"leaves %p to the model",
		(input) => {
			expect(parseFollowUp(input, none)).toBeNull();
		},
	);
});

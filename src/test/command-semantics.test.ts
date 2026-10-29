import {
	buildCommand,
	cleanReply,
	givenTarget,
	isEcho,
	mentionsAnything,
	sanitiseDuration,
} from "../core/engine/CommandSemantics";
import { CommandReply } from "../core/domain/commands/CommandDefinitions";
import { WorldView } from "../core/engine/WorldView";

const person = { id: "hermione_granger", name: "Hermione Granger" };
const view = (extra: Partial<WorldView> = {}) => ({ lastPerson: person, ...extra }) as WorldView;

describe("sanitiseDuration", () => {
	it.each([
		[1, 1],
		[3, 3],
		[24, 24],
		["2", 2],
		[2.4, 2],
		[2.6, 3],
		[0, undefined],
		[-3, undefined],
		[25, undefined],
		[99, undefined],
		[1e15, undefined],
		[NaN, undefined],
		[Infinity, undefined],
		["soon", undefined],
		[null, undefined],
		[undefined, undefined],
	])("%p -> %p", (input, expected) => {
		expect(sanitiseDuration(input)).toBe(expected);
	});
});

describe("givenTarget", () => {
	it.each(["", "  ", "none", "None", "UNKNOWN", "n/a", "null", "nothing", "-"])(
		"treats %p as no target",
		(value) => expect(givenTarget(value)).toBeUndefined(),
	);
	it("keeps a real one, trimmed", () => expect(givenTarget("  library ")).toBe("library"));
	it.each([undefined, null, 42, {}])("ignores a non-string %p", (value) =>
		expect(givenTarget(value)).toBeUndefined(),
	);
});

describe("mentionsAnything", () => {
	it.each(["study", "talk to", "go to", "use", "please study for two hours", "I want to practise"])(
		"%p names nothing",
		(input) => expect(mentionsAnything(input)).toBe(false),
	);
	it.each(["study charms", "go to the library", "talk to Hagrid", "use the wand"])(
		"%p names something",
		(input) => expect(mentionsAnything(input)).toBe(true),
	);
	it("does not count pronouns as naming something", () => {
		expect(mentionsAnything("ask him about it")).toBe(false);
		expect(mentionsAnything("go there")).toBe(false);
	});
});

describe("isEcho", () => {
	it("ignores case and punctuation", () => {
		expect(isEcho("Go!", "go")).toBe(true);
		expect(isEcho("library", "go to the library")).toBe(false);
	});
});

describe("cleanReply", () => {
	const reply = (r: object) => r as CommandReply;

	it("drops a target the sentence cannot contain", () => {
		expect(cleanReply(reply({ type: "STUDY", subjectId: "charms" }), "study").subjectId).toBeUndefined();
		expect(cleanReply(reply({ type: "TALK", npcId: "hagrid" }), "talk").npcId).toBeUndefined();
	});

	it("keeps a target when the sentence names something", () => {
		expect(cleanReply(reply({ type: "STUDY", subjectId: "potions" }), "study potions").subjectId).toBe("potions");
	});

	it("turns a pronoun target into the newest matching thing, or nothing", () => {
		const talk = reply({ type: "TALK", npcId: "her" });
		expect(cleanReply(talk, "ask her about the exam", view()).npcId).toBe("hermione_granger");
		expect(cleanReply(talk, "ask her about the exam", { ...view(), lastPerson: undefined }).npcId).toBeUndefined();
		expect(cleanReply(talk, "ask her about the exam").npcId).toBeUndefined();
	});

	it("uses the newest thing for a sentence that is only pronouns, whatever the model said", () => {
		expect(cleanReply(reply({ type: "TALK", npcId: "hagrid" }), "ask him about it", view()).npcId).toBe(
			"hermione_granger",
		);
		expect(cleanReply(reply({ type: "TALK", npcId: "hagrid" }), "ask him about it").npcId).toBeUndefined();
	});

	it("drops a duration that is not 1 to 24 whole hours", () => {
		expect(cleanReply(reply({ type: "REST", duration: 0 }), "rest").duration).toBeUndefined();
		expect(cleanReply(reply({ type: "REST", duration: 99 }), "rest").duration).toBeUndefined();
		expect(cleanReply(reply({ type: "REST", duration: 3 }), "rest 3 hours").duration).toBe(3);
	});

	it("keeps a topic the game knows and drops one it does not", () => {
		const base = { type: "TALK", npcId: "hagrid" };
		expect(
			cleanReply(reply({ ...base, conversationTopic: "magical_creatures" }), "ask hagrid about creatures")
				.conversationTopic,
		).toBe("magical_creatures");
		expect(
			cleanReply(reply({ ...base, conversationTopic: "the exam" }), "ask hagrid about the exam")
				.conversationTopic,
		).toBeUndefined();
	});

	it("trims the verb of an item action and drops a blank one", () => {
		expect(cleanReply(reply({ type: "INTERACT", itemId: "wand", actionType: " wave " }), "wave wand").actionType).toBe("wave");
		expect("actionType" in cleanReply(reply({ type: "INTERACT", itemId: "wand", actionType: "  " }), "wand")).toBe(false);
	});

	it("does not change the reply it was given", () => {
		const original = reply({ type: "REST", duration: 99 });
		cleanReply(original, "rest");
		expect(original.duration).toBe(99);
	});
});

describe("buildCommand", () => {
	const reply = (r: object) => r as CommandReply;

	it("builds each command with its real defaults", () => {
		expect(buildCommand(reply({ type: "MOVE", destinationId: "library" }), "x")).toEqual({ type: "MOVE", destinationId: "library" });
		expect(buildCommand(reply({ type: "TALK", npcId: "hagrid" }), "x")).toEqual({ type: "TALK", npcId: "hagrid" });
		expect(buildCommand(reply({ type: "TALK", npcId: "hagrid", conversationTopic: "family" }), "x")).toEqual({
			type: "TALK",
			npcId: "hagrid",
			conversationTopic: "family",
		});
		expect(buildCommand(reply({ type: "STUDY", subjectId: "charms" }), "x")).toEqual({ type: "STUDY", subjectId: "charms", duration: 1 });
		expect(buildCommand(reply({ type: "ATTEND_CLASS", subjectId: "charms", duration: 2 }), "x")).toEqual({ type: "ATTEND_CLASS", subjectId: "charms", duration: 2 });
		expect(buildCommand(reply({ type: "PRACTICE", spellId: "levitate" }), "x")).toEqual({ type: "PRACTICE", spellId: "levitate", duration: 1 });
		expect(buildCommand(reply({ type: "INTERACT", itemId: "wand" }), "x")).toEqual({ type: "INTERACT", itemId: "wand", actionType: "use" });
		expect(buildCommand(reply({ type: "REST" }), "x")).toEqual({ type: "REST", duration: 1 });
		expect(buildCommand(reply({ type: "ADVANCE_YEAR" }), "x")).toEqual({ type: "ADVANCE_YEAR" });
	});

	it("gives a nameless save or load the quick-save slots", () => {
		expect(buildCommand(reply({ type: "SAVE" }), "x")).toEqual({ type: "SAVE", filename: "quicksave" });
		expect(buildCommand(reply({ type: "LOAD" }), "x")).toEqual({ type: "LOAD", filename: "quicksave", fallbackFilename: "autosave" });
		expect(buildCommand(reply({ type: "LOAD", filename: "slot1" }), "x")).toEqual({ type: "LOAD", filename: "slot1" });
	});

	it.each([
		["MOVE", "destinationId", "Where do you want to go?"],
		["TALK", "npcId", "Who do you want to talk to?"],
		["STUDY", "subjectId", "Which subject do you want to study?"],
		["ATTEND_CLASS", "subjectId", "Which class do you want to attend?"],
		["PRACTICE", "spellId", "Which spell do you want to practise?"],
		["INTERACT", "itemId", "Which item do you mean?"],
	])("%s without %s asks the question instead of guessing", (type, _field, hint) => {
		expect(buildCommand(reply({ type }), "the input")).toEqual({ type: "UNKNOWN", input: "the input", hint });
	});

	it("passes the model's own UNKNOWN on, with the player's words", () => {
		expect(buildCommand(reply({ type: "UNKNOWN" }), "blah")).toEqual({ type: "UNKNOWN", input: "blah" });
	});
});

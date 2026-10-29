import { z } from "zod";
import {
	COMMANDS,
	COMMAND_TYPES,
	CommandReplySchema,
	CommandSchema,
	IN_WORLD_TYPES,
	LenientCommandReplySchema,
	TOPIC_IDS,
} from "../core/domain/commands/CommandDefinitions";
import { TOPICS } from "../core/domain/npc/TopicRegistry";
import { createCommandHandlers } from "../core/engine/handlers";

describe("the command definitions", () => {
	it("describe exactly the commands the Command union has", () => {
		const fromUnion = CommandSchema.options.map((o) => o.shape.type.value).sort();
		expect([...COMMAND_TYPES].sort()).toEqual(fromUnion);
	});

	it("each schema is for its own type", () => {
		for (const type of COMMAND_TYPES) {
			expect(COMMANDS[type].schema.shape.type.value).toBe(type);
		}
	});

	it("every command has a handler", () => {
		const handlers = createCommandHandlers({
			registry: {} as never,
			bus: {} as never,
			turnResolver: {} as never,
			advanceYear: {} as never,
			persistenceRepository: {} as never,
		});
		expect(Object.keys(handlers).sort()).toEqual([...COMMAND_TYPES].sort());
	});

	it("remember as turns only the in-world commands", () => {
		expect([...IN_WORLD_TYPES].sort()).toEqual(
			["ATTEND_CLASS", "INTERACT", "MOVE", "PRACTICE", "REST", "STUDY", "TALK"],
		);
	});

	it("name the field and kind of every target", () => {
		const targets = COMMAND_TYPES.filter((t) => COMMANDS[t].target).map(
			(t) => [t, COMMANDS[t].target!.field, COMMANDS[t].target!.kind],
		);
		expect(targets).toEqual([
			["MOVE", "destinationId", "place"],
			["TALK", "npcId", "person"],
			["STUDY", "subjectId", "subject"],
			["ATTEND_CLASS", "subjectId", "subject"],
			["PRACTICE", "spellId", "spell"],
			["INTERACT", "itemId", "item"],
		]);
		for (const type of COMMAND_TYPES) {
			const target = COMMANDS[type].target;
			if (target) expect(Object.keys(COMMANDS[type].schema.shape)).toContain(target.field);
		}
	});
});

describe("the schema the model is held to", () => {
	const json = z.toJSONSchema(CommandReplySchema) as any;
	const branches: any[] = json.oneOf ?? json.anyOf;
	const byType = (type: string) => branches.find((b) => b.properties.type.const === type);

	it("offers every command except the typed-only ones", () => {
		expect(branches.map((b) => b.properties.type.const).sort()).toEqual(
			COMMAND_TYPES.filter((t) => COMMANDS[t].modelFacing).sort(),
		);
		expect(byType("UNDO")).toBeUndefined();
	});

	it("asks for the target and nothing the game fills in itself", () => {
		expect(Object.keys(byType("MOVE").properties).sort()).toEqual(["destinationId", "type"]);
		expect(Object.keys(byType("REST").properties).sort()).toEqual(["duration", "type"]);
		expect(Object.keys(byType("LOAD").properties).sort()).toEqual(["filename", "type"]);
		expect(Object.keys(byType("UNKNOWN").properties)).toEqual(["type"]);
	});

	it("leaves every field but the type optional", () => {
		for (const b of branches) expect(b.required).toEqual(["type"]);
	});

	it("holds a conversation topic to the topics the game knows", () => {
		expect(byType("TALK").properties.conversationTopic.enum).toEqual(Object.keys(TOPICS));
		expect(TOPIC_IDS).toEqual(Object.keys(TOPICS));
	});

	it("parses a reply with only the type and the fields it was given", () => {
		expect(CommandReplySchema.parse({ type: "MOVE", destinationId: "library" })).toEqual({
			type: "MOVE",
			destinationId: "library",
		});
		expect(CommandReplySchema.safeParse({ type: "FLY" }).success).toBe(false);
		expect(CommandReplySchema.safeParse({ type: "TALK", conversationTopic: "the exam" }).success).toBe(false);
	});

	it("reads a stray topic leniently, so validation can drop it", () => {
		expect(
			LenientCommandReplySchema.parse({ type: "TALK", npcId: "hagrid", conversationTopic: "the exam" }),
		).toMatchObject({ conversationTopic: "the exam" });
	});
});

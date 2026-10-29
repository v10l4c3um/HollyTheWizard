import { z } from "zod";
import { TOPICS } from "../npc/TopicRegistry";

/**
 * The one place that says what a command is. Each command has a schema (the
 * typed command the game runs) and a little metadata. Everything else is
 * derived from this table: the `Command` type, the list of command types, the
 * schema the language model's reply is held to, the prompt's command list,
 * which commands are remembered as in-world turns, and what a missing target
 * is called.
 *
 * Add a command here and the compiler then points at every other place that
 * needs to know about it (the handler map, `buildCommand`).
 */

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

const Move = z.object({ type: z.literal("MOVE"), destinationId: z.string() });

const Talk = z.object({
	type: z.literal("TALK"),
	npcId: z.string(),
	conversationTopic: z.string().optional(),
});

const Study = z.object({
	type: z.literal("STUDY"),
	subjectId: z.string(),
	duration: z.number().optional(),
});

const AttendClass = z.object({
	type: z.literal("ATTEND_CLASS"),
	subjectId: z.string(),
	duration: z.number().optional(),
});

const Practice = z.object({
	type: z.literal("PRACTICE"),
	spellId: z.string(),
	duration: z.number().optional(),
});

const Interact = z.object({
	type: z.literal("INTERACT"),
	itemId: z.string(),
	actionType: z.string(),
});

const Rest = z.object({
	type: z.literal("REST"),
	duration: z.number(),
	locationId: z.string().optional(),
});

const Save = z.object({ type: z.literal("SAVE"), filename: z.string() });

const Load = z.object({
	type: z.literal("LOAD"),
	filename: z.string(),
	/** Used when `filename` does not exist (e.g. a bare "load"). */
	fallbackFilename: z.string().optional(),
});

const AdvanceYear = z.object({ type: z.literal("ADVANCE_YEAR") });

const Undo = z.object({ type: z.literal("UNDO") });

const Unknown = z.object({
	type: z.literal("UNKNOWN"),
	input: z.string(),
	/** Tells the player what was missing ("Where do you want to go?"). */
	hint: z.string().optional(),
});

export const CommandSchema = z.discriminatedUnion("type", [
	Move,
	Talk,
	Study,
	AttendClass,
	Practice,
	Interact,
	Rest,
	Save,
	Load,
	AdvanceYear,
	Undo,
	Unknown,
]);

export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command["type"];

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

/** What a command's target names; decides which things the game matches it against. */
export type TargetKind = "place" | "person" | "subject" | "spell" | "item";

export interface CommandTarget {
	/** The field of the command that holds the target. */
	field: string;
	kind: TargetKind;
	/** "Which spell?": what the player is asked for when it is missing. */
	missingHint: string;
}

export interface CommandDefinition {
	schema: z.ZodObject;
	/** One line for the language model's prompt. */
	summary: string;
	/** The model may answer with this command. (`UNDO` is only ever typed.) */
	modelFacing: boolean;
	/** Fields the game fills in itself; the model is never asked for them. */
	internalFields?: string[];
	/** A stricter schema for a field than the command's own, for the model's reply. */
	replyFields?: Record<string, z.ZodType>;
	target?: CommandTarget;
}

/** The topics a conversation can be about; anything else is not a topic. */
export const TOPIC_IDS = Object.keys(TOPICS) as [string, ...string[]];

export const COMMANDS: Record<CommandType, CommandDefinition> = {
	MOVE: {
		schema: Move,
		summary: "Go to, enter or visit a place.",
		modelFacing: true,
		target: { field: "destinationId", kind: "place", missingHint: "Where do you want to go?" },
	},
	TALK: {
		schema: Talk,
		summary: "Talk to, greet or ask a person (optionally about one of the known topics).",
		modelFacing: true,
		replyFields: { conversationTopic: z.enum(TOPIC_IDS) },
		target: { field: "npcId", kind: "person", missingHint: "Who do you want to talk to?" },
	},
	STUDY: {
		schema: Study,
		summary: "Study, revise or read up on a subject alone (duration in hours, only if said).",
		modelFacing: true,
		target: { field: "subjectId", kind: "subject", missingHint: "Which subject do you want to study?" },
	},
	ATTEND_CLASS: {
		schema: AttendClass,
		summary: "Attend, sit in on or go to a lesson, class or lecture of a subject (duration in hours, only if said).",
		modelFacing: true,
		target: { field: "subjectId", kind: "subject", missingHint: "Which class do you want to attend?" },
	},
	PRACTICE: {
		schema: Practice,
		summary: "Practise or cast a spell (duration in hours, only if said).",
		modelFacing: true,
		target: { field: "spellId", kind: "spell", missingHint: "Which spell do you want to practise?" },
	},
	INTERACT: {
		schema: Interact,
		summary: "Use an item (actionType: what to do with it, only if said).",
		modelFacing: true,
		target: { field: "itemId", kind: "item", missingHint: "Which item do you mean?" },
	},
	REST: {
		schema: Rest,
		summary: "Rest or wait, passing time (duration in hours, only if said).",
		modelFacing: true,
		internalFields: ["locationId"],
	},
	SAVE: {
		schema: Save,
		summary: "Save the game (filename, only if said).",
		modelFacing: true,
	},
	LOAD: {
		schema: Load,
		summary: "Load a saved game (filename, only if said).",
		modelFacing: true,
		internalFields: ["fallbackFilename"],
	},
	ADVANCE_YEAR: {
		schema: AdvanceYear,
		summary: "Only when the player asks to start the next school year.",
		modelFacing: true,
	},
	UNDO: {
		schema: Undo,
		summary: "Take back the last action.",
		modelFacing: false,
	},
	UNKNOWN: {
		schema: Unknown,
		summary: "The sentence is not a command the game understands.",
		modelFacing: true,
		internalFields: ["input", "hint"],
	},
};

export const COMMAND_TYPES = Object.keys(COMMANDS) as CommandType[];

/**
 * The commands about the world rather than the game itself. These go to the
 * turn rules (`TurnResolver`) and are remembered as turns, so "again" and
 * "go back" can use them.
 */
export const IN_WORLD_COMMAND_TYPES = [
	"MOVE",
	"TALK",
	"STUDY",
	"ATTEND_CLASS",
	"PRACTICE",
	"INTERACT",
	"REST",
] as const;

export type InWorldCommand = Extract<
	Command,
	{ type: (typeof IN_WORLD_COMMAND_TYPES)[number] }
>;

export const IN_WORLD_TYPES: ReadonlySet<CommandType> = new Set(IN_WORLD_COMMAND_TYPES);

// ---------------------------------------------------------------------------
// What the model may reply
// ---------------------------------------------------------------------------

/**
 * The schema of one command as the model sees it: `type` plus the fields it
 * can know, every one optional ("leave it out if the player did not say").
 */
function replySchemaOf(type: CommandType, strict: boolean): z.ZodObject {
	const definition = COMMANDS[type];
	const shape: Record<string, z.ZodType> = { type: z.literal(type) };
	for (const [key, field] of Object.entries(definition.schema.shape)) {
		if (key === "type" || definition.internalFields?.includes(key)) continue;
		const stricter = strict ? definition.replyFields?.[key] : undefined;
		shape[key] = (stricter ?? (strict ? (field as z.ZodType) : lenient(field as z.ZodType))).optional();
	}
	return z.object(shape);
}

/** Lenient reading: a number the model wrote as text ("3") is still a number. */
function lenient(field: z.ZodType): z.ZodType {
	const inner = field instanceof z.ZodOptional ? field.unwrap() : field;
	return inner instanceof z.ZodNumber ? z.coerce.number() : field;
}

const MODEL_TYPES = COMMAND_TYPES.filter((type) => COMMANDS[type].modelFacing);

const union = (strict: boolean) =>
	z.discriminatedUnion(
		"type",
		MODEL_TYPES.map((type) => replySchemaOf(type, strict)) as unknown as [
			z.ZodObject,
			z.ZodObject,
			...z.ZodObject[],
		],
	);

/**
 * The schema the model's reply is held to: one object, discriminated by
 * `type`. This is what is sent to the model (so, for example, a conversation
 * topic can only be one of the known ones).
 */
export const CommandReplySchema = union(true);

/**
 * The same shape, read leniently: a stray value in a field the game can check
 * itself (an unknown topic) does not throw the whole reply away.
 */
export const LenientCommandReplySchema = union(false);

export type CommandReply = { type: CommandType } & Record<string, unknown>;

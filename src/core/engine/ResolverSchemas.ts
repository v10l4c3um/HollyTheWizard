import { z } from "zod";

export const INTENT_TYPES = [
	"MOVE",
	"TALK",
	"STUDY",
	"ATTEND_CLASS",
	"PRACTICE",
	"INTERACT",
	"REST",
	"SAVE",
	"LOAD",
	"ADVANCE_YEAR",
] as const;

export type IntentType = (typeof INTENT_TYPES)[number];

/** Zod schema for the intent-classification response. */
export const IntentResponseSchema = z.object({
	intent: z.enum([...INTENT_TYPES]),
});

export type IntentResponse = z.infer<typeof IntentResponseSchema>;

/** Zod schemas for the argument-extraction response, keyed by intent.
 *  `null` means no arguments are needed (no second LLM call). */
export const ARGUMENT_SCHEMAS = {
	MOVE: z.object({
		target: z.string(),
	}),
	TALK: z.object({
		target: z.string(),
		conversationTopic: z.string().optional(),
	}),
	STUDY: z.object({
		target: z.string(),
		duration: z.coerce.number().optional(),
	}),
	ATTEND_CLASS: z.object({
		target: z.string(),
		duration: z.coerce.number().optional(),
	}),
	PRACTICE: z.object({
		target: z.string(),
		duration: z.coerce.number().optional(),
	}),
	INTERACT: z.object({
		target: z.string(),
		actionType: z.string().optional(),
	}),
	REST: z.object({
		target: z.string().optional(),
		duration: z.coerce.number().optional(),
	}),
	SAVE: z.object({
		target: z.string().optional(),
	}),
	LOAD: z.object({
		target: z.string().optional(),
	}),
	ADVANCE_YEAR: null,
} as const satisfies Record<IntentType, z.ZodObject<z.ZodRawShape> | null>;

export type ArgumentSchema = (typeof ARGUMENT_SCHEMAS)[IntentType];

/** Union of all possible argument fields returned from any intent schema. */
export interface ParsedArguments {
	target?: string;
	duration?: number;
	conversationTopic?: string;
	actionType?: string;
}

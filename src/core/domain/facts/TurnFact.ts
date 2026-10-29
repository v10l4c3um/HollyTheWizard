import { z } from "zod";

/**
 * What happened in a turn, as data. Rules return facts; `presentation/facts`
 * is the one place that turns them into English. Facts carry ids and display
 * names so neither the log nor the presentation needs the registry.
 */

const Ref = z.object({ id: z.string(), name: z.string() });
export type Ref = z.infer<typeof Ref>;

export const ConversationResultSchema = z.enum([
	"success",
	"partial",
	"refusal",
	"deflection",
	"reveal",
	"invitation",
]);

const Moved = z.object({
	kind: z.literal("moved"),
	from: Ref,
	to: Ref,
	firstVisit: z.boolean(),
	/** Places whose way the player saw on arriving. */
	discovered: z.array(Ref),
});

const MoveBlocked = z.object({
	kind: z.literal("move-blocked"),
	from: Ref,
	to: Ref,
	/** Names of the places the player can go from `from`. */
	exits: z.array(z.string()),
});

const Conversation = z.object({
	kind: z.literal("conversation"),
	npc: Ref,
	topic: z.string().optional(),
	result: ConversationResultSchema,
});

const Studied = z.object({
	kind: z.literal("studied"),
	subject: Ref,
	hours: z.number(),
	gain: z.number(),
	revealed: z.array(Ref),
});

const Attended = z.object({
	kind: z.literal("attended"),
	subject: Ref,
	lesson: z.object({ id: z.string(), title: z.string(), topic: z.string() }),
	/** Subject knowledge the lesson gave, by subject id. */
	gains: z.array(z.object({ subject: z.string(), amount: z.number() })),
	revealed: z.array(Ref),
	learned: z.array(Ref),
});

const Practiced = z.object({
	kind: z.literal("practiced"),
	spell: Ref,
	hours: z.number(),
	attempts: z.number(),
	successes: z.number(),
	proficiency: z.number(),
	tier: z.string(),
	/** True only on the turn the spell became mastered. */
	mastered: z.boolean(),
});

const Interacted = z.object({
	kind: z.literal("interacted"),
	item: Ref,
	verb: z.string(),
});

const Rested = z.object({
	kind: z.literal("rested"),
	hours: z.number(),
	place: Ref,
});

const YearAdvanced = z.object({
	kind: z.literal("year-advanced"),
	from: z.number(),
	to: z.number(),
});

/** Not a valid request: nothing happened and no time passed. */
const Refused = z.discriminatedUnion("reason", [
	z.object({ reason: z.literal("nowhere") }),
	z.object({
		reason: z.literal("unknown-place"),
		input: z.string(),
		from: z.string(),
		exits: z.array(z.string()),
	}),
	z.object({ reason: z.literal("not-discovered"), place: z.string() }),
	z.object({ reason: z.literal("unknown-person"), input: z.string() }),
	z.object({ reason: z.literal("person-absent"), npc: z.string() }),
	z.object({ reason: z.literal("no-curriculum") }),
	z.object({ reason: z.literal("no-class"), subject: z.string() }),
	z.object({ reason: z.literal("class-elsewhere"), subject: z.string(), room: z.string() }),
	z.object({ reason: z.literal("already-attended"), subject: z.string(), period: z.string() }),
	z.object({ reason: z.literal("no-more-lessons"), subject: z.string() }),
	z.object({ reason: z.literal("unknown-spell"), input: z.string() }),
	z.object({ reason: z.literal("spell-not-learned"), spell: z.string() }),
	z.object({ reason: z.literal("no-item"), input: z.string() }),
	z.object({ reason: z.literal("final-year") }),
]);
export type Refusal = z.infer<typeof Refused>;

export const TurnFactSchema = z.union([
	Moved,
	MoveBlocked,
	Conversation,
	Studied,
	Attended,
	Practiced,
	Interacted,
	Rested,
	YearAdvanced,
	z.object({ kind: z.literal("refused") }).and(Refused),
]);

export type TurnFact = z.infer<typeof TurnFactSchema>;
export type FactOf<K extends TurnFact["kind"]> = Extract<TurnFact, { kind: K }>;

/** How many facts the game state keeps. */
export const MAX_RECENT_FACTS = 20;

/** The fact for a refused request. */
export function refused(refusal: Refusal): TurnFact {
	return { kind: "refused", ...refusal };
}

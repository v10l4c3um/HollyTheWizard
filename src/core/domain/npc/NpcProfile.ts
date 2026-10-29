import { z } from "zod";

/**
 * Authored static conversation metadata for an NPC. Kept separate from the
 * NPC class so authored content stays decoupled from domain objects. Does NOT
 * import from TopicRegistry to avoid circular deps (topic ids are checked by
 * the content linter).
 */
export const NpcProfileSchema = z.strictObject({
	npcId: z.string().min(1),
	/** Personality traits (e.g. "strict", "sarcastic"). Used for event-mood modifiers and narration tags. */
	traits: z.array(z.string()),
	/** Topic ids this NPC will NEVER discuss: triggers immediate refusal. */
	hardBoundaries: z.array(z.string()),
	/** topicId → score modifier −2..+2. */
	topicAffinities: z.record(z.string(), z.number()),
	/** locationId → mood offset −2..+2. */
	locationModifiers: z.record(z.string(), z.number()).optional(),
});

export type NpcConversationProfile = z.infer<typeof NpcProfileSchema>;

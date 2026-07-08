/**
 * Authored static conversation metadata for an NPC.
 * Kept separate from the NPC class so authored content stays decoupled from
 * domain objects. Does NOT import from TopicRegistry to avoid circular deps.
 */
export interface NpcConversationProfile {
	npcId: string;
	/** Personality traits (e.g. "strict", "sarcastic"). Used for event-mood
	 *  modifiers and narration tags. */
	traits: string[];
	/** Topic ids this NPC will NEVER discuss — triggers immediate refusal. */
	hardBoundaries: string[];
	/** topicId → score modifier −2..+2. */
	topicAffinities: Record<string, number>;
	/** locationId → mood offset −2..+2. */
	locationModifiers?: Record<string, number>;
}

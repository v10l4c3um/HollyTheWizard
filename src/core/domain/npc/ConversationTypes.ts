/**
 * Shared conversation primitive types.
 * No imports — this file is intentionally dependency-free so that both
 * `Conversation.ts` and `GameEffects.ts` can import from it without
 * creating a circular dependency.
 */

export type ConversationResult =
	| "success"
	| "partial"
	| "refusal"
	| "deflection"
	| "reveal"
	| "invitation";

export interface ConversationMemoryEntry {
	topic?: string;
	result: ConversationResult;
	locationId: string;
	/** World-clock minutes at the time of the conversation. */
	turnIndex: number;
	/** Narration / diagnostic tags produced by the evaluator. */
	tags: string[];
}

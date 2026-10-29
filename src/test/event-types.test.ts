import { event, GameEvents } from "../core/domain/events/GameEvents";
import { ConversationResult } from "../core/domain/npc/ConversationTypes";

/**
 * These are checked by the compiler (`npx tsc --noEmit`): an unused
 * `@ts-expect-error` is itself an error, so loosening an event type back to
 * `string` breaks the build.
 */
describe("event payloads use the game's own unions", () => {
	it("rejects values outside the closed sets", () => {
		// @ts-expect-error not a way a spell is learned
		event("SpellLearned", { spellId: "lumos", source: "dream" });
		// @ts-expect-error not a conversation result
		event("ConversationResolved", { npcId: "a", topic: undefined, result: "shrug", narrationTags: [], score: 0 });
		// @ts-expect-error not a topic category
		event("TopicDiscussed", { npcId: "a", topicId: "t", category: "weather" });
		// @ts-expect-error not an in-world command
		event("ActionResolved", { actionType: "DANCE", locationId: "x", outcome: "success" });
	});

	it("accepts every conversation result", () => {
		const all: Record<ConversationResult, true> = {
			success: true,
			partial: true,
			refusal: true,
			deflection: true,
			reveal: true,
			invitation: true,
		};
		for (const result of Object.keys(all) as ConversationResult[]) {
			const payload: GameEvents["ConversationResolved"] = {
				npcId: "a",
				topic: undefined,
				result,
				narrationTags: [],
				score: 0,
			};
			expect(event("ConversationResolved", payload).payload).toBe(payload);
		}
	});
});

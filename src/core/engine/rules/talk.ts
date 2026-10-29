import { InWorldCommand } from "../../domain/commands/CommandDefinitions";
import { event } from "../../domain/events/GameEvents";
import { ConversationContext, evaluateConversation } from "../../domain/npc/Conversation";
import { resolveTopic } from "../../domain/npc/TopicRegistry";
import { momentOf, npcLocation } from "../../domain/npc/Presence";
import { TurnContext } from "./context";
import { done, refusal } from "./results";

type Talk = Extract<InWorldCommand, { type: "TALK" }>;

export function talk(
	{ npcId, conversationTopic: topic }: Talk,
	ctx: TurnContext,
) {
	const { state, registry } = ctx;
	const npc = registry.getNPC(npcId);
	if (!npc) return refusal({ reason: "unknown-person", input: npcId });
	if (npcLocation(npc, momentOf(state, registry)) !== state.currentLocationId) {
		return refusal({ reason: "person-absent", npc: npc.name });
	}

	// First contact: no relationship record yet, so the evaluator gets zeroed stats.
	const relationship = state.relationships[npcId];
	const locationId = state.currentLocationId;
	const topicDef = resolveTopic(topic);
	const npcProfile = registry.getNpcProfile(npcId);

	const conversation: ConversationContext = {
		npcId,
		topic,
		topicDef,
		npcProfile,
		isPrivate: registry.getLocation(locationId)?.isPrivate ?? false,
		locationId,
		relationship: relationship ?? {
			trust: 0,
			affection: 0,
			respect: 0,
			comfort: 0,
			attraction: 0,
			loyalty: 0,
			resentment: 0,
			fear: 0,
			envy: 0,
			applyDelta: () => {},
		},
		flags: state.flags,
		recentHistory: state.conversationHistory[npcId] ?? [],
		// The last 10 facts feed the mood-modifier phase.
		recentFacts: state.recentFacts.slice(-10),
		turnIndex: state.worldClock.getTotalMinutes(),
	};

	const outcome = evaluateConversation(conversation);
	ctx.apply(outcome.effects);

	const topicId = topic ?? "general";
	const emits = [
		event("NpcTalkedTo", { npcId, topic }),
		event("ConversationResolved", {
			npcId,
			topic,
			result: outcome.result,
			narrationTags: outcome.narrationTags ?? [],
			score: outcome.score,
		}),
		event("TopicDiscussed", { npcId, topicId, category: topicDef.category }),
	];
	if (outcome.result === "refusal" && npcProfile?.hardBoundaries.includes(topic ?? "")) {
		emits.push(event("BoundaryHit", { npcId, topicId }));
	}
	if (outcome.result === "reveal" || outcome.result === "invitation") {
		emits.push(event("RevealTriggered", { npcId, topicId }));
	}

	return done({
		fact: {
			kind: "conversation",
			npc: { id: npcId, name: npc.name },
			topic,
			result: outcome.result,
		},
		minutes: 15,
		effects: outcome.effects,
		emits,
	});
}

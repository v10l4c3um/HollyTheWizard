import { RelationshipDelta } from "../npc/Relationship";
import { AttributeStatsDelta, ResourceStatsDelta } from "../player/PlayerStats";
import { ConversationMemoryEntry } from "../npc/ConversationTypes";

/** What taught the spell. The player never triggers learning directly. */
export type SpellLearnSource = "class" | "item" | "trainer";

export type GameEffect =
	| { type: "ProgressDelta"; track: string; delta: number; reason: string }
	| {
			type: "SpellLearned";
			spellId: string;
			source: SpellLearnSource;
			reason: string;
	  }
	| {
			type: "AttributeDelta";
			delta: AttributeStatsDelta;
			reason: string;
	  }
	| {
			type: "ResourceDelta";
			delta: ResourceStatsDelta;
			reason: string;
	  }
	| {
			type: "RelationshipDelta";
			npcId: string;
			delta: RelationshipDelta;
			reason: string;
	  }
	| {
			type: "FlagSet";
			flagId: string;
			value: boolean | number | string;
			reason: string;
	  }
	| { type: "InventoryDelta"; itemId: string; delta: number; reason: string }

	// New social/content effects
	| {
			type: "TopicUnlocked";
			npcId: string;
			topicId: string;
			reason: string;
	  }
	| {
			type: "ClueRevealed";
			clueId: string;
			sourceNpcId?: string;
			reason: string;
	  }
	| {
			type: "RumorLearned";
			rumorId: string;
			sourceNpcId?: string;
			reason: string;
	  }
	| {
			type: "SceneInvitationCreated";
			invitationId: string;
			npcId: string;
			sceneType:
				| "study"
				| "walk"
				| "meeting"
				| "duel"
				| "letter"
				| "private_talk";
			validUntilMinutes?: number;
			reason: string;
	  }
	| {
			type: "ConversationMemoryRecorded";
			npcId: string;
			entry: ConversationMemoryEntry;
	  };
// ---------------------------------------------------------------------------
// Helper constructors (see docs/event-effect-conversion-plan.md, Step 1)
// ---------------------------------------------------------------------------

export function progressDelta(
	track: string,
	delta: number,
	reason: string,
): GameEffect {
	return { type: "ProgressDelta", track, delta, reason };
}

export function attributeDelta(
	delta: AttributeStatsDelta,
	reason: string,
): GameEffect {
	return {
		type: "AttributeDelta",
		delta,
		reason,
	};
}

export function resourceDelta(
	delta: ResourceStatsDelta,
	reason: string,
): GameEffect {
	return { type: "ResourceDelta", delta, reason };
}

export function relationshipDelta(
	npcId: string,
	delta: RelationshipDelta,
	reason: string,
): GameEffect {
	return { type: "RelationshipDelta", npcId, delta, reason };
}

export function flagSet(
	flagId: string,
	value: boolean | number | string,
	reason: string,
): GameEffect {
	return { type: "FlagSet", flagId, value, reason };
}

export function inventoryDelta(
	itemId: string,
	delta: number,
	reason: string,
): GameEffect {
	return { type: "InventoryDelta", itemId, delta, reason };
}

export function spellLearned(
	spellId: string,
	source: SpellLearnSource,
	reason: string,
): GameEffect {
	return { type: "SpellLearned", spellId, source, reason };
}

/** Track helper: "subject.<id>.knowledge" */
export function subjectKnowledgeTrack(subjectId: string): string {
	return `subject.${subjectId}.knowledge`;
}

/** Track helper: "spell.<id>.proficiency" */
export function spellProficiencyTrack(spellId: string): string {
	return `spell.${spellId}.proficiency`;
}

export function topicUnlocked(
	npcId: string,
	topicId: string,
	reason: string,
): GameEffect {
	return { type: "TopicUnlocked", npcId, topicId, reason };
}

export function clueRevealed(
	clueId: string,
	reason: string,
	sourceNpcId?: string,
): GameEffect {
	return { type: "ClueRevealed", clueId, sourceNpcId, reason };
}

export function rumorLearned(
	rumorId: string,
	reason: string,
	sourceNpcId?: string,
): GameEffect {
	return { type: "RumorLearned", rumorId, sourceNpcId, reason };
}

export function sceneInvitationCreated(
	invitationId: string,
	npcId: string,
	sceneType: "study" | "walk" | "meeting" | "duel" | "letter" | "private_talk",
	reason: string,
	validUntilMinutes?: number,
): GameEffect {
	return {
		type: "SceneInvitationCreated",
		invitationId,
		npcId,
		sceneType,
		validUntilMinutes,
		reason,
	};
}

export function conversationMemoryRecorded(
	npcId: string,
	entry: ConversationMemoryEntry,
): GameEffect {
	return { type: "ConversationMemoryRecorded", npcId, entry };
}

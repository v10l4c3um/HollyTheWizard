import { RelationshipDelta } from "../npc/Relationship";
import { AttributeStatsDelta, ResourceStatsDelta } from "../player/PlayerStats";

export type GameEffect =
	| { type: "ProgressDelta"; track: string; delta: number; reason: string }
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
	| { type: "InventoryDelta"; itemId: string; delta: number; reason: string };

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

/** Track helper: "subject.<id>.knowledge" */
export function subjectKnowledgeTrack(subjectId: string): string {
	return `subject.${subjectId}.knowledge`;
}

/** Track helper: "spell.<id>.proficiency" */
export function spellProficiencyTrack(spellId: string): string {
	return `spell.${spellId}.proficiency`;
}

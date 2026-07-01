import { AttributeId } from "../player/Attributes";

export type GameEffect =
	| { type: "ProgressDelta"; track: string; delta: number; reason: string }
	| {
			type: "AttributeDelta";
			attributeId: AttributeId;
			delta: number;
			reason: string;
	  }
	| {
			type: "ResourceDelta";
			resourceId: string;
			delta: number;
			reason: string;
	  }
	| {
			type: "RelationshipDelta";
			npcId: string;
			axis: string;
			delta: number;
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
	attributeId: AttributeId,
	delta: number,
	reason: string,
): GameEffect {
	return { type: "AttributeDelta", attributeId, delta, reason };
}

export function resourceDelta(
	resourceId: string,
	delta: number,
	reason: string,
): GameEffect {
	return { type: "ResourceDelta", resourceId, delta, reason };
}

export function relationshipDelta(
	npcId: string,
	axis: string,
	delta: number,
	reason: string,
): GameEffect {
	return { type: "RelationshipDelta", npcId, axis, delta, reason };
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

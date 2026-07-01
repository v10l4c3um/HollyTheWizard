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

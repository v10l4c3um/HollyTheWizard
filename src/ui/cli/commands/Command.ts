export type Command =
	| { type: "MOVE"; destinationId: string }
	| {
			type: "TALK";
			npcId: string;
			conversationTopic?: string;
	  }
	| { type: "STUDY"; spellId: string; duration?: number }
	| { type: "INTERACT"; itemId: string; actionType: string }
	| {
			type: "REST";
			duration: number;
			locationId?: string;
	  }
	| { type: "SAVE"; filename: string }
	| { type: "LOAD"; filename: string };

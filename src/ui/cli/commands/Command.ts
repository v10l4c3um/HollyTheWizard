export type Command =
	| { type: "MOVE"; destinationId: string }
	| {
			type: "TALK";
			npcId: string;
			conversationTopic?: string;
	  }
	| { type: "STUDY"; classId: string }
	| { type: "INTERACT"; itemId: string; actionType: string }
	| {
			type: "REST";
			duration: number;
			locationId?: string;
	  }
	| { type: "SAVE"; filename: string }
	| { type: "LOAD"; filename: string }
	| { type: "PRACTICE"; spellId: string; duration?: number };

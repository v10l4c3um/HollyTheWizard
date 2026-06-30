import { SubjectType } from "../../../core/domain/quest/Curriculum";

export type Command =
	| { type: "MOVE"; destinationId: string }
	| {
			type: "TALK";
			npcId: string;
			conversationTopic?: string;
	  }
	| { type: "STUDY"; subjectId: string; duration?: number }
	| { type: "ATTEND_CLASS"; subjectId: string; duration?: number }
	| { type: "INTERACT"; itemId: string; actionType: string }
	| {
			type: "REST";
			duration: number;
			locationId?: string;
	  }
	| { type: "SAVE"; filename: string }
	| { type: "LOAD"; filename: string }
	| { type: "PRACTICE"; spellId: string; duration?: number }
	| { type: "ADVANCE_YEAR" };

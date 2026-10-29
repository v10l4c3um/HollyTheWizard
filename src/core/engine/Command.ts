import { SubjectType } from "../domain/quest/Curriculum";

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
	| {
			type: "LOAD";
			filename: string;
			/** Used when `filename` does not exist (e.g. a bare "load"). */
			fallbackFilename?: string;
	  }
	| { type: "PRACTICE"; spellId: string; duration?: number }
	| { type: "ADVANCE_YEAR" }
	/** Takes back the last turn. Only the fast path produces it. */
	| { type: "UNDO" }
	/** The input could not be turned into any command (model down, slow or unparseable). */
	| { type: "UNKNOWN"; input: string };

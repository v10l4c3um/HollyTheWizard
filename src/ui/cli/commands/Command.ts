import { CommandType } from "../../../types";

export interface Command {
	type: CommandType;
	destination?: string;
	npcName?: string;
	spellName?: string;
	targetName?: string;
	duration?: number;
	filename?: string;
	distance?: number;
	conversationTopic?: string;
	actionType?: string;
	location?: string;
	execute(): Promise<void>;
}

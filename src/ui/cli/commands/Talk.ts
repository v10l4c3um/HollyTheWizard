import { CommandType } from "../../../types";
import { Command } from "./Command";

export class TalkCommand implements Command {
	type: CommandType = CommandType.TALK;
	npcName: string;
	conversationTopic?: string;

	constructor(npcName: string, conversationTopic?: string) {
		this.npcName = npcName;
		this.conversationTopic = conversationTopic;
	}

	async execute(): Promise<void> {
		const topic = this.conversationTopic
			? ` about ${this.conversationTopic}`
			: "";
		console.log(`Talking to ${this.npcName}${topic}`);
	}
}

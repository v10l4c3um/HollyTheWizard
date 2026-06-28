import { CommandType } from "../../../types";
import { Command } from "./Command";

export class StudyCommand implements Command {
	type: CommandType = CommandType.STUDY;
	spellName: string;
	duration: number;

	constructor(spellName: string, duration: number = 1) {
		this.spellName = spellName;
		this.duration = duration;
	}

	async execute(): Promise<void> {
		console.log(`Studying ${this.spellName} for ${this.duration} hour(s)`);
	}
}

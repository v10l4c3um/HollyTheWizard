import { CommandType } from "../../../types";
import { Command } from "./Command";

export class SaveCommand implements Command {
	type: CommandType = CommandType.SAVE;
	filename: string;
	timestamp: number;

	constructor(filename: string = "autosave") {
		this.filename = filename;
		this.timestamp = Date.now();
	}

	async execute(): Promise<void> {
		console.log(
			`Saving game to ${this.filename} (${new Date(this.timestamp).toISOString()})`,
		);
	}
}

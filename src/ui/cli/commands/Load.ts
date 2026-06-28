import { CommandType } from "../../../types";
import { Command } from "./Command";

export class LoadCommand implements Command {
	type: CommandType = CommandType.LOAD;
	filename: string;

	constructor(filename: string = "autosave") {
		this.filename = filename;
	}

	async execute(): Promise<void> {
		console.log(`Loading game from ${this.filename}`);
	}
}

import { CommandType } from "../../../types";
import { Command } from "./Command";

export class RestCommand implements Command {
	type: CommandType = CommandType.REST;
	duration: number;
	location: string;

	constructor(duration: number = 1, location: string = "current location") {
		this.duration = duration;
		this.location = location;
	}

	async execute(): Promise<void> {
		console.log(`Resting for ${this.duration} hour(s) at ${this.location}`);
	}
}

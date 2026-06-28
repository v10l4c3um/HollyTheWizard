import { CommandType } from "../../../types";
import { Command } from "./Command";

export class MoveCommand implements Command {
	type: CommandType = CommandType.MOVE;
	destination: string;
	distance: number;

	constructor(destination: string, distance: number = 1) {
		this.destination = destination;
		this.distance = distance;
	}

	async execute(): Promise<void> {
		console.log(
			`Moving to ${this.destination} (distance: ${this.distance} units)`,
		);
	}
}

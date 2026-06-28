import { CommandType } from "../../../types";
import { Command } from "./Command";

export class InteractCommand implements Command {
	type: CommandType = CommandType.INTERACT;
	targetName: string;
	actionType: string;

	constructor(targetName: string, actionType: string = "use") {
		this.targetName = targetName;
		this.actionType = actionType;
	}

	async execute(): Promise<void> {
		console.log(
			`${this.actionType.charAt(0).toUpperCase() + this.actionType.slice(1)} ${this.targetName}`,
		);
	}
}

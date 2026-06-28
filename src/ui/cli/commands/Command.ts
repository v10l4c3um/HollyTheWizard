import { CommandType } from "../../../types";

export interface Command {
	type: CommandType;
	execute(): Promise<void>;
}

import GameState from "./core/domain/world/GameState";

export interface IGameEngine {
	state: GameState;
	handleCommand(input: string): Promise<GameState>;
}

export enum CommandType {
	MOVE = "MOVE",
	TALK = "TALK",
	STUDY = "STUDY",
	INTERACT = "INTERACT",
	REST = "REST",
	SAVE = "SAVE",
	LOAD = "LOAD",
}

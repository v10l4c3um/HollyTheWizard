import GameState from "./core/domain/world/GameState";

export interface IGameEngine {
	state: GameState;
	handleCommand(input: string): Promise<GameState>;
}
